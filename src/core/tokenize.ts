/**
 * Tokenization (SPEC 5.1 to 5.4). Number and time spans are claimed first (dates, ranges, `§` and `#`
 * markers, fiscal years, weeks, years, long numbers, quantities, versions, decimals), then code runs
 * on the cased text, then the rest is split into word tokens. Word tokens get number, marker, month,
 * weekday and noise classes from their text and their neighbours.
 */

import type { DetectedLang, LexiconEntry } from '../config.ts'
import { MARKER_HASH_PREFIX, MARKER_PARAGRAPH_PREFIX, MARKER_ROMAN, MARKER_SIZES } from '../data/v1/markers.ts'
import type { Compiled, MarkerSpec } from './compile.ts'
import type { CompoundPlan } from './compound.ts'
import type { CaseFlag } from './lexicon.ts'
import { asciiFold, type Normalized } from './normalize.ts'
import {
  RE_AMPM_GLUED,
  RE_CLASS_VALUE,
  RE_CODE_RUN,
  RE_DATE,
  RE_DECIMAL,
  RE_DECIMAL_VERSION,
  RE_DIGITS,
  RE_DOT,
  RE_FY,
  RE_GLUED_MARKER,
  RE_HAS_DIGIT,
  RE_HAS_LETTER,
  RE_HASH_NUMBER,
  RE_HISTORIC_YEAR,
  RE_HYPHEN_WORD,
  RE_ILO_ONLY,
  RE_LETTER,
  RE_LONGNUM,
  RE_LOOKALIKE_PAIR,
  RE_NON_ALNUM,
  RE_ORDINAL,
  RE_PARAGRAPH,
  RE_QUANTITY,
  RE_QUARTER,
  RE_RANGE,
  RE_ROMAN,
  RE_RUN_WORD_TAIL,
  RE_SPACE_CHAR,
  RE_STANDARD_PREFIX,
  RE_TOKEN_CHARS,
  RE_UNDERSCORE,
  RE_VERSION_V,
  RE_VERSION_WORD,
  RE_WEEK,
  RE_YEAR,
} from './regexes.ts'

export type TokClass =
  | 'word'
  | 'year'
  | 'range'
  | 'quarter'
  | 'month'
  | 'week'
  | 'weekday'
  | 'version'
  | 'marker'
  | 'model'
  | 'longnum'
  | 'code'
  | 'quantity'
  | 'smallnum'
  | 'noise'

/** Why a token was removed (SPEC 16.4 stopwords step). */
export type DropReason = 'function' | 'conflict' | 'noise' | 'legal' | 'custom' | 'deny'

/** Final role of a kept word token. Lexicon classes, or a class found by signals (SPEC 6.4, 6.6). */
export type WordRole = 'topic' | 'name' | 'acronym' | 'attr' | 'qualifier' | 'place' | 'direction' | 'region'

export type NameSignal = 'inner-caps' | 'acronym' | 'legal-form' | 'sentence-case' | 'lexicon'

export interface Tok {
  /** Surface text (lower case, umlauts kept). Phrase tokens: the words joined by spaces. */
  text: string
  /** `[a-z0-9]+`. Hyphenated tokens: the parts joined. Phrase tokens: the words joined. */
  ascii: string
  cls: TokClass
  /** Number, time, marker and code keys (SPEC 5.2). */
  key?: string
  case: CaseFlag
  /** An upper-case letter after a lower-case letter (name signal 1). */
  innerCaps: boolean
  /** The first letter is upper case ("capitalized"; false when the case is unknown). */
  cap: boolean
  /** Step 0 candidate: 2 to 6 upper-case letters, optionally with a lower-case plural `s`. */
  capsAbbr?: string
  translit: boolean
  start: number
  end: number
  /** Per-token language (SPEC 6.1). */
  lang: DetectedLang
  /** Ascii parts of a hyphenated token (SPEC 5.1 step 3). */
  parts?: string[]
  /** Source words of a phrase token (SPEC 6.2). */
  words?: string[]
  /** First non-space char after the token, '' at the end. */
  next: string
  /** Numeric value of a number token (smallnum, year). */
  value?: number
  fy?: boolean
  historic?: boolean
  date?: boolean
  /** A decimal waiting for a version context (SPEC 5.4); noise otherwise. */
  decimal?: string
  /** All-caps code run (code display rule, SPEC 5.2). */
  capsRun?: boolean
  /** Marker word (ascii, joined by spaces) of a marker token, for the topic-to-marker merge (SPEC 5.3). */
  markerWord?: string
  /** Pending single letter or Roman numeral, resolved after the marker pass. */
  letter?: boolean
  // ---- set by later stages ----
  lex?: LexiconEntry
  role?: WordRole
  drop?: DropReason
  weak?: boolean
  signal?: NameSignal
  /** Model number: index of the word token it follows (SPEC 5.1 step 4c). */
  modelOf?: number
  /** A legal-form token follows directly (name signal 3). */
  beforeLegal?: boolean
  /** Compound plan (SPEC 7.3) of a splittable topic token. */
  split?: CompoundPlan
}

interface Ctx {
  readonly s: string
  readonly up: readonly boolean[] | null
  readonly tr: readonly boolean[]
  readonly taken: Uint8Array
  readonly out: Tok[]
}

function isLetter(c: string): boolean {
  return RE_LETTER.test(c)
}

/** Case flag of `s[start, end)` from the upper-case mask (SPEC 4.1). */
function caseOf(ctx: Ctx, start: number, end: number): { flag: CaseFlag; inner: boolean; cap: boolean } {
  if (ctx.up === null) return { flag: 'unknown', inner: false, cap: false }
  let letters = 0
  let ups = 0
  let firstUp = false
  let inner = false
  let prevLower = false
  // every letter segment (between hyphens or digits) is Title Case: `Edelstahl-Wasserkocher`
  let segTitle = true
  let segStart = true
  for (let i = start; i < end; i++) {
    const c = ctx.s[i] as string
    if (!isLetter(c)) {
      // a hyphen or digit ends the segment: `Team-Meeting` has no inner capital (SPEC 6.6 signal 1)
      prevLower = false
      segStart = true
      continue
    }
    const u = ctx.up[i] === true
    if (letters === 0) firstUp = u
    if (u && prevLower) inner = true
    if (segStart !== u) segTitle = false
    segStart = false
    prevLower = !u
    letters++
    if (u) ups++
  }
  if (letters === 0) return { flag: 'lower', inner: false, cap: false }
  if (ups === letters) return { flag: letters === 1 ? 'title' : 'upper', inner: false, cap: true }
  if (ups === 0) return { flag: 'lower', inner: false, cap: false }
  if (firstUp && (ups === 1 || segTitle)) return { flag: 'title', inner: false, cap: true }
  return { flag: 'mixed', inner, cap: firstUp }
}

function nextChar(s: string, end: number): string {
  for (let i = end; i < s.length; i++) {
    const c = s[i] as string
    if (!RE_SPACE_CHAR.test(c)) return c
  }
  return ''
}

function make(ctx: Ctx, start: number, end: number, cls: TokClass, ascii: string, extra: Partial<Tok> = {}): Tok {
  const cf = caseOf(ctx, start, end)
  let translit = false
  for (let i = start; i < end; i++) if (ctx.tr[i] === true) translit = true
  return {
    text: ctx.s.slice(start, end),
    ascii,
    cls,
    case: cf.flag,
    innerCaps: cf.inner,
    cap: cf.cap,
    translit,
    start,
    end,
    lang: 'und',
    next: nextChar(ctx.s, end),
    ...extra,
  }
}

function overlaps(ctx: Ctx, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (ctx.taken[i] === 1) return true
  return false
}

function claim(ctx: Ctx, re: RegExp, fn: (m: RegExpExecArray) => Omit<Tok, 'start' | 'end'> | Tok | null): void {
  re.lastIndex = 0
  for (let m = re.exec(ctx.s); m !== null; m = re.exec(ctx.s)) {
    const start = m.index
    const end = start + m[0].length
    if (m[0].length === 0 || overlaps(ctx, start, end)) {
      re.lastIndex = start + 1
      continue
    }
    const t = fn(m)
    if (t === null) {
      re.lastIndex = start + 1
      continue
    }
    for (let i = start; i < end; i++) ctx.taken[i] = 1
    ctx.out.push({ ...t, start, end })
    re.lastIndex = end
  }
}

/** Strip leading zeros of a number string (`01` -> `1`), keep `0`. */
function num(d: string): string {
  return String(Number.parseInt(d, 10))
}

function yearTok(ctx: Ctx, m: RegExpExecArray, year: number, extra: Partial<Tok> = {}): Tok {
  return make(ctx, m.index, m.index + m[0].length, 'year', String(year), {
    key: `y${year}`,
    value: year,
    ...(year < 1900 ? { historic: true } : {}),
    ...extra,
  })
}

/** Step 1: number and time spans (SPEC 5.1 step 1, 5.4). */
function claimNumbers(ctx: Ctx, c: Compiled): void {
  claim(ctx, RE_DATE, (m) => {
    const a = Number(m[1])
    const b = Number(m[2])
    const yRaw = m[3] as string
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
    if (a < 1 || b < 1 || a > 31 || b > 31 || (a > 12 && b > 12) || year < 1500 || year > 2099) return null
    return yearTok(ctx, m, year, { date: true })
  })
  claim(ctx, RE_RANGE, (m) => {
    const y1 = Number(m[1])
    const r2 = m[2] as string
    const y2 = r2.length === 2 ? Math.floor(y1 / 100) * 100 + Number(r2) : Number(r2)
    if (y2 <= y1) return null
    return make(ctx, m.index, m.index + m[0].length, 'range', `${y1}${y2}`, { key: `r${y1}-${y2}` })
  })
  claim(ctx, RE_PARAGRAPH, (m) => {
    const n = num(m[1] as string)
    return make(ctx, m.index, m.index + m[0].length, 'marker', `${MARKER_PARAGRAPH_PREFIX}${n}`, {
      key: `${MARKER_PARAGRAPH_PREFIX}${n}`,
      markerWord: '§',
    })
  })
  claim(ctx, RE_HASH_NUMBER, (m) => {
    const n = num(m[1] as string)
    return make(ctx, m.index, m.index + m[0].length, 'marker', `${MARKER_HASH_PREFIX}${n}`, {
      key: `${MARKER_HASH_PREFIX}${n}`,
      markerWord: '#',
    })
  })
  claim(ctx, RE_FY, (m) => {
    const d = m[1] as string
    const year = d.length === 2 ? 2000 + Number(d) : Number(d)
    if (year < 1900 || year > 2099) return null
    return yearTok(ctx, m, year, { fy: true })
  })
  claim(ctx, RE_WEEK, (m) => {
    const n = Number(m[2])
    if (n < 1 || n > 53) return null
    return make(ctx, m.index, m.index + m[0].length, 'week', `kw${n}`, { key: `kw${n}`, value: n })
  })
  claim(ctx, RE_YEAR, (m) => yearTok(ctx, m, Number(m[0])))
  claim(ctx, RE_HISTORIC_YEAR, (m) => yearTok(ctx, m, Number(m[0])))
  claim(ctx, RE_LONGNUM, (m) => make(ctx, m.index, m.index + m[0].length, 'longnum', m[0], { key: `n${m[0]}` }))
  claim(ctx, RE_QUANTITY, (m) => {
    const unit = c.units.get(m[2] as string)
    if (unit === undefined) return null
    // a one-letter unit glued to the number in upper case is a letter-digit code (`3D`, `5G`), not a unit
    const end = m.index + m[0].length
    if ((m[2] as string).length === 1 && !RE_SPACE_CHAR.test(m[0]) && ctx.up?.[end - 1] === true) return null
    const n = (m[1] as string).replace(',', '.')
    const decimal = n.includes('.')
    const ascii = decimal ? '' : `${num(n)}${unit}`
    return make(ctx, m.index, m.index + m[0].length, 'quantity', ascii, {
      key: `q${decimal ? n : num(n)}${unit}`,
      ...(decimal ? { decimal: n } : {}),
    })
  })
  claim(ctx, RE_VERSION_V, (m) => {
    const v = (m[1] as string).replace(RE_UNDERSCORE, '.')
    return make(ctx, m.index, m.index + m[0].length, 'version', `v${v.replace(RE_DOT, '')}`, { key: `v${v}` })
  })
  claim(ctx, RE_VERSION_WORD, (m) => {
    if (!c.versionWords.has(m[1] as string)) return null
    const v = m[2] as string
    return make(ctx, m.index, m.index + m[0].length, 'version', `v${v.replace(RE_DOT, '')}`, { key: `v${v}` })
  })
  claim(ctx, RE_DECIMAL, (m) => make(ctx, m.index, m.index + m[0].length, 'noise', '', { decimal: m[0] }))
}

/** The glued marker form `Ep3`, `Teil2`: marker word + digits in one token. */
function gluedMarker(ascii: string, c: Compiled): { spec: MarkerSpec; n: string } | null {
  const g = RE_GLUED_MARKER.exec(ascii)
  if (g === null) return null
  const spec = c.markers.get(g[1] as string)
  return spec === undefined ? null : { spec, n: num(g[2] as string) }
}

/** Step 1b: code runs on the cased text (SPEC 5.1 step 1b). */
function claimCodeRuns(ctx: Ctx, c: Compiled): void {
  if (ctx.up === null) return
  const up = ctx.up
  let masked = ''
  for (let i = 0; i < ctx.s.length; i++) masked += ctx.taken[i] === 1 ? ' ' : (ctx.s[i] as string)
  RE_CODE_RUN.lastIndex = 0
  for (let m = RE_CODE_RUN.exec(masked); m !== null; m = RE_CODE_RUN.exec(masked)) {
    let start = m.index
    let end = start + m[0].length
    const before = start > 0 ? (ctx.s[start - 1] as string) : ''
    const after = end < ctx.s.length ? (ctx.s[end] as string) : ''
    if (
      (before !== '' && (isLetter(before) || RE_HAS_DIGIT.test(before))) ||
      (after !== '' && (isLetter(after) || RE_HAS_DIGIT.test(after)))
    )
      continue
    const trim = () => {
      while (start < end && '-./'.includes(ctx.s[start] as string)) start++
      while (end > start && '-./'.includes(ctx.s[end - 1] as string)) end--
    }
    trim()
    if (!qualifies(ctx.s, up, start, end)) continue
    // a hyphen followed by a word of 4+ letters with lower-case letters ends the run (`B2B-Marketing`)
    const run = ctx.s.slice(start, end)
    RE_RUN_WORD_TAIL.lastIndex = 0
    for (let t = RE_RUN_WORD_TAIL.exec(run); t !== null; t = RE_RUN_WORD_TAIL.exec(run)) {
      let lower = false
      for (let i = start + t.index + 1; i < start + t.index + t[0].length; i++) if (up[i] !== true) lower = true
      if (lower) {
        end = start + t.index
        break
      }
    }
    trim()
    if (start >= end || !qualifies(ctx.s, up, start, end)) continue
    const text = ctx.s.slice(start, end).replace(RE_NON_ALNUM, '')
    if (RE_QUARTER.test(text) || gluedMarker(text, c) !== null) continue
    let allUpper = true
    for (let i = start; i < end; i++) if (RE_HAS_LETTER.test(ctx.s[i] as string) && up[i] !== true) allUpper = false
    for (let i = start; i < end; i++) ctx.taken[i] = 1
    // look-alike chars mixing `[01]` with `[oli]` are noise, also in a code run (5.2: `Il1`, `O0`)
    if (RE_LOOKALIKE_PAIR.test(text) && !c.lexicon.hasExact(text)) ctx.out.push(make(ctx, start, end, 'noise', text))
    else ctx.out.push(codeTok(make(ctx, start, end, 'code', text, { capsRun: allUpper })))
  }
}

/** Code run condition: an upper-case letter; a `-`, `/`, `(` or a digit; and a digit or only upper-case letters. */
function qualifies(s: string, up: readonly boolean[], start: number, end: number): boolean {
  let hasUpper = false
  let hasLower = false
  let special = false
  let digit = false
  for (let i = start; i < end; i++) {
    const ch = s[i] as string
    if (RE_HAS_LETTER.test(ch)) {
      if (up[i] === true) hasUpper = true
      else hasLower = true
    } else if (RE_HAS_DIGIT.test(ch)) digit = true
    else if (ch === '-' || ch === '/' || ch === '(') special = true
  }
  return hasUpper && (special || digit) && (digit || !hasLower)
}

/** Code display rule (SPEC 5.2): 8 chars or less and a digit or an all-caps run; else noise. */
function codeTok(t: Tok): Tok {
  const ok = t.ascii.length <= 8 && (RE_HAS_DIGIT.test(t.ascii) || t.capsRun === true)
  return ok ? { ...t, cls: 'code', key: `c${t.ascii}` } : { ...t, cls: 'noise' }
}

interface Piece {
  text: string
  start: number
  ascii: string
}

/**
 * Parts of one letter are dropped (SPEC 5.1 step 3, `B-Test` -> `test`), unless the letter joined with
 * the next part is a lexicon word (`E-Mail-Vorlage` keeps `e|mail|vorlage`, 5.1 step 4).
 */
function dropLetterParts(group: Piece[], c: Compiled): Piece[] {
  if (group.length < 2) return group
  const out: Piece[] = []
  for (let i = 0; i < group.length; i++) {
    const g = group[i] as Piece
    const next = group[i + 1]
    const letter = g.ascii.length === 1 && RE_HAS_LETTER.test(g.ascii)
    if (letter && !(next !== undefined && c.lexicon.hasExact(g.ascii + next.ascii))) continue
    out.push(g)
  }
  return out.length > 0 ? out : group
}

/**
 * Step 2 and 3: split the rest into word tokens; inner hyphens keep the token and record parts. A
 * number followed by a hyphen and a word of 4+ letters is its own token (`3-Zimmer-Wohnung` -> `3` +
 * `zimmer|wohnung`), like the hyphen-word cut of code runs (5.1 step 1b).
 */
function splitWords(ctx: Ctx, c: Compiled): void {
  let masked = ''
  for (let i = 0; i < ctx.s.length; i++) masked += ctx.taken[i] === 1 ? ' ' : (ctx.s[i] as string)
  RE_TOKEN_CHARS.lastIndex = 0
  for (let m = RE_TOKEN_CHARS.exec(masked); m !== null; m = RE_TOKEN_CHARS.exec(masked)) {
    const pieces = m[0].split('-')
    let pos = m.index
    let group: Piece[] = []
    const flush = () => {
      const kept = dropLetterParts(
        group.filter((g) => g.ascii !== ''),
        c,
      )
      group = []
      if (kept.length === 0) return
      const first = kept[0] as Piece
      const last = kept[kept.length - 1] as Piece
      const parts = kept.map((g) => g.ascii)
      const extra: Partial<Tok> = parts.length > 1 ? { parts } : {}
      ctx.out.push(make(ctx, first.start, last.start + last.text.length, 'word', parts.join(''), extra))
    }
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k] as string
      if (p === '') flush()
      else {
        group.push({ text: p, start: pos, ascii: asciiFold(p).replace(RE_NON_ALNUM, '') })
        const next = pieces[k + 1]
        if (group.length === 1 && RE_DIGITS.test(p) && next !== undefined && RE_HYPHEN_WORD.test(next)) flush()
      }
      pos += p.length + 1
    }
    flush()
  }
}

/** Step-0 candidate (SPEC 4.4): 2 to 6 upper-case letters, optionally followed by a lower-case `s`. */
function capsAbbrOf(ctx: Ctx, t: Tok): string | undefined {
  if (ctx.up === null || t.parts !== undefined || RE_HAS_DIGIT.test(t.ascii) || t.text !== t.ascii) return undefined
  const n = t.ascii.length
  let ups = 0
  for (let i = t.start; i < t.end; i++) if (ctx.up[i] === true) ups++
  if (ups === n && n >= 2 && n <= 6) return t.ascii
  if (ups === n - 1 && n >= 3 && n <= 7 && t.ascii.endsWith('s') && ctx.up[t.end - 1] !== true)
    return t.ascii.slice(0, -1)
  return undefined
}

function allUpperLetters(t: Tok): boolean {
  return t.case === 'upper' || (t.case === 'title' && t.ascii.length === 1)
}

/** Replacement words of normalize (SPEC 4.1); written by the library, so their case flag is `unknown`. */
const REPLACED: ReadonlySet<string> = new Set(['cpp', 'csharp', 'dotnet'])

/** Classify a word token by its own text (SPEC 5.2). */
function classifyWord(ctx: Ctx, tok: Tok, c: Compiled): Tok[] {
  const a = tok.ascii
  // `C++`, `C#` and `.NET` are replaced in normalize (4.1): their case says nothing
  const t: Tok =
    tok.parts === undefined && REPLACED.has(a) && tok.case === 'lower'
      ? { ...tok, case: 'unknown', cap: false, innerCaps: false }
      : tok
  if (t.parts === undefined && RE_DIGITS.test(a)) {
    return [{ ...t, cls: 'smallnum', value: Number(a) }]
  }
  const ap = RE_AMPM_GLUED.exec(a)
  if (ap !== null && t.parts === undefined) {
    const n = Number(ap[1])
    const split = t.start + (ap[1] as string).length
    const numTok = make(ctx, t.start, split, 'smallnum', ap[1] as string, { value: n })
    const pm = make(ctx, split, t.end, n >= 1 && n <= 12 ? 'noise' : 'word', ap[2] as string)
    return [numTok, pm]
  }
  if (RE_ORDINAL.test(a)) return [{ ...t, cls: 'noise' }]
  if (RE_QUARTER.test(a)) return [{ ...t, cls: 'quarter', key: a }]
  const g = t.parts === undefined ? gluedMarker(a, c) : null
  if (g !== null)
    return [{ ...t, cls: 'marker', key: g.spec.prefix + g.n, ascii: g.spec.prefix + g.n, markerWord: g.spec.word }]
  if (RE_HAS_DIGIT.test(a) && RE_HAS_LETTER.test(a)) {
    if (RE_LOOKALIKE_PAIR.test(a) && !c.lexicon.hasExact(a)) return [{ ...t, cls: 'noise' }]
    return [codeTok({ ...t, cls: 'code' })]
  }
  const caps = capsAbbrOf(ctx, t)
  const base: Tok = caps !== undefined ? { ...t, capsAbbr: caps } : t
  if (a.length === 1) return [{ ...base, letter: true }]
  if (RE_ROMAN.test(a) && allUpperLetters(t) && !c.lexicon.hasExact(a)) return [{ ...base, letter: true }]
  return [base]
}

/** A Roman numeral 1..10 in upper case, as a marker value. */
function romanValue(t: Tok): number | null {
  if (!allUpperLetters(t)) return null
  const i = MARKER_ROMAN.indexOf(t.ascii)
  return i === -1 ? null : i + 1
}

/** Marker value of the token after a marker word, or null (SPEC 5.3). */
function markerValue(t: Tok, spec: MarkerSpec, c: Compiled): string | null {
  if (t.cls === 'smallnum' && t.ascii.length <= 3) return num(t.ascii)
  if (t.cls === 'word' || t.letter === true) {
    const nw = c.anyNumberWord.get(t.ascii)
    if (nw !== undefined) return String(nw)
    const r = romanValue(t)
    if (r !== null) return String(r)
    if (spec.takes !== 'number' && t.ascii.length === 1 && RE_HAS_LETTER.test(t.ascii)) return t.ascii
    if (spec.takes === 'number-letter-or-size' && MARKER_SIZES.includes(t.ascii)) return t.ascii
  }
  if (spec.takes === 'number-or-class' && RE_CLASS_VALUE.test(t.ascii) && t.parts === undefined) return t.ascii
  return null
}

/** Marker pass (SPEC 5.3): marker word(s) + optional `nr`/`no` + value give one marker token. */
function markers(ctx: Ctx, toks: Tok[], c: Compiled): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok
    let done = false
    if (t.cls === 'word') {
      for (let n = Math.min(c.maxMarkerWords, toks.length - i); n >= 1 && !done; n--) {
        const ws = toks.slice(i, i + n)
        if (ws.some((w) => w.cls !== 'word')) continue
        const spec = c.markers.get(ws.map((w) => w.ascii).join(' '))
        if (spec === undefined) continue
        let j = i + n
        const nr = toks[j]
        if (nr !== undefined && nr.cls === 'word' && (nr.ascii === 'nr' || nr.ascii === 'no')) j++
        const vt = toks[j]
        if (vt === undefined) continue
        let v = markerValue(vt, spec, c)
        // `Teil #2`: the `#` marker after a marker word gives its number (marker word + optional `#`, 5.2)
        if (v === null && vt.cls === 'marker' && vt.markerWord === '#' && vt.key !== undefined) {
          const d = vt.key.slice(MARKER_HASH_PREFIX.length)
          if (d.length <= 3) v = d
        }
        if (v === null) continue
        const key = spec.prefix + v
        out.push(
          make(ctx, t.start, vt.end, 'marker', key, {
            key,
            markerWord: spec.word,
            text: ctx.s.slice(t.start, vt.end),
          }),
        )
        i = j
        done = true
      }
    }
    if (!done) out.push(t)
  }
  return out
}

function adjacent(s: string, a: Tok, b: Tok): boolean {
  for (let i = a.end; i < b.start; i++) if (!RE_SPACE_CHAR.test(s[i] as string)) return false
  return true
}

/** Context rules after the marker pass (SPEC 5.1, 5.2, 5.4). */
function context(ctx: Ctx, toks: Tok[], c: Compiled): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i] as Tok
    const prev = out[out.length - 1]
    const next = toks[i + 1]
    // pending letters and Roman numerals not taken by a marker are noise
    if (t.letter === true) {
      out.push({ ...t, cls: 'noise' })
      continue
    }
    // [ilo] tokens of 3 chars or less that are no lexicon word
    if (t.cls === 'word' && RE_ILO_ONLY.test(t.ascii) && !c.lexicon.hasExact(t.ascii)) {
      out.push({ ...t, cls: 'noise' })
      continue
    }
    // a marker word without its number right after an ordinal is noise (`1st level support`, 5.3)
    if (t.cls === 'word' && prev?.cls === 'noise' && RE_ORDINAL.test(prev.ascii) && c.markers.has(t.ascii)) {
      out.push({ ...t, cls: 'noise' })
      continue
    }
    // am/pm directly after a number 1 to 12 (`2 PM`)
    if (t.cls === 'word' && (t.ascii === 'am' || t.ascii === 'pm') && prev?.cls === 'smallnum') {
      const v = prev.value ?? 0
      if (v >= 1 && v <= 12) {
        out.push({ ...t, cls: 'noise' })
        continue
      }
    }
    // standard prefix + number -> code (`ISO 9001`, `RFC 9110`)
    if (t.cls === 'word' && RE_STANDARD_PREFIX.test(t.ascii) && next !== undefined && adjacent(ctx.s, t, next)) {
      const digits = next.cls === 'smallnum' || next.cls === 'longnum' || next.cls === 'year' ? next.ascii : ''
      if (digits !== '' && RE_DIGITS.test(digits)) {
        // no `capsRun`: a standard code is no code run, so it joins no short all-caps token (DEVIATIONS)
        const merged = codeTok(make(ctx, t.start, next.end, 'code', t.ascii + digits))
        // standard prefixes right before it are part of the norm name (`DIN EN ISO 9001`): noise
        for (let k = out.length - 1; k >= 0; k--) {
          const p = out[k] as Tok
          const after = k === out.length - 1 ? t : (out[k + 1] as Tok)
          if (p.cls !== 'word' || !RE_STANDARD_PREFIX.test(p.ascii) || !adjacent(ctx.s, p, after)) break
          out[k] = { ...p, cls: 'noise' }
        }
        out.push(merged)
        i++
        continue
      }
    }
    // decimal after a version compound (`Versionshinweise 5.1`)
    if (t.decimal !== undefined && t.cls === 'noise' && prev !== undefined && RE_DECIMAL_VERSION.test(t.decimal)) {
      const pa = prev.ascii
      if (prev.cls === 'word' && [...c.versionWords].some((v) => v.length >= 5 && pa.includes(v))) {
        t = versionFromDecimal(t)
      }
    }
    // months (SPEC 5.4): capitalized, or next to a year or a day number
    if (t.cls === 'word') {
      const m = c.months.get(t.ascii)
      if (m !== undefined) {
        // capitalization at title start says nothing: `August` the first name stays a word (5.4)
        // ... unless another month or weekday follows within two tokens (`März bis Mai Planung`)
        const timeWord = (x: Tok | undefined) =>
          x !== undefined && x.cls === 'word' && (c.months.has(x.ascii) || c.weekdays.has(x.ascii))
        const cap = t.cap && (prev !== undefined || timeWord(next) || timeWord(toks[i + 2]))
        const dayBefore = prev?.cls === 'smallnum' && (prev.value ?? 0) >= 1 && (prev.value ?? 0) <= 31
        const yearNear = prev?.cls === 'year' || next?.cls === 'year'
        if (cap || dayBefore || yearNear) t = { ...t, cls: 'month', key: `m${String(m).padStart(2, '0')}` }
      }
    }
    if (t.cls === 'word') {
      const wd = c.weekdays.get(t.ascii)
      if (wd !== undefined) {
        let ok = !wd.short
        if (wd.short) {
          const cap = t.cap
          const near = (x: Tok | undefined) =>
            x !== undefined &&
            (x.cls === 'smallnum' || x.date === true || x.cls === 'weekday' || c.weekdays.has(x.ascii))
          ok = cap && (near(prev) || near(next))
        }
        if (ok) t = { ...t, cls: 'weekday', key: `wd${wd.d}` }
      }
    }
    out.push(t)
  }
  // code runs join an adjacent all-caps token of 1 to 3 letters (`SKU A-4471` -> `skua4471`). Not a
  // lexicon word, known abbreviation or standard prefix (`COVID-19 FAQ`, `IT PROJ-1234`, `EN ISO 9001`),
  // and only when the joined code stays within the 8-char display limit (DEVIATIONS).
  const shortCaps = (x: Tok | undefined): x is Tok =>
    x !== undefined &&
    x.cls === 'word' &&
    x.parts === undefined &&
    x.case === 'upper' &&
    x.ascii.length <= 3 &&
    !RE_HAS_DIGIT.test(x.ascii) &&
    !RE_STANDARD_PREFIX.test(x.ascii) &&
    !c.lexicon.hasExact(x.ascii) &&
    c.lexicon.knownAbbr(x.ascii).length === 0
  const joined: Tok[] = []
  for (let i = 0; i < out.length; i++) {
    const t = out[i] as Tok
    if ((t.cls === 'code' || t.cls === 'noise') && t.capsRun !== undefined) {
      const prev = joined[joined.length - 1]
      let cur = t
      if (shortCaps(prev) && adjacent(ctx.s, prev, t) && prev.ascii.length + t.ascii.length <= 8) {
        joined.pop()
        cur = codeTok(make(ctx, prev.start, t.end, 'code', prev.ascii + t.ascii, { capsRun: t.capsRun }))
      }
      const next = out[i + 1]
      if (shortCaps(next) && adjacent(ctx.s, t, next) && cur.ascii.length + next.ascii.length <= 8) {
        cur = codeTok(make(ctx, cur.start, next.end, 'code', cur.ascii + next.ascii, { capsRun: t.capsRun }))
        i++
      }
      joined.push(cur)
      continue
    }
    joined.push(t)
  }
  return joined
}

/** A decimal in a version position becomes a version (`3.12` -> key `v3.12`, display `v312`). */
export function versionFromDecimal(t: Tok): Tok {
  const d = t.decimal as string
  const { decimal: _d, ...rest } = t
  return { ...rest, cls: 'version', key: `v${d}`, ascii: `v${d.replace(RE_DOT, '')}` }
}

/** Tokenize a normalized title (SPEC 5). Deny tokens are not removed here (see `dropDeny`). */
export function tokenize(n: Normalized, c: Compiled): Tok[] {
  const ctx: Ctx = { s: n.surface, up: n.up, tr: n.tr, taken: new Uint8Array(n.surface.length), out: [] }
  claimNumbers(ctx, c)
  claimCodeRuns(ctx, c)
  splitWords(ctx, c)
  const sorted = [...ctx.out].sort((a, b) => a.start - b.start || a.end - b.end)
  const classified: Tok[] = []
  for (const t of sorted) {
    if (t.cls === 'word') classified.push(...classifyWord(ctx, t, c))
    else classified.push(t)
  }
  return context(ctx, markers(ctx, classified, c), c)
}

/**
 * Drop deny tokens right after tokenizing (SPEC 6.6): single tokens by ascii, multi-word entries as
 * token sequences. Returns the kept tokens and the dropped ones.
 */
export function dropDeny(toks: readonly Tok[], c: Compiled): { kept: Tok[]; denied: Tok[] } {
  const kept: Tok[] = []
  const denied: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok
    let n = 0
    for (const seq of c.deny.multi) {
      if (seq.length <= n) continue
      if (seq.every((w, k) => toks[i + k]?.ascii === w)) n = seq.length
    }
    if (n === 0 && c.deny.single.has(t.ascii)) n = 1
    if (n === 0 && t.parts !== undefined && t.parts.some((p) => c.deny.single.has(p))) n = 1
    if (n > 0) {
      for (let k = 0; k < n; k++) denied.push({ ...(toks[i + k] as Tok), drop: 'deny' })
      i += n - 1
      continue
    }
    kept.push(t)
  }
  return { kept, denied }
}
