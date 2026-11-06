/**
 * ID invariants I1 to I10 (SPEC 2.3). `assertInvariants` runs before every return;
 * a failure is a bug and throws InternalError.
 */

import type { ResolvedConfig } from '../config.ts'
import { InternalError } from '../errors.ts'
import { RE_ALL_DIGITS, RE_FIRST_LETTER, RE_ID_DASH, RE_ID_PLAIN, RE_ID_UNDERSCORE } from './regexes.ts'
import {
  bodyBlocked,
  fold,
  hardHitIn,
  hasLookalikePair,
  type SafetySegment,
  segmentBlocked,
  tailBlocked,
} from './safety.ts'

const PATTERNS: Record<string, RegExp> = {
  '-': RE_ID_DASH,
  _: RE_ID_UNDERSCORE,
  '': RE_ID_PLAIN,
}

/** The ID pattern for a separator (I2). */
export function patternFor(separator: ResolvedConfig['separator']): RegExp {
  return PATTERNS[separator] as RegExp
}

export type InvariantCode = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10' | 'shape'

function lengthOk(id: string, cfg: ResolvedConfig): boolean {
  return cfg.lengthMode === 'exact' ? id.length === cfg.length : id.length <= cfg.length && id.length > 0
}

function asciiOnly(id: string): boolean {
  for (let i = 0; i < id.length; i++) if (id.charCodeAt(i) > 0x7f) return false
  return true
}

function allDigits(id: string, sep: string): boolean {
  const s = sep ? id.split(sep).join('') : id
  return s.length > 0 && RE_ALL_DIGITS.test(s)
}

/**
 * Check I1 to I10 for an ID built from `body` and `tail`. Returns the first failing invariant, or null.
 * `segments` gives the body segments with verbatim flags; without it the body is split at the separator
 * (one segment for separator '') and no segment is verbatim.
 */
export function invariantFailure(
  id: string,
  body: string,
  tail: string,
  cfg: ResolvedConfig,
  segments?: readonly SafetySegment[],
): InvariantCode | null {
  const sep = cfg.separator
  const segs: readonly SafetySegment[] =
    segments ?? (body === '' ? [] : (sep === '' ? [body] : body.split(sep)).map((text) => ({ text, verbatim: false })))
  const expected = body === '' ? tail : tail === '' ? body : body + sep + tail
  if (id !== expected) return 'shape'
  if (segs.map((s) => s.text).join(sep) !== body) return 'shape'
  if (!lengthOk(id, cfg)) return 'I1'
  if (!patternFor(sep).test(id)) return 'I2'
  if (!RE_FIRST_LETTER.test(id)) return 'I3'
  if (allDigits(id, sep)) return 'I4'
  if (tail !== '') {
    if (!cfg.tailFirst.includes(tail[0] as string)) return 'I5'
    for (const ch of tail.slice(1)) if (!cfg.tailAlphabet.includes(ch)) return 'I5'
  }
  for (const s of segs) if (segmentBlocked(s.text, cfg)) return 'I6'
  if (segs.length > 0 && bodyBlocked(segs, cfg)) return 'I6'
  if (tail !== '' && tailBlocked(body, tail, cfg)) return 'I6'
  if (hardHitIn(fold(sep ? body.split(sep).join('') : body), cfg)) return 'I6'
  if (cfg.reserved.includes(id)) return 'I7'
  if (cfg.lengthMode === 'max' && tail === '' && cfg.reserved.includes(body)) return 'I7'
  if (sep === '') {
    if (hasLookalikePair(body)) return 'I8'
  } else for (const s of segs) if (hasLookalikePair(s.text)) return 'I8'
  if (!asciiOnly(id)) return 'I9'
  if (segs.length > cfg.maxSegments || segs.some((s) => s.text === '')) return 'I10'
  return null
}

/** Throws InternalError when an invariant fails (a bug in the library). */
export function assertInvariants(
  id: string,
  body: string,
  tail: string,
  cfg: ResolvedConfig,
  segments?: readonly SafetySegment[],
): void {
  const f = invariantFailure(id, body, tail, cfg, segments)
  if (f) throw new InternalError(`invariant ${f} failed for "${id}"`, { invariant: f, id, body, tail })
}

/**
 * Route and form check (SPEC 2.3): I1, I2, I3, I4, I9 and the blocklist. The tail position is unknown,
 * so I5 is not checked. Blocklist: B1 on each separator-split segment, hard words in the joined ID.
 */
export function isValidSlugResolved(id: unknown, cfg: ResolvedConfig): boolean {
  if (typeof id !== 'string') return false
  if (!lengthOk(id, cfg)) return false
  if (!patternFor(cfg.separator).test(id)) return false
  if (allDigits(id, cfg.separator)) return false
  if (!asciiOnly(id)) return false
  const segs = cfg.separator === '' ? [id] : id.split(cfg.separator)
  for (const s of segs) if (segmentBlocked(s, cfg)) return false
  return !hardHitIn(fold(segs.join('')), cfg)
}
