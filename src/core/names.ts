/**
 * Names, acronyms, attribute words and model numbers (SPEC 6.4, 6.6, 5.1 step 4c, 5.4).
 * Names come only from positive signals: inner capitals, a legal form right after the token, sentence
 * case (in languages whose nouns are not capitalized) and lexicon entries with `cls: 'name'`.
 */

import type { DetectedLang } from '../config.ts'
import type { Compiled } from './compile.ts'
import { splitCompound } from './compound.ts'
import type { Normalized } from './normalize.ts'
import { RE_DECIMAL_VERSION, RE_HAS_DIGIT, RE_HAS_LETTER, RE_LETTER } from './regexes.ts'
import { type NameSignal, type Tok, versionFromDecimal } from './tokenize.ts'

export interface NamesResult {
  readonly names: readonly { word: string; signal: NameSignal }[]
}

function capitalized(t: Tok): boolean {
  return t.cap
}

function isWord(t: Tok): boolean {
  return t.cls === 'word' && t.drop === undefined
}

/** Every letter of the title is upper case (acronyms need a title that is not all caps, SPEC 6.6). */
export function allCapsTitle(n: Normalized): boolean {
  if (n.up === null) return false
  let letters = 0
  for (let i = 0; i < n.surface.length; i++) {
    if (!RE_LETTER.test(n.surface[i] as string)) continue
    letters++
    if (n.up[i] !== true) return false
  }
  return letters > 0
}

/** Attr rules of the token language and the title language (SPEC 6.4). */
function isAttr(t: Tok, first: boolean, title: DetectedLang, c: Compiled): boolean {
  if (t.case === 'unknown') return false
  const p = c.pack(t.lang)
  const a = t.ascii
  if (p?.attr !== undefined && a.length >= 6) {
    const idx = c.parts.get(p.code)
    const known = idx !== undefined && splitCompound(a, idx) !== null
    if (!known) {
      const suffix = (s: string) => a.endsWith(s) && !(s === 'haft' && a.endsWith('schaft'))
      if ((p.attr.suffixes ?? []).some(suffix)) return true
      if (t.case === 'lower' && (p.attr.lowerSuffixes ?? []).some(suffix)) return true
    }
  }
  const tp = c.pack(title)
  if (tp?.attr?.lowerCaseRule === true && t.case === 'lower' && !first) return true
  return false
}

/**
 * Give every kept word token its role, find model numbers and decimal versions after a model
 * position. Mutates the tokens.
 */
export function applyNames(toks: Tok[], title: DetectedLang, c: Compiled, n: Normalized): NamesResult {
  const names: { word: string; signal: NameSignal }[] = []
  const words = toks.filter(isWord)
  const lettered = words.filter((t) => RE_HAS_LETTER.test(t.ascii))
  const allCaps = allCapsTitle(n)
  const titleCase = lettered.length > 0 && lettered.every(capitalized)
  const firstWord = words[0]
  const pack = c.pack(title)
  const sentenceCaseLang = pack?.nounsCapitalized !== true
  for (const t of words) {
    const lex = t.lex
    if (lex !== undefined) {
      t.role = lex.cls === 'marker' ? 'topic' : lex.cls
      if (lex.cls === 'name') {
        t.signal = 'lexicon'
        names.push({ word: t.ascii, signal: 'lexicon' })
      }
      continue
    }
    let signal: NameSignal | undefined
    const plain = t.parts === undefined && !RE_HAS_DIGIT.test(t.ascii)
    if (t.case !== 'unknown') {
      if (t.innerCaps) signal = 'inner-caps'
      else if (t.case === 'upper' && plain && t.ascii.length >= 2 && t.ascii.length <= 6 && !allCaps) signal = 'acronym'
      else if (t.beforeLegal === true && capitalized(t)) signal = 'legal-form'
      else if (
        sentenceCaseLang &&
        !titleCase &&
        capitalized(t) &&
        t !== firstWord &&
        !c.months.has(t.ascii) &&
        !c.weekdays.has(t.ascii)
      )
        signal = 'sentence-case'
    }
    if (signal !== undefined) {
      t.role = signal === 'acronym' ? 'acronym' : 'name'
      t.signal = signal
      names.push({ word: t.ascii, signal })
      continue
    }
    t.role = isAttr(t, t === firstWord, title, c) ? 'attr' : 'topic'
  }
  // model numbers and decimal versions after a model position (SPEC 5.1 step 4c, 5.4)
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i] as Tok
    const prev = toks[i - 1] as Tok
    if (!isWord(prev)) continue
    const position =
      prev.role === 'name' ||
      prev.role === 'acronym' ||
      (sentenceCaseLang && prev.role === 'topic' && prev.lex === undefined && capitalized(prev))
    if (!position) continue
    const after = toks[i + 1]
    const time = after !== undefined && after.cls === 'noise' && (after.ascii === 'am' || after.ascii === 'pm')
    if (t.cls === 'smallnum' && t.ascii.length <= 3 && !time) {
      toks[i] = { ...t, cls: 'model', key: `d${Number(t.ascii)}`, ascii: String(Number(t.ascii)), modelOf: i - 1 }
    } else if (t.cls === 'noise' && t.decimal !== undefined && RE_DECIMAL_VERSION.test(t.decimal)) {
      toks[i] = versionFromDecimal(t)
    }
  }
  return { names }
}
