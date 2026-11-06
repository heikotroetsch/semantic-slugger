/**
 * Empty path and opaque IDs (SPEC 13.6).
 *
 * | Case                     | Body             | Tail                                           |
 * | leak 'opaque'            | none             | t = L (exact and max), first char a consonant  |
 * | empty title, 'fallback'  | cfg.fallbackWord | exact: L - len(body) - sep; max: tailMin (*)   |
 * | empty title, 'throw'     | -                | InputError                                     |
 *
 * (*) In max mode with a counting store (tier B, C), the tail grows with the load rule tailNeed(n),
 * capped by the length. The tail index starts at countBody(body) (tier B, C) or 0 (tier A).
 *
 * Window: an index that renders '' (every draw blocked, or a reserved ID) does not count against
 * maxAttempts / maxScan (docs/DEVIATIONS.md, M5 fix round 1).
 *
 * Tail lag (docs/DEVIATIONS.md #22): in tier B and C, when all maxAttempts indexes from n are taken
 * at tail length t, t grows by 1 and the scan starts again at k = n. Hash collisions between tails
 * of one length move the used indexes ahead of n for good; a new length is a fresh tail space.
 * The result stays deterministic for the same store state.
 */

import type { ResolvedConfig } from '../config.ts'
import { ExhaustedError, InputError } from '../errors.ts'
import type { Segment } from '../result.ts'
import { assertInvariants } from './invariants.ts'
import type { AnyAnswer, Req, ResolveOut } from './resolve.ts'
import { keyFor, makeTail, tailNeed, WINDOW_SCAN_FACTOR, windowIds } from './tail.ts'

/** What the empty path needs from the analysis. */
export interface EmptyDoc {
  /** Canonical title (SPEC 4.1), the hash input. */
  readonly canonical: string
  /** true when the title has no usable content (not only "no fit candidate"). */
  readonly empty: boolean
}

const BATCH = 8

/** Longest tail the empty path can use: the room left after the body. */
export function emptyTailRoom(cfg: ResolvedConfig): number {
  if (cfg.leak === 'opaque') return cfg.length
  return cfg.length - cfg.fallbackWord.length - cfg.separator.length
}

/** Tail length on the empty path for n rows that already share the body. */
export function emptyTailLength(cfg: ResolvedConfig, n: number): number {
  const room = emptyTailRoom(cfg)
  if (cfg.leak === 'opaque' || cfg.lengthMode === 'exact') return room
  return Math.min(room, Math.max(cfg.tailMin, tailNeed(n, cfg)))
}

/** Render the ID for tail index k, or '' when every draw is blocked or the ID is reserved. */
export function renderEmpty(doc: EmptyDoc, cfg: ResolvedConfig, k: number, t: number): string {
  const body = cfg.leak === 'opaque' ? '' : cfg.fallbackWord
  const tail = makeTail(keyFor(cfg), doc.canonical, k, t, body, cfg)
  if (tail === '') return ''
  const id = body === '' ? tail : body + cfg.separator + tail
  return cfg.reserved.includes(id) ? '' : id
}

/** `spread` > 0 is the start index of a `createUnique` retry with a `retryKey` (SPEC 13.5). */
export function* emptyPath(
  doc: EmptyDoc,
  cfg: ResolvedConfig,
  exclude: ReadonlySet<string>,
  spread = 0,
): Generator<Req, ResolveOut, AnyAnswer> {
  const opaque = cfg.leak === 'opaque'
  if (!opaque && doc.empty && cfg.onEmpty === 'throw') throw new InputError('title is empty', { reason: 'empty' })
  const body = opaque ? '' : cfg.fallbackWord

  const counts = (yield { op: 'countBodies', bodies: [body] }) as ReadonlyMap<string, number> | null
  const n = counts ? (counts.get(body) ?? 0) : 0
  const start = spread > 0 ? spread : counts ? n : 0
  const span = counts ? cfg.maxAttempts : cfg.maxScan
  // Tier A (no counts) scans one window at one length. Tier B, C grow the tail when a window is full.
  const tLast = counts ? emptyTailRoom(cfg) : emptyTailLength(cfg, n)
  const end = start + span * WINDOW_SCAN_FACTOR
  let tries = 0

  for (let t = emptyTailLength(cfg, n); t <= tLast; t++) {
    let k = start
    for (let asked = 0; asked < span && k < end; ) {
      const w = windowIds(k, Math.min(BATCH, span - asked), end, (i) => renderEmpty(doc, cfg, i, t))
      k = w.next
      asked += w.ids.length
      tries += w.ids.length
      const batch = w.ids.filter((x) => !exclude.has(x.id))
      if (batch.length === 0) continue
      const taken = (yield { op: 'exists', ids: batch.map((x) => x.id) }) as ReadonlySet<string>
      const free = batch.find((x) => !taken.has(x.id))
      if (free) {
        const tail = body === '' ? free.id : free.id.slice(body.length + cfg.separator.length)
        const segments: Segment[] = []
        if (body !== '') segments.push({ text: body, kind: 'fallback', verbatim: false })
        segments.push({ text: tail, kind: 'tail', verbatim: false })
        assertInvariants(free.id, body, tail, cfg)
        return { id: free.id, body, tail, tailIndex: free.k, reason: opaque ? 'opaque' : 'empty', segments }
      }
    }
  }
  throw new ExhaustedError({ body, tailIndex: start, tries }, { counting: counts !== null })
}
