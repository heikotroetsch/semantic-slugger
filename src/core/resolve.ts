/**
 * Store contract, the sans-IO request protocol and the resolve generator (SPEC 13.3, 13.4).
 * The generator yields store requests; drivers answer them (sync `taken` set or an async store).
 * `null` answers mean "the store cannot answer" (a lower tier).
 */

import type { ResolvedConfig } from '../config.ts'
import { ExhaustedError } from '../errors.ts'
import type { Segment, SlugReason } from '../result.ts'
import type { Doc } from './analyze.ts'
import type { Compiled } from './compile.ts'
import { isIn } from './concepts.ts'
import { emptyPath } from './empty.ts'
import { type Candidate, type FitSeg, fitBody, refitWithTail } from './fit.ts'
import { assertInvariants } from './invariants.ts'
import { buildLadder, type Laddered, type RungKind } from './ladder.ts'
import { type Ranked, rankConcepts } from './rank.ts'
import { keyFor, makeTail, tailNeed } from './tail.ts'

export type MaybePromise<T> = T | Promise<T>
export interface AbortSignalLike {
  readonly aborted: boolean
  readonly reason?: unknown
}
export interface StoreContext {
  readonly scope: string
  readonly signal?: AbortSignalLike
}

export interface SlugRecord {
  id: string
  /** '' for opaque, the fallback word for empty titles. */
  body: string
  /** Stored stems (SPEC 8.2): lexicon-free, plain or hashed. */
  stems: readonly string[]
  /** Hex SipHash(keyFor(cfg), canonical title), 16 hex chars. */
  titleKey: string
  algorithm: 1
}

export interface SlugStore {
  /** Required. true if the id is taken in this scope (including retired rows). */
  exists(id: string, ctx: StoreContext): MaybePromise<boolean>
  /** Returns the taken ids. */
  existsMany?(ids: readonly string[], ctx: StoreContext): MaybePromise<Iterable<string>>
  /** Rows in this scope with this exact body. Enables tier B. */
  countBody?(body: string, ctx: StoreContext): MaybePromise<number>
  countBodies?(
    bodies: readonly string[],
    ctx: StoreContext,
  ): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>
  /** Document frequency of a stored stem in this scope. Enables rarity ranking. */
  countStem?(stem: string, ctx: StoreContext): MaybePromise<number>
  countStems?(
    stems: readonly string[],
    ctx: StoreContext,
  ): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>
  total?(ctx: StoreContext): MaybePromise<number>
  /** Rows sharing a body, with their stored stems. Enables tier C (smart re-pick). Sorted by id asc. */
  findByBody?(
    body: string,
    ctx: StoreContext,
    limit: number,
  ): MaybePromise<readonly { id: string; stems: readonly string[] }[]>
  /** Write path for createUnique without an insert callback. */
  insert?(rec: SlugRecord, ctx: StoreContext): MaybePromise<'inserted' | 'conflict'>
  isConflict?(error: unknown): boolean
}

/** Requests the resolver yields to its driver (SPEC 13.4). */
export type Req =
  | { op: 'stats'; stems: string[] }
  | { op: 'countBodies'; bodies: string[] }
  | { op: 'findByBody'; body: string; limit: number }
  | { op: 'exists'; ids: string[] }

export interface Stats {
  df: ReadonlyMap<string, number>
  N?: number
}

/** Answers per request kind. `null` means the store cannot answer (lower tier). */
export interface ReqAnswer {
  stats: Stats | null
  countBodies: ReadonlyMap<string, number> | null
  findByBody: readonly { id: string; stems: readonly string[] }[] | null
  exists: ReadonlySet<string>
}

/** The ranked pool with ladders and the fit result, for `explain()` and the corpus report. */
export interface Plan {
  readonly ranked: Ranked
  /** Every ranked concept with its ladder, in rank order. */
  readonly ladders: readonly Laddered[]
  readonly pool: readonly Laddered[]
  /** Best candidates of the first fit (SPEC 12). */
  readonly cands: readonly Candidate[]
  /** The candidate behind the result. */
  readonly chosen: Candidate
}

export interface ResolveOut {
  id: string
  body: string
  tail: string
  tailIndex: number
  reason: SlugReason
  segments: readonly Segment[]
  /** The body changed when a tail was added (warning `tail-grown`, SPEC 13.2). */
  tailGrown?: boolean
  /** Not set on the empty and opaque path. */
  plan?: Plan
}

/** The answer type for any request; drivers return the field that matches `req.op`. */
export type AnyAnswer = ReqAnswer[keyof ReqAnswer]

// ---------------------------------------------------------------------------------------------
// The resolve generator (SPEC 13.4)
// ---------------------------------------------------------------------------------------------

const BATCH = 8
const FIND_LIMIT = 20

/** Rank the concepts with the store answers, build the ladders and the pool (SPEC 10, 11). */
export function rankPool(
  doc: Doc,
  stats: Stats | null,
  cfg: ResolvedConfig,
  comp: Compiled,
  diff?: ReadonlySet<string>,
): { ranked: Ranked; ladders: Laddered[]; pool: Laddered[] } {
  const cache = new Map<object, Laddered>()
  const ladderOf = (c: Ranked['concepts'][number]): Laddered => {
    let l = cache.get(c)
    if (l === undefined) {
      l = buildLadder(c, cfg, comp)
      cache.set(c, l)
    }
    return l
  }
  const ranked = rankConcepts(doc.concepts, cfg, {
    stats,
    ...(diff !== undefined ? { diff } : {}),
    hasRung: (c) => c.cls === 'model' || ladderOf(c).ladder.length > 0,
  })
  const ladders = ranked.concepts.map(ladderOf)
  const pool = ranked.pool.map(ladderOf)
  return { ranked, ladders, pool }
}

const RUNG_OF: Readonly<Record<RungKind, NonNullable<Segment['rung']>>> = {
  lexicon: 'lexicon',
  joined: 'lexicon',
  full: 'full',
  number: 'number',
  code: 'full',
  morph: 'morph',
  head: 'morph',
  coda: 'coda',
  syll: 'syll',
  skeleton: 'skeleton',
}

/** Public segments of a candidate body (SPEC 16.3). */
export function publicSegments(segs: readonly FitSeg[]): Segment[] {
  return segs.map((s) => {
    if (s.kind === 'fallback') return { text: s.text, kind: 'fallback', verbatim: false }
    const main = (s.concepts.find((c) => c.cls !== 'model') ?? s.concepts[0]) as Laddered
    const r = s.rungs[s.concepts.indexOf(main)] ?? s.rungs[0]
    return {
      text: s.text,
      kind: s.kind,
      cls: main.cls,
      source: main.display,
      ...(r !== undefined ? { rung: RUNG_OF[r.kind] } : {}),
      verbatim: s.verbatim,
    }
  })
}

/** The ID for tail index k, or '' when every draw is blocked or the ID is reserved (SPEC 13.1). */
export function renderCandidate(c: Candidate, canonical: string, k: number, cfg: ResolvedConfig): string {
  const tail = makeTail(keyFor(cfg), canonical, k, c.tailLen, c.body, cfg)
  if (tail === '') return ''
  const id = c.body + cfg.separator + tail
  return cfg.reserved.includes(id) ? '' : id
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let k = from; k < to; k++) out.push(k)
  return out
}

function finish(
  c: Candidate,
  id: string,
  reason: SlugReason,
  k: number,
  cfg: ResolvedConfig,
  plan: Omit<Plan, 'chosen'>,
  tailGrown: boolean,
): ResolveOut {
  const tail = c.tailLen === 0 ? '' : id.slice(c.body.length + cfg.separator.length)
  assertInvariants(id, c.body, tail, cfg, c.segs)
  const segments = publicSegments(c.segs)
  if (tail !== '') segments.push({ text: tail, kind: 'tail', verbatim: false })
  return {
    id,
    body: c.body,
    tail,
    tailIndex: tail === '' ? 0 : k,
    reason,
    segments,
    ...(tailGrown ? { tailGrown } : {}),
    plan: { ...plan, chosen: c },
  }
}

/**
 * Resolve one analyzed title against the store (SPEC 13.4): body choice with re-pick (tier C),
 * the body-only ID, then the tail with the load rule and the tail index walk.
 */
export function* resolveDoc(
  doc: Doc,
  cfg: ResolvedConfig,
  comp: Compiled,
  exclude: ReadonlySet<string>,
): Generator<Req, ResolveOut, AnyAnswer> {
  if (cfg.leak === 'opaque' || doc.empty) return yield* emptyPath(doc, cfg, exclude)

  const stats = (yield { op: 'stats', stems: [...doc.storedStems] }) as Stats | null
  const { ranked, ladders, pool } = rankPool(doc, stats, cfg, comp)
  let cands = fitBody(pool, cfg)
  // fallback chain (SPEC 12): one segment, then the empty path
  if (cands.length === 0 && cfg.maxSegments > 1) cands = fitBody(pool, cfg, { maxSegments: 1 })
  const first = cands[0]
  if (first === undefined) return yield* emptyPath(doc, cfg, exclude)
  const plan = { ranked, ladders, pool, cands }

  // Phase 1: body choice. Always look at the best candidate first.
  let chosen: Candidate = first
  let reason: SlugReason = 'base'
  const k0 = (yield { op: 'countBodies', bodies: [chosen.body] }) as ReadonlyMap<string, number> | null
  let n = k0 ? (k0.get(chosen.body) ?? 0) : 0
  if (n > 0) {
    reason = 'shared-body'
    const others = (yield { op: 'findByBody', body: chosen.body, limit: FIND_LIMIT }) as
      | readonly { id: string; stems: readonly string[] }[]
      | null
    if (others) {
      const theirs = new Set(others.flatMap((o) => o.stems))
      const diff = new Set(pool.filter((c) => !isIn(c, theirs)).map((c) => c.key))
      if (diff.size > 0) {
        const boosted = rankPool(doc, stats, cfg, comp, diff).pool
        const c2 = fitBody(boosted, cfg, { mustInclude: diff })
        const bodies = [...new Set(c2.map((c) => c.body))]
        const k2 =
          bodies.length > 0 ? ((yield { op: 'countBodies', bodies }) as ReadonlyMap<string, number> | null) : null
        const free = c2.find((c) => (k2?.get(c.body) ?? 1) === 0 && !(c.tailLen === 0 && exclude.has(c.body)))
        if (free) {
          chosen = free
          reason = 'repick'
          n = 0
        }
      }
      // diff empty: same stems (identical or near-identical title). Keep the body; the tail tells them apart.
    }
  }

  // Phase 2: body-only ID
  if (chosen.tailLen === 0) {
    if (n === 0 && !exclude.has(chosen.body)) {
      const taken = (yield { op: 'exists', ids: [chosen.body] }) as ReadonlySet<string>
      if (!taken.has(chosen.body)) return finish(chosen, chosen.body, reason, 0, cfg, plan, false)
    }
    if (reason === 'base') reason = 'shared-body'
    n = Math.max(n, 1)
  }

  // Phase 3: tail. First fix the final body and its tail length, then the start index.
  const before = chosen
  let t = Math.max(chosen.tailLen, cfg.tailMin, tailNeed(n, cfg))
  let m = 0
  for (let round = 0; round < 4; round++) {
    if (t !== chosen.tailLen) {
      const r = refitWithTail(pool, cfg, chosen, t)
      if (r === null) return yield* emptyPath({ canonical: doc.canonical, empty: false }, cfg, exclude)
      chosen = r
    }
    if (!k0) break // tier A: no counts
    const kb = (yield { op: 'countBodies', bodies: [chosen.body] }) as ReadonlyMap<string, number> | null
    m = kb?.get(chosen.body) ?? 0
    if (tailNeed(m, cfg) <= chosen.tailLen) break
    t = tailNeed(m, cfg)
  }
  let start = 0
  if (k0) {
    // in exact mode a tailed body is never a full ID; in max mode a body-only row may hold the body
    const bodyOnly =
      cfg.lengthMode === 'max'
        ? ((yield { op: 'exists', ids: [chosen.body] }) as ReadonlySet<string>).has(chosen.body)
        : false
    start = Math.max(0, m - (bodyOnly ? 1 : 0))
  }
  const span = k0 ? cfg.maxAttempts : cfg.maxScan
  const grown = chosen.body !== before.body
  for (let a = 0; a < span; a += BATCH) {
    const batch = range(start + a, start + Math.min(a + BATCH, span))
      .map((k) => ({ k, id: renderCandidate(chosen, doc.canonical, k, cfg) }))
      .filter((x) => x.id !== '' && !exclude.has(x.id))
    if (batch.length === 0) continue
    const taken = (yield { op: 'exists', ids: batch.map((x) => x.id) }) as ReadonlySet<string>
    const free = batch.find((x) => !taken.has(x.id))
    if (free) return finish(chosen, free.id, reason, free.k, cfg, plan, grown)
  }
  throw new ExhaustedError({ body: chosen.body, tailIndex: start, tries: span })
}
