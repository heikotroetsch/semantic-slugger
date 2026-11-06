/**
 * Fit (SPEC 12, step 11): a bounded, exact search over concept subsets x rungs x tail length for the
 * cheapest body. One candidate per subset (the cheapest spelling), sorted by cost and the tie-breaks
 * of SPEC 12. Integer costs and a fixed loop order make the result deterministic.
 */

import type { ConceptClass, ResolvedConfig } from '../config.ts'
import type { Laddered, Rung } from './ladder.ts'
import { rankOrder } from './rank.ts'
import { bodyBlocked, fold, hardHitIn, hasLookalikePair, rungBlocked, segmentBlocked } from './safety.ts'

/** Fit costs (SPEC 11.1, 12). */
export const FIT_COST: Readonly<{ cryptic: number; chunk: number; tailBase: number; tailStep: number }> = Object.freeze(
  { cryptic: 40, chunk: 60, tailBase: 250, tailStep: 50 },
)

/** Slots of the body: T topic, Q qualifier, N number and time (SPEC 2.1). */
const SLOT: Readonly<Record<ConceptClass, number>> = Object.freeze({
  topic: 0,
  name: 0,
  acronym: 0,
  attr: 0,
  qualifier: 1,
  place: 1,
  direction: 1,
  region: 1,
  code: 1,
  year: 2,
  range: 2,
  quarter: 2,
  month: 2,
  week: 2,
  weekday: 2,
  version: 2,
  marker: 2,
  model: 2,
  longnum: 2,
  quantity: 2,
})

export type SegKind = 'word' | 'number' | 'code' | 'fallback'

/** One body segment of a candidate. */
export interface FitSeg {
  readonly text: string
  readonly kind: SegKind
  /** Pays the cryptic cost (SPEC 11.1); a joined bond is cryptic when one of its rungs is. */
  readonly cryptic: boolean
  readonly verbatim: boolean
  /** Concepts shown in this segment (two for a bond), main concept first. */
  readonly concepts: readonly Laddered[]
  /** Rung of each concept, same order. */
  readonly rungs: readonly Rung[]
}

export interface CostParts {
  readonly rungs: number
  readonly cryptic: number
  readonly lost: number
  readonly chunks: number
  readonly tail: number
}

export interface Candidate {
  readonly body: string
  readonly segs: readonly FitSeg[]
  readonly tailLen: number
  /** Concepts in the body, in rank order. */
  readonly content: readonly Laddered[]
  /** Sorted concept keys joined by '|'. */
  readonly contentKey: string
  readonly cost: number
  readonly parts: CostParts
  /** Length of the full ID (body, separator and tail). */
  readonly idLength: number
}

export interface FitConstraint {
  readonly minTail?: number
  /** At least one concept of the subset has a key in this set (re-pick, SPEC 13.4). */
  readonly mustInclude?: ReadonlySet<string>
  /** Only the subset with this content key (refitWithTail, SPEC 13.2). */
  readonly onlyContent?: string
  /** Override of `cfg.maxSegments` (fallback chain, SPEC 12). */
  readonly maxSegments?: number
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Content key of a set of concepts: sorted keys joined by '|'. */
export function contentKeyOf(cs: readonly { readonly key: string }[]): string {
  return cs
    .map((c) => c.key)
    .sort(cmpStr)
    .join('|')
}

/** Tail lengths a body of this length can take (SPEC 12). */
export function tailOptions(bodyLen: number, cfg: ResolvedConfig, minTail: number): number[] {
  const L = cfg.length
  const sep = cfg.separator.length
  if (cfg.lengthMode === 'exact') {
    if (bodyLen === L && minTail === 0) return [0]
    const t = L - bodyLen - sep
    return t >= Math.max(cfg.tailMin, minTail) ? [t] : []
  }
  if (bodyLen > L) return []
  if (minTail === 0) return [0]
  return bodyLen + sep + minTail <= L ? [minTail] : []
}

/** Tail cost (SPEC 12). */
export function tailCost(tailLen: number, cfg: ResolvedConfig): number {
  return tailLen === 0 ? 0 : FIT_COST.tailBase + FIT_COST.tailStep * (tailLen - cfg.tailMin)
}

/** A joined bond segment (`26q1`, `phone8`) passes B1, B2, B7 and I8 (SPEC 11.5). */
function joinedOk(text: string, cfg: ResolvedConfig, cache: Map<string, boolean>): boolean {
  let ok = cache.get(text)
  if (ok === undefined) {
    ok = !segmentBlocked(text, cfg) && !rungBlocked(text, cfg) && !hardHitIn(fold(text), cfg) && !hasLookalikePair(text)
    cache.set(text, ok)
  }
  return ok
}

interface Item {
  slot: number
  pos: number
  key: string
  segs: FitSeg[]
}

function segKind(cls: ConceptClass): SegKind {
  if (cls === 'code') return 'code'
  return SLOT[cls] === 2 ? 'number' : 'word'
}

/**
 * Segments of one subset with one rung per concept, in slot order (T, Q, N; title position inside a
 * slot), with number and model bonds joined and the fallback word before a leading digit (SPEC 2.1,
 * 11.5). Returns null when a joined bond fails the safety rules.
 */
function slotOrder(
  s: readonly Laddered[],
  rungs: readonly Rung[],
  cfg: ResolvedConfig,
  cache: Map<string, boolean>,
): FitSeg[] | null {
  const rungOf = new Map<string, Rung>()
  const byKey = new Map<string, Laddered>()
  s.forEach((c, i) => {
    rungOf.set(c.key, rungs[i] as Rung)
    byKey.set(c.key, c)
  })
  // bond children: models join their word; a quarter or month joins its year (the first by position)
  const joinTo = new Map<string, Laddered[]>()
  const child = new Set<string>()
  for (const c of s) {
    const b = c.bond
    if (b === undefined || !byKey.has(b.with)) continue
    if (b.kind === 'year') {
      // s is in rank order, so pick the first by title position (then key), not the first seen
      const prev = joinTo.get(b.with)?.[0]
      if (prev !== undefined) {
        if (prev.pos < c.pos || (prev.pos === c.pos && prev.key <= c.key)) continue
        child.delete(prev.key)
      }
      joinTo.set(b.with, [c])
    } else {
      const list = joinTo.get(b.with) ?? []
      list.push(c)
      joinTo.set(b.with, list)
    }
    child.add(c.key)
  }
  const items: Item[] = []
  for (const c of s) {
    if (child.has(c.key)) continue
    const r = rungOf.get(c.key) as Rung
    const kids = joinTo.get(c.key) ?? []
    if (kids.length === 0) {
      const segs: FitSeg[] = r.segs.map((text) => ({
        text,
        kind: segKind(c.cls),
        cryptic: !r.plain,
        verbatim: r.verbatim,
        concepts: [c],
        rungs: [r],
      }))
      items.push({ slot: SLOT[c.cls], pos: c.pos, key: c.key, segs })
      continue
    }
    let text = r.text
    let cryptic = !r.plain
    const concepts: Laddered[] = [c]
    const rs: Rung[] = [r]
    let pos = c.pos
    for (const k of kids) {
      const kr = rungOf.get(k.key) as Rung
      text += kr.text
      cryptic ||= !kr.plain
      concepts.push(k)
      rs.push(kr)
      if (k.bond?.kind === 'year') pos = Math.min(pos, k.pos)
    }
    if (r.segs.length !== 1 || !joinedOk(text, cfg, cache)) return null
    const isModel = kids.some((k) => k.cls === 'model')
    const main = isModel ? c : (kids[0] as Laddered)
    items.push({
      slot: SLOT[c.cls],
      pos,
      key: c.key,
      segs: [{ text, kind: segKind(main.cls), cryptic, verbatim: false, concepts, rungs: rs }],
    })
  }
  items.sort((a, b) => a.slot - b.slot || a.pos - b.pos || cmpStr(a.key, b.key))
  const segs = items.flatMap((it) => it.segs)
  const first = segs[0]
  if (first !== undefined && first.text.charCodeAt(0) >= 48 && first.text.charCodeAt(0) <= 57)
    segs.unshift({ text: cfg.fallbackWord, kind: 'fallback', cryptic: false, verbatim: false, concepts: [], rungs: [] })
  return segs
}

/** Lowest segment count of a subset: bonds join, a wide range fills two segments. */
function minSegs(s: readonly Laddered[]): number {
  const keys = new Set(s.map((c) => c.key))
  const years = new Set<string>()
  let n = 0
  for (const c of s) {
    const b = c.bond
    if (b !== undefined && keys.has(b.with)) {
      if (b.kind === 'word') continue
      if (!years.has(b.with)) {
        years.add(b.with)
        continue
      }
    }
    n += Math.min(...c.ladder.map((r) => r.segs.length))
  }
  return n
}

/** Rank comparator over pool positions. */
function rankIndex(pool: readonly Laddered[]): Map<string, number> {
  return new Map(pool.map((c, i) => [c.key, i]))
}

/**
 * Candidate order (SPEC 12): cost, ID length, rung costs in rank order (list compare), content by
 * rank (the candidate with the higher-ranked unshared concept wins), body.
 */
export function compareCandidates(a: Candidate, b: Candidate, rank: ReadonlyMap<string, number>): number {
  if (a.cost !== b.cost) return a.cost - b.cost
  if (a.idLength !== b.idLength) return a.idLength - b.idLength
  const ra = rungCosts(a)
  const rb = rungCosts(b)
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
    const d = (ra[i] as number) - (rb[i] as number)
    if (d !== 0) return d
  }
  if (ra.length !== rb.length) return ra.length - rb.length
  if (a.contentKey !== b.contentKey) {
    const inA = new Set(a.content.map((c) => c.key))
    const inB = new Set(b.content.map((c) => c.key))
    let best: { idx: number; side: number } | undefined
    for (const k of new Set([...inA, ...inB])) {
      if (inA.has(k) === inB.has(k)) continue
      const idx = rank.get(k) ?? Number.MAX_SAFE_INTEGER
      if (best === undefined || idx < best.idx) best = { idx, side: inA.has(k) ? -1 : 1 }
    }
    if (best !== undefined) return best.side
  }
  return cmpStr(a.body, b.body)
}

/** Rung costs of the content in rank order. */
function rungCosts(c: Candidate): number[] {
  const out: number[] = []
  for (const k of c.content) {
    for (const seg of c.segs) {
      const i = seg.concepts.indexOf(k)
      if (i >= 0) {
        out.push((seg.rungs[i] as Rung).cost)
        break
      }
    }
  }
  return out
}

function insertSorted(best: Candidate[], c: Candidate, rank: ReadonlyMap<string, number>, max: number): void {
  let i = best.length
  while (i > 0 && compareCandidates(c, best[i - 1] as Candidate, rank) < 0) i--
  best.splice(i, 0, c)
  if (best.length > max) best.length = max
}

/** True when the body passes B3, B7 (body part), joined I8 and the reserved rule (SPEC 9.2, 9.3). */
function safeBody(segs: readonly FitSeg[], body: string, tailLen: number, cfg: ResolvedConfig): boolean {
  if (bodyBlocked(segs, cfg)) return false
  if (hardHitIn(fold(segs.map((s) => s.text).join('')), cfg)) return false
  if (cfg.separator === '' && hasLookalikePair(body)) return false
  if (tailLen === 0 && cfg.reserved.includes(body)) return false
  return true
}

/**
 * The best `maxPlans` candidates, one per subset, sorted (SPEC 12). `pool` must be in rank order.
 * Subsets of any size are tried when their segment count can fit `maxSegments`.
 */
export function fitBody(pool: readonly Laddered[], cfg: ResolvedConfig, constraint: FitConstraint = {}): Candidate[] {
  const maxSeg = Math.min(constraint.maxSegments ?? cfg.maxSegments, cfg.leak === 'minimal' ? 3 : 5)
  const minTail = constraint.minTail ?? 0
  const rank = rankIndex(pool)
  const n = pool.length
  const keyOf = (c: Laddered) => c.key
  const subsets: { s: Laddered[]; mask: number; lb: number }[] = []
  for (let mask = 1; mask < 1 << n; mask++) {
    const s: Laddered[] = []
    let lost = 0
    pool.forEach((c, i) => {
      if (mask & (1 << i)) s.push(c)
      else lost += c.score
    })
    if (s.some((c) => c.ladder.length === 0)) continue
    if (constraint.mustInclude !== undefined && !s.some((c) => constraint.mustInclude?.has(keyOf(c)))) continue
    if (constraint.onlyContent !== undefined && contentKeyOf(s) !== constraint.onlyContent) continue
    // a model number only together with its word (SPEC 11.5)
    if (!s.every((c) => c.cls !== 'model' || (c.bond !== undefined && s.some((w) => w.key === c.bond?.with)))) continue
    const ms = minSegs(s)
    if (ms > maxSeg) continue
    subsets.push({ s, mask, lb: lost + FIT_COST.chunk * Math.max(0, ms - 2) })
  }
  subsets.sort((a, b) => a.lb - b.lb || a.mask - b.mask)

  const maxPlans = cfg.maxPlans
  const best: Candidate[] = []
  const bondCache = new Map<string, boolean>()
  const safeCache = new Map<string, boolean>()
  for (const { s, lb } of subsets) {
    if (best.length >= maxPlans && lb > (best[maxPlans - 1] as Candidate).cost) break
    const lost = pool.reduce((acc, c) => (s.includes(c) ? acc : acc + c.score), 0)
    const content = [...s].sort(rankOrder)
    const contentKey = contentKeyOf(s)
    let top: Candidate | undefined
    const idx = s.map(() => 0)
    for (;;) {
      const rungs = s.map((c, i) => c.ladder[idx[i] as number] as Rung)
      const segs = slotOrder(s, rungs, cfg, bondCache)
      if (segs !== null && segs.length <= maxSeg) {
        const body = segs.map((x) => x.text).join(cfg.separator)
        let tails = tailOptions(body.length, cfg, minTail)
        // max mode: a reserved body without a tail gets a forced tail (SPEC 9.3)
        if (cfg.lengthMode === 'max' && tails[0] === 0 && cfg.reserved.includes(body))
          tails = tailOptions(body.length, cfg, Math.max(cfg.tailMin, minTail))
        for (const t of tails) {
          const sk = `${t === 0 ? 0 : 1}|${segs.map((x) => (x.verbatim ? '1' : '0')).join('')}|${body}`
          let ok = safeCache.get(sk)
          if (ok === undefined) {
            ok = safeBody(segs, body, t, cfg)
            safeCache.set(sk, ok)
          }
          if (!ok) continue
          const rungCost = rungs.reduce((acc, r) => acc + r.cost, 0)
          const cryptic = FIT_COST.cryptic * segs.filter((x) => x.cryptic).length
          const chunks = FIT_COST.chunk * Math.max(0, segs.length - 2)
          const tail = tailCost(t, cfg)
          const c: Candidate = {
            body,
            segs,
            tailLen: t,
            content,
            contentKey,
            cost: rungCost + cryptic + lost + chunks + tail,
            parts: { rungs: rungCost, cryptic, lost, chunks, tail },
            idLength: body.length + (t === 0 ? 0 : cfg.separator.length + t),
          }
          if (top === undefined || compareCandidates(c, top, rank) < 0) top = c
        }
      }
      // next rung combination (odometer)
      let i = s.length - 1
      while (i >= 0) {
        const c = s[i] as Laddered
        idx[i] = (idx[i] as number) + 1
        if ((idx[i] as number) < c.ladder.length) break
        idx[i] = 0
        i--
      }
      if (i < 0) break
    }
    if (top !== undefined) insertSorted(best, top, rank, maxPlans)
  }
  return best
}

/** The fallback body with a tail of at least `t` (SPEC 13.2, 13.6); null when nothing fits. */
export function fallbackCandidate(pool: readonly Laddered[], cfg: ResolvedConfig, t: number): Candidate | null {
  const body = cfg.fallbackWord
  const tails = tailOptions(body.length, cfg, Math.max(t, cfg.tailMin))
  const tl = tails[0]
  if (tl === undefined) return null
  const lost = pool.reduce((acc, c) => acc + c.score, 0)
  const tail = tailCost(tl, cfg)
  return {
    body,
    segs: [{ text: body, kind: 'fallback', cryptic: false, verbatim: false, concepts: [], rungs: [] }],
    tailLen: tl,
    content: [],
    contentKey: '',
    cost: lost + tail,
    parts: { rungs: 0, cryptic: 0, lost, chunks: 0, tail },
    idLength: body.length + cfg.separator.length + tl,
  }
}

/**
 * Keep the content of `chosen` with a tail of at least `t` (rungs shrink); else drop the lowest-ranked
 * concept and try again; else the fallback body (SPEC 13.2).
 */
export function refitWithTail(
  pool: readonly Laddered[],
  cfg: ResolvedConfig,
  chosen: Candidate,
  t: number,
): Candidate | null {
  let content = [...chosen.content]
  while (content.length > 0) {
    const c = fitBody(pool, cfg, { minTail: t, onlyContent: contentKeyOf(content) })[0]
    if (c !== undefined) return c
    content = content.slice(0, -1)
  }
  return fallbackCandidate(pool, cfg, t)
}
