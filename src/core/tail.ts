/**
 * Tail hash and tail length (SPEC 13.1, 13.2).
 */

import type { ResolvedConfig } from '../config.ts'
import {
  DIGITS_PER_WORD,
  HASH_FIELD_SEP,
  K_V1_TEXT,
  TAIL_DOMAIN,
  TAIL_DRAWS,
  TAIL_LOAD_FACTOR,
} from '../data/v1/constants.ts'
import { concatBytes, utf8 } from '../hash/encode.ts'
import { divSmall, siphash, type U64, u64hex, u64le } from '../hash/siphash.ts'
import { tailBlocked } from './safety.ts'

let kV1: Uint8Array | undefined
/** The public v1 key, utf8('semantic-slug-v1'), exactly 16 bytes. */
export function keyV1(): Uint8Array {
  if (!kV1) kV1 = utf8(K_V1_TEXT)
  return kV1
}

const keyCache = new Map<string, Uint8Array>()

/** Hash key for a config: K_V1, or a key derived from the secret (SPEC 13.1). */
export function keyFor(cfg: Pick<ResolvedConfig, 'secret'>): Uint8Array {
  const secret = cfg.secret
  if (secret === undefined || secret === '') return keyV1()
  let k = keyCache.get(secret)
  if (!k) {
    const a = siphash(keyV1(), utf8(`k0${HASH_FIELD_SEP}${secret}`))
    const b = siphash(keyV1(), utf8(`k1${HASH_FIELD_SEP}${secret}`))
    k = concatBytes(u64le(a), u64le(b))
    if (keyCache.size > 64) keyCache.clear()
    keyCache.set(secret, k)
  }
  return k
}

/** One 64-bit hash word for tail index k, draw and word index i (SPEC 13.1). */
export function tailWord(key: Uint8Array, canonical: string, k: number, draw: number, i: number): U64 {
  return siphash(key, utf8([TAIL_DOMAIN, canonical, k, draw, i].join(HASH_FIELD_SEP)))
}

/** Draw a tail of t chars without the B5/B7 check. */
export function drawTail(
  key: Uint8Array,
  canonical: string,
  k: number,
  draw: number,
  t: number,
  cfg: ResolvedConfig,
): string {
  const first = cfg.tailFirst
  const rest = cfg.tailAlphabet
  let i = 0
  let w = tailWord(key, canonical, k, draw, i)
  let left = DIGITS_PER_WORD
  let r = 0
  ;[w, r] = divSmall(w, first.length)
  let s = first[r] as string
  left--
  while (s.length < t) {
    if (left === 0) {
      i++
      w = tailWord(key, canonical, k, draw, i)
      left = DIGITS_PER_WORD
    }
    ;[w, r] = divSmall(w, rest.length)
    s += rest[r] as string
    left--
  }
  return s
}

/**
 * Tail for index k: the first of up to TAIL_DRAWS (16) draws that passes B5 and B7 against `body`.
 * Returns '' when all draws are blocked; the caller then moves to k + 1 (SPEC 13.1).
 */
export function makeTail(
  key: Uint8Array,
  canonical: string,
  k: number,
  t: number,
  body: string,
  cfg: ResolvedConfig,
): string {
  for (let draw = 0; draw < TAIL_DRAWS; draw++) {
    const s = drawTail(key, canonical, k, draw, t, cfg)
    if (!tailBlocked(body, s, cfg)) return s
  }
  return ''
}

/** Number of distinct tails of length t: |first| * |rest|^(t-1) (SPEC 13.2). */
export function tailCapacity(t: number, cfg: Pick<ResolvedConfig, 'tailFirst' | 'tailAlphabet'>): number {
  return cfg.tailFirst.length * cfg.tailAlphabet.length ** (t - 1)
}

/** Tail length for n rows sharing a body: keep the load per attempt at or below 1/16 (SPEC 13.2). */
export function tailNeed(
  n: number,
  cfg: Pick<ResolvedConfig, 'tailMin' | 'tailFirst' | 'tailAlphabet' | 'length'>,
): number {
  let t = cfg.tailMin
  while ((n + 1) * TAIL_LOAD_FACTOR > tailCapacity(t, cfg) && t < cfg.length) t++
  return t
}

/** titleKey: 16 hex chars of SipHash(keyFor(cfg), canonical title) (SPEC 13.3). */
export function titleKeyOf(canonical: string, cfg: Pick<ResolvedConfig, 'secret'>): string {
  return u64hex(siphash(keyFor(cfg), utf8(canonical)))
}

/** One tail ID of a scan window: its tail index and the rendered ID. */
export interface WindowId {
  readonly k: number
  readonly id: string
}

/**
 * The next up to `need` IDs of a scan window, from tail index `k` (SPEC 13.4). An index that renders
 * '' (every draw blocked, or a reserved ID) does not count against the window; at most `end - k`
 * indexes are looked at. Returns the IDs and the next index.
 */
export function windowIds(
  k: number,
  need: number,
  end: number,
  render: (k: number) => string,
): { ids: WindowId[]; next: number } {
  const ids: WindowId[] = []
  while (ids.length < need && k < end) {
    const id = render(k)
    if (id !== '') ids.push({ k, id })
    k++
  }
  return { ids, next: k }
}

/** Indexes looked at per window, as a multiple of the window size (bounds `windowIds` for blocked tails). */
export const WINDOW_SCAN_FACTOR: number = 4

/** Tail indexes of `createUnique` retries with a `retryKey` start here; row counts never get this high. */
export const RETRY_INDEX_BASE: number = 2 ** 32

/**
 * Start index of retry r (r >= 1) of a `createUnique` call with `retryKey` (SPEC 13.5): RETRY_INDEX_BASE
 * plus 32 bits of SipHash(keyFor(cfg), 'ssr1', retryKey, r). Parallel losers with different keys scan
 * different index ranges, so they do not all try the same next ID. No randomness: the same key, round
 * and store state give the same ID.
 */
export function retryStart(cfg: Pick<ResolvedConfig, 'secret'>, retryKey: string, r: number): number {
  const w = siphash(keyFor(cfg), utf8(['ssr1', retryKey, r].join(HASH_FIELD_SEP)))
  return RETRY_INDEX_BASE + (w.lo >>> 0)
}
