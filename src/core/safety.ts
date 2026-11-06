/**
 * Bad words and look-alikes (SPEC 9.2). M1 implements the checks that do not need the language
 * pipeline: B1 (segments), B3 (whole body), B5 and B7 (tail), I8 (look-alike pairs).
 * B2, B4 and B6 work on rungs and tokens and follow with the ladders (M4).
 */

import type { ResolvedConfig } from '../config.ts'
import { BLOCK_SHORT_DE, TAIL_BLOCK } from '../data/v1/blocklist.ts'
import { LEET_FOLD, TAIL_EXTRA_FOLD } from '../data/v1/constants.ts'
import { RE_LOOKALIKE_PAIR } from './regexes.ts'

/** Leet fold f(s) (SPEC 9.1). */
export function fold(s: string): string {
  let out = ''
  for (const c of s) out += LEET_FOLD[c] ?? c
  return out
}

/** Tail fold fT(s) = f(s) plus v -> u (SPEC 9.1). Only for tail chars. */
export function foldTail(s: string): string {
  let out = ''
  for (const c of s) out += LEET_FOLD[c] ?? TAIL_EXTRA_FOLD[c] ?? c
  return out
}

interface Compiled {
  /** B1: hard + soft + short, exact segment match. */
  readonly segment: ReadonlySet<string>
  readonly hard: readonly string[]
  readonly soft: readonly string[]
  /** B5: entries of length 3+ from every list, plus the 2-char TAIL_BLOCK entries (also in tail-fold form). */
  readonly tail: readonly string[]
  /** B7: hard entries, also in tail-fold form. */
  readonly hardTail: readonly string[]
}

const cache = new WeakMap<object, Compiled>()

function withTailForms(list: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const w of list) {
    out.add(w)
    out.add(foldTail(w))
  }
  return [...out].sort()
}

function compiled(cfg: ResolvedConfig): Compiled {
  let c = cache.get(cfg.blocklist)
  if (!c) {
    const { hard, soft } = cfg.blocklist
    const all = [...hard, ...soft, ...BLOCK_SHORT_DE, ...TAIL_BLOCK]
    const tail = all.filter((w) => w.length >= 3)
    for (const w of TAIL_BLOCK) if (w.length === 2) tail.push(w)
    c = {
      segment: new Set([...hard, ...soft, ...BLOCK_SHORT_DE]),
      hard,
      soft,
      tail: withTailForms(tail),
      hardTail: withTailForms(hard),
    }
    cache.set(cfg.blocklist, c)
  }
  return c
}

/** B1: the folded segment is a list word. */
export function segmentBlocked(seg: string, cfg: ResolvedConfig): boolean {
  return compiled(cfg).segment.has(fold(seg))
}

/** True when the (already folded) text contains a hard word. */
export function hardHitIn(folded: string, cfg: ResolvedConfig): boolean {
  for (const w of compiled(cfg).hard) if (folded.includes(w)) return true
  return false
}

/** A body segment with its verbatim flag (SPEC 9.2: equals a full user token or compound part). */
export interface SafetySegment {
  readonly text: string
  readonly verbatim: boolean
}

/**
 * B3: the joined, folded body contains no list word of 4+ chars, unless the word is soft and the hit
 * lies strictly inside one verbatim segment.
 */
export function bodyBlocked(segments: readonly SafetySegment[], cfg: ResolvedConfig): boolean {
  const c = compiled(cfg)
  const joined = fold(segments.map((s) => s.text).join(''))
  const bounds: { start: number; end: number; verbatim: boolean }[] = []
  let pos = 0
  for (const s of segments) {
    bounds.push({ start: pos, end: pos + s.text.length, verbatim: s.verbatim })
    pos += s.text.length
  }
  for (const w of c.hard) if (w.length >= 4 && joined.includes(w)) return true
  for (const w of c.soft) {
    if (w.length < 4) continue
    for (let i = joined.indexOf(w); i !== -1; i = joined.indexOf(w, i + 1)) {
      const seg = bounds.find((b) => i >= b.start && i + w.length <= b.end)
      const strictlyInside = seg?.verbatim === true && w.length < seg.end - seg.start
      if (!strictlyInside) return true
    }
  }
  return false
}

/**
 * B5 and B7 for a tail (SPEC 9.2). `body` is the rendered body with separators ('' for opaque).
 * B5: f(lastBodyChar) + fT(tail) has no list entry of 3+ chars and no 2-char TAIL_BLOCK entry.
 * B7: f(body without separators) + fT(tail) has no hard entry that reaches into the tail.
 */
export function tailBlocked(body: string, tail: string, cfg: ResolvedConfig): boolean {
  const c = compiled(cfg)
  const ft = foldTail(tail)
  const last = body.length > 0 ? fold(body[body.length - 1] as string) : ''
  const y = last + ft
  for (const w of c.tail) if (y.includes(w)) return true
  const fb = cfg.separator === '' ? fold(body) : fold(body.split(cfg.separator).join(''))
  const x = fb + ft
  for (const w of c.hardTail) {
    if (x.indexOf(w, Math.max(0, fb.length - w.length + 1)) !== -1) return true
  }
  return false
}

/** I8: a letter from {l, i, o} next to a digit from {0, 1}, in either order. */
export function hasLookalikePair(s: string): boolean {
  return RE_LOOKALIKE_PAIR.test(s)
}
