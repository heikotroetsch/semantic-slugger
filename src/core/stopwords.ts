/**
 * Stop word tiers (SPEC 6.3): function words, conflict words, number words, noise words, user words and
 * legal forms are removed; weak words are marked. Back-off (SPEC 6.5) when nothing is left.
 */

import type { DetectedLang } from '../config.ts'
import type { Compiled } from './compile.ts'
import { RE_HAS_DIGIT, RE_LETTER, RE_YEAR_ONLY } from './regexes.ts'
import type { DropReason, Tok } from './tokenize.ts'

export interface StopResult {
  readonly removed: readonly { word: string; list: DropReason }[]
  readonly weak: readonly string[]
}

function isPunct(ch: string): boolean {
  return ch !== '' && !RE_LETTER.test(ch) && !RE_HAS_DIGIT.test(ch)
}

function capitalized(t: Tok | undefined): boolean {
  return t?.cap === true
}

/** Mark legal forms (SPEC 6.3). Returns the indexes of legal tokens. */
function markLegal(toks: Tok[], c: Compiled): Set<number> {
  const legal = new Set<number>()
  const isForm = (a: string) => c.legal.always.has(a) || c.legal.ambiguous.has(a)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok
    // multi-token forms (`GmbH & Co. KG`, `e.V.`)
    for (const seq of c.legal.multi) {
      if (seq.every((w, k) => toks[i + k]?.ascii === w)) for (let k = 0; k < seq.length; k++) legal.add(i + k)
    }
    // dotted single letters (`S.A.`, `e.K.`): joined, they are a dotted legal form
    if (t.ascii.length === 1 && t.next === '.') {
      let j = i
      let joined = ''
      while (j < toks.length && (toks[j] as Tok).ascii.length === 1 && (toks[j] as Tok).next === '.') {
        joined += (toks[j] as Tok).ascii
        j++
      }
      if (j - i >= 2 && isForm(joined)) for (let k = i; k < j; k++) legal.add(k)
    }
    if (t.cls !== 'word' || t.parts !== undefined) continue
    if (c.legal.always.has(t.ascii)) legal.add(i)
    else if (c.legal.ambiguous.has(t.ascii)) {
      const prev = toks[i - 1]
      const marked =
        t.case === 'upper' ||
        t.next === '.' ||
        (c.legal.titleCase.has(t.ascii) && t.case === 'title' && capitalized(prev) && prev?.cls === 'word')
      const next = toks[i + 1]
      const place =
        next === undefined ||
        t.next === '&' ||
        isPunct(t.next) ||
        next.ascii === 'co' ||
        isForm(next.ascii) ||
        next.cls === 'year' ||
        RE_YEAR_ONLY.test(next.ascii)
      if (marked && place) legal.add(i)
    }
  }
  return legal
}

/** Apply the stop word tiers to the kept tokens (SPEC 6.3). Mutates `drop` and `weak` on tokens. */
export function applyStopWords(toks: Tok[], title: DetectedLang, c: Compiled): StopResult {
  const removed: { word: string; list: DropReason }[] = []
  const weak: string[] = []
  const lang = title === 'und' ? c.cfg.defaultLang : title
  const legal = markLegal(toks, c)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok
    if (legal.has(i)) {
      t.drop = 'legal'
      removed.push({ word: t.ascii, list: 'legal' })
      const prev = toks[i - 1]
      if (prev !== undefined && !legal.has(i - 1)) prev.beforeLegal = true
      continue
    }
    if (t.cls !== 'word') continue
    if (t.words !== undefined) {
      if (t.lex?.weak === true) {
        t.weak = true
        weak.push(t.ascii)
      }
      continue
    }
    const a = t.ascii
    let list: DropReason | undefined
    if (c.stop.words.has(a) && !(t.case === 'upper' && c.stop.upperExempt.has(a))) {
      const conflict = c.stop.conflictLangs.get(a)
      const fn = c.stop.functionLangs.get(a)
      if (conflict !== undefined && fn !== undefined && [...fn].every((l) => conflict.has(l))) {
        if (conflict.has(lang)) list = 'conflict'
      } else if (fn !== undefined) list = 'function'
      else if (c.stop.noise.has(a)) list = 'noise'
      else list = 'custom'
    }
    if (list === undefined && c.numberWords.get(lang)?.has(a) === true) list = 'conflict'
    if (list !== undefined) {
      t.drop = list
      removed.push({ word: a, list })
      continue
    }
    if (t.lex?.weak === true) {
      t.weak = true
      weak.push(a)
    }
  }
  return { removed, weak }
}

/** Number-like token classes: they never count as words for the back-off. */
const NUMBERISH: ReadonlySet<string> = new Set([
  'year',
  'range',
  'quarter',
  'month',
  'week',
  'weekday',
  'version',
  'marker',
  'model',
  'longnum',
  'code',
  'quantity',
])

export interface BackoffResult {
  /** The title has no usable content: empty path (SPEC 13.6). */
  readonly empty: boolean
  readonly backoff?: 'noise' | 'weak'
}

/**
 * Back-off (SPEC 6.5), evaluated after stop words, deny tokens and names. Deny tokens are never
 * restored. Restored tokens lose their drop or weak mark.
 */
export function backoff(toks: Tok[]): BackoffResult {
  const kept = toks.filter((t) => t.drop === undefined && t.cls !== 'noise' && t.cls !== 'smallnum')
  if (kept.length === 0) {
    const first = toks.find((t) => t.drop === 'noise')
    if (first !== undefined) {
      delete first.drop
      first.role = 'topic'
      return { empty: false, backoff: 'noise' }
    }
    return { empty: true }
  }
  const words = kept.filter((t) => t.cls === 'word')
  const strong = words.some((t) => t.weak !== true && t.role !== 'attr')
  const weakOnes = words.filter((t) => t.weak === true)
  if (!strong && weakOnes.length > 0) {
    for (const t of weakOnes) t.weak = false
    return { empty: false, backoff: 'weak' }
  }
  return { empty: false }
}

/** True when every kept token is a number, time, marker or code token (SPEC 6.5 last row). */
export function onlyNumbers(toks: readonly Tok[]): boolean {
  const kept = toks.filter((t) => t.drop === undefined && t.cls !== 'noise' && t.cls !== 'smallnum')
  return kept.length > 0 && kept.every((t) => NUMBERISH.has(t.cls))
}
