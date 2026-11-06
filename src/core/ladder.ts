/**
 * Ladders (SPEC 11, step 10): the display forms ("rungs") of each concept, with a cost and a plain or
 * cryptic flag. Graphemes, cuts and skeletons work on the ascii word; number classes get fixed forms.
 * Every rung passes B1, B2 (not verbatim), B7 (hard words) and I8 before the fit sees it.
 */

import type { ConceptClass, ResolvedConfig } from '../config.ts'
import { MONTHS_EN } from '../data/v1/months.ts'
import { CODAS_EN, ONSETS_EN, SINGLE_CONSONANTS } from '../data/v1/phonology.ts'
import { WEEKDAYS_EN } from '../data/v1/weekdays.ts'
import type { Compiled } from './compile.ts'
import { joinParts, type PartInfo } from './compound.ts'
import type { ConceptX } from './concepts.ts'
import { fold, hardHitIn, hasLookalikePair, rungBlocked, segmentBlocked } from './safety.ts'

export type RungKind =
  | 'lexicon'
  | 'joined'
  | 'full'
  | 'number'
  | 'code'
  | 'morph'
  | 'head'
  | 'coda'
  | 'syll'
  | 'skeleton'

/** One display form of a concept (SPEC 11.1). */
export interface Rung {
  /** Display text. A wide range rung shows its two segments joined by '-'. */
  readonly text: string
  /** Body segments of the rung: one, or two for a wide range (SPEC 11.5). */
  readonly segs: readonly string[]
  readonly kind: RungKind
  readonly cost: number
  /** Plain rungs pay no cryptic cost in the fit (SPEC 11.1). */
  readonly plain: boolean
  /** Equals a full user token or a whole compound part of it (SPEC 9.2). */
  readonly verbatim: boolean
}

/** A rung the safety rules removed, for `explain()` (SPEC 16.4). */
export interface RejectedRung {
  readonly text: string
  readonly rule: 'B1' | 'B2' | 'B7' | 'I8' | 'name' | 'low-score'
}

/** A ranked concept with its ladder. */
export interface Laddered extends ConceptX {
  readonly ladder: readonly Rung[]
  readonly rejected: readonly RejectedRung[]
}

/** Rung costs (SPEC 11.1). */
export const RUNG_COST: Readonly<
  Record<'abbrStep' | 'fullShort' | 'fullLong' | 'numberLong' | 'morph' | 'head' | 'coda' | 'syll' | 'skeleton', number>
> = Object.freeze({
  abbrStep: 15,
  fullShort: 0,
  fullLong: 40,
  numberLong: 30,
  morph: 60,
  head: 60,
  coda: 90,
  syll: 110,
  skeleton: 200,
})

/** Rungs kept per concept (SPEC 11.1). */
export const LADDER_SIZE = 4
/** Concepts below this score keep only rungs with cost <= LOW_SCORE_MAX_COST. */
export const LOW_SCORE = 150
export const LOW_SCORE_MAX_COST = 110

const WORD_CLASSES: ReadonlySet<ConceptClass> = new Set<ConceptClass>([
  'topic',
  'name',
  'acronym',
  'attr',
  'qualifier',
  'place',
  'direction',
  'region',
])

// ---------------------------------------------------------------------------------------------
// Graphemes (SPEC 11.2)
// ---------------------------------------------------------------------------------------------

export interface Grapheme {
  readonly text: string
  readonly vowel: boolean
}

const CONS_UNITS: readonly string[] = [
  'tsch',
  'sch',
  'ch',
  'ck',
  'ph',
  'th',
  'sh',
  'qu',
  'ng',
  'tz',
  'pf',
  'ss',
  'll',
  'mm',
  'nn',
  'tt',
  'ff',
  'pp',
  'rr',
]
const VOWEL_UNITS: readonly string[] = ['aeu', 'ae', 'oe', 'ue', 'ie', 'ei', 'ai', 'au', 'eu', 'ee', 'aa', 'oo', 'ou']
const VOWELS = 'aeiouy'

/** Split an ascii word into units, greedy left to right, longest first (SPEC 11.2). */
export function graphemes(ascii: string): Grapheme[] {
  const out: Grapheme[] = []
  let i = 0
  while (i < ascii.length) {
    let hit: Grapheme | undefined
    for (let n = 4; n >= 2 && hit === undefined; n--) {
      const s = ascii.slice(i, i + n)
      if (s.length !== n) continue
      if (CONS_UNITS.includes(s)) hit = { text: s, vowel: false }
      else if (VOWEL_UNITS.includes(s)) hit = { text: s, vowel: true }
    }
    const ch = ascii[i] as string
    hit ??= { text: ch, vowel: VOWELS.includes(ch) }
    out.push(hit)
    i += hit.text.length
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Cuts (SPEC 11.3)
// ---------------------------------------------------------------------------------------------

/** Coda and onset sets of one language (single consonants are always allowed). */
export interface Phonology {
  readonly codas: ReadonlySet<string>
  readonly onsets: ReadonlySet<string>
}

const phonologyCache = new Map<string, Phonology>()

/** Phonology tables for the cuts: the pack's tables, or the `en` tables (SPEC 6.7, 11.3). */
export function phonologyOf(
  ph: { readonly codas: readonly string[]; readonly onsets: readonly string[] } | undefined,
): Phonology {
  const codas = ph?.codas ?? CODAS_EN
  const onsets = ph?.onsets ?? ONSETS_EN
  const key = `${codas.join(',')}|${onsets.join(',')}`
  let p = phonologyCache.get(key)
  if (p === undefined) {
    p = { codas: new Set([...SINGLE_CONSONANTS, ...codas]), onsets: new Set([...SINGLE_CONSONANTS, ...onsets]) }
    if (phonologyCache.size > 32) phonologyCache.clear()
    phonologyCache.set(key, p)
  }
  return p
}

export interface CutWord {
  readonly ascii: string
  readonly phonology: Phonology
  /** Prefix lengths that end at a compound part boundary. */
  readonly boundaries: ReadonlySet<number>
  /** True when the prefix is a lexicon key or form (it may then end on a vowel). */
  readonly lexForm: (p: string) => boolean
}

export interface Cut {
  readonly text: string
  readonly kind: 'morph' | 'coda' | 'syll'
  readonly cost: number
}

function finalCluster(head: readonly Grapheme[]): string {
  let s = ''
  for (let i = head.length - 1; i >= 0; i--) {
    const u = head[i] as Grapheme
    if (u.vowel) break
    s = u.text + s
  }
  return s
}

function isSyllableBoundary(g: readonly Grapheme[], i: number, onsets: ReadonlySet<string>): boolean {
  const a = g[i - 1]
  const b = g[i]
  if (a === undefined || b === undefined || a.vowel || b.vowel) return false
  let run = ''
  let j = i
  for (; j < g.length && !(g[j] as Grapheme).vowel; j++) run += (g[j] as Grapheme).text
  if (j >= g.length) return false // no vowel follows: not an onset
  return onsets.has(run)
}

/** Prefix cuts of 3 to 7 chars (SPEC 11.3). */
export function cuts(word: CutWord): Cut[] {
  const g = graphemes(word.ascii)
  const out: Cut[] = []
  let len = 0
  for (let i = 1; i < g.length; i++) {
    len += (g[i - 1] as Grapheme).text.length
    if (len < 3 || len > 7 || len > word.ascii.length - 2) continue
    const head = g.slice(0, i)
    if (!head.some((u) => u.vowel)) continue
    const p = head.map((u) => u.text).join('')
    if ((head[i - 1] as Grapheme).vowel && !word.lexForm(p)) continue
    if (!(head[i - 1] as Grapheme).vowel && !word.phonology.codas.has(finalCluster(head))) continue
    const kind = word.boundaries.has(len)
      ? 'morph'
      : (g[i] as Grapheme).vowel
        ? 'coda'
        : isSyllableBoundary(g, i, word.phonology.onsets)
          ? 'syll'
          : null
    if (kind !== null) out.push({ text: p, kind, cost: RUNG_COST[kind] })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Skeleton (SPEC 11.4)
// ---------------------------------------------------------------------------------------------

const SONORANTS = 'rlmn'

/** Consonant skeleton of a word of 7+ chars, or null (SPEC 11.4). */
export function skeleton(ascii: string): string | null {
  if (ascii.length < 7) return null
  const first = ascii[0] as string
  // drop vowels, then collapse runs of the same char
  let c = ''
  for (const ch of ascii.slice(1)) {
    if (VOWELS.includes(ch)) continue
    if (c[c.length - 1] !== ch) c += ch
  }
  // ch, sh, th -> c, s, t (also ph... only [csth] + h)
  let d = ''
  for (let i = 0; i < c.length; i++) {
    const ch = c[i] as string
    d += ch
    if ('csth'.includes(ch) && c[i + 1] === 'h') i++
  }
  // drop a sonorant before a consonant that is not a sonorant
  let e = ''
  for (let i = 0; i < d.length; i++) {
    const ch = d[i] as string
    const next = d[i + 1]
    if (SONORANTS.includes(ch) && next !== undefined && !SONORANTS.includes(next)) continue
    e += ch
  }
  if (e.length > 3) e = e.slice(0, 2) + e[e.length - 1]
  const s = first + e
  return s.length >= 3 ? s : null
}

// ---------------------------------------------------------------------------------------------
// Ladder build (SPEC 11.1, 11.5)
// ---------------------------------------------------------------------------------------------

interface Draft {
  text: string
  segs: readonly string[]
  kind: RungKind
  cost: number
  plain: boolean
}

function fullCost(text: string): number {
  return text.length <= 6 ? RUNG_COST.fullShort : RUNG_COST.fullLong
}

/** Display row of a month or weekday: the pack row that holds the word, else the row of the key. */
function rowOf(
  c: Compiled,
  lang: string,
  word: string,
  index: number,
  field: 'months' | 'weekdays',
  fallback: readonly (readonly string[])[],
): readonly string[] | undefined {
  const own = c.pack(lang)
  const order = [own, ...c.packs.filter((p) => p !== own)]
  for (const p of order) {
    const row = p?.[field]?.find((r) => r.includes(word))
    if (row !== undefined) return row
  }
  return (own?.[field] ?? fallback)[index]
}

function numberDrafts(c: ConceptX, comp: Compiled): Draft[] {
  const key = c.key
  const num = (text: string, cost = 0): Draft => ({ text, segs: [text], kind: 'number', cost, plain: true })
  switch (c.cls) {
    case 'year': {
      const y = key.slice(1)
      if (c.tok.fy === true) return [num(`fy${y.slice(2)}`)]
      if (c.tok.historic === true) return [num(y)]
      return [num(y.slice(2)), num(y, RUNG_COST.numberLong)]
    }
    case 'range': {
      const [a = '', b = ''] = key.slice(1).split('-')
      const span = Number(b) - Number(a)
      if (span <= 9 && a.slice(0, 2) === b.slice(0, 2)) return [num(a.slice(2) + b.slice(2))]
      return [{ text: `${a}-${b}`, segs: [a, b], kind: 'number', cost: 0, plain: true }]
    }
    case 'quarter':
      return [num(key)]
    case 'month': {
      const m = Number(key.slice(1))
      const row = rowOf(comp, c.lang, c.display, m - 1, 'months', MONTHS_EN)
      return row?.[0] !== undefined ? [num(row[0])] : []
    }
    case 'week': {
      const n = key.replace('kw', '')
      const pack = comp.pack(c.lang)
      const prefix = pack?.weekPrefix ?? (c.tok.ascii.startsWith('kw') ? 'kw' : 'wk')
      return [num(prefix + n)]
    }
    case 'weekday': {
      const d = Number(key.slice(2))
      const row = rowOf(comp, c.lang, c.display, d - 1, 'weekdays', WEEKDAYS_EN)
      if (row === undefined) return []
      const out: Draft[] = []
      for (const f of row) if (f.length === 3) out.push(num(f))
      const full = row[0] as string
      out.push(num(full, fullCost(full)))
      return out
    }
    case 'version': {
      const [major = '', minor] = key.slice(1).split('.')
      return [num(`v${major}${minor ?? ''}`)]
    }
    case 'marker':
      return [num(key)]
    case 'model':
      return [num(key.slice(1))]
    case 'longnum':
      return [num(key.slice(-4))]
    case 'code': {
      const t = key.slice(1)
      return t.length <= 8 ? [{ text: t, segs: [t], kind: 'code', cost: 0, plain: true }] : []
    }
    case 'quantity': {
      const t = key.slice(1)
      return t.includes('.') ? [] : [num(t)]
    }
    default:
      return []
  }
}

/** All lexicon abbreviations and keys/forms of other entries, for the name rung rule (SPEC 6.6). */
const abbrCache = new WeakMap<Compiled, ReadonlySet<string>>()
function allAbbrs(comp: Compiled): ReadonlySet<string> {
  let s = abbrCache.get(comp)
  if (s === undefined) {
    const out = new Set<string>()
    for (const e of comp.lexicon.entries) for (const a of e.abbr ?? []) out.add(a)
    s = out
    abbrCache.set(comp, s)
  }
  return s
}

/** The parts of the token behind a word concept, when the concept spans the parts (SPEC 7.3). */
function partsOf(c: ConceptX): readonly PartInfo[] | undefined {
  if (c.parts !== undefined) return c.parts
  const plan = c.tok.split
  if (plan !== undefined && joinParts(plan.parts) === c.display) return plan.parts
  return undefined
}

/** All part texts of the source token (verbatim and plain checks). */
function tokenParts(c: ConceptX): readonly PartInfo[] {
  return c.tok.split?.parts ?? []
}

const RE_ONE_WORD = /^[a-z0-9]+$/

/**
 * The word the rungs are built from (SPEC 4.4 step 2, 11.1). A single-word lexicon entry that has the
 * same stem as the typed word (an inflected form: `umzuege`, `haeuser`, `besprechungen`) gives its key,
 * so every inflection of one entry gets the same ladder. Other words (no entry, a compound concept, a
 * phrase, or a form with another stem such as `kita`) keep the typed ascii. The typed word stays a
 * verbatim form of the concept.
 */
export function rungBase(c: ConceptX, comp: Compiled): string {
  const word = c.display
  const lex = c.lex
  if (lex === undefined || c.parts !== undefined || c.tok.words !== undefined) return word
  const key = lex.key
  if (key === word || !RE_ONE_WORD.test(key) || key.length < 2) return word
  for (const lang of new Set<string>([c.lang, lex.lang ?? c.lang])) {
    const st = comp.stemmer(lang)
    if (st.stem(key) === st.stem(word)) return key
  }
  return word
}

function wordDrafts(c: ConceptX, comp: Compiled): Draft[] {
  const out: Draft[] = []
  const word = rungBase(c, comp)
  const isName = c.cls === 'name'
  const all = tokenParts(c)
  const lowly = (p: PartInfo) => p.kind === 'weak' || p.kind === 'generic'
  /** A whole part of 5+ chars, and every other part of the token is weak, noise or generic (SPEC 7.3). */
  const plainPart = (text: string) => {
    const hit = all.find((p) => p.text === text)
    if (hit === undefined || text.length < 5) return false
    return all.every((p) => p === hit || lowly(p))
  }
  const isPartText = (text: string) => all.some((p) => p.text === text) || (c.tok.parts ?? []).includes(text)

  // acronyms: the full word only (SPEC 6.6)
  if (c.cls === 'acronym') return [{ text: word, segs: [word], kind: 'full', cost: 0, plain: true }]

  const parts = partsOf(c)
  const lex = c.lex
  // lexicon abbreviations (not for one-concept compounds: their entry is the head's)
  if (lex !== undefined && lex.cls !== 'marker' && c.parts === undefined) {
    const known = lex.known ?? []
    ;(lex.abbr ?? []).forEach((a, i) => {
      out.push({
        text: a,
        segs: [a],
        kind: 'lexicon',
        cost: RUNG_COST.abbrStep * i,
        plain: known.includes(a) || isPartText(a),
      })
    })
  }
  // full word
  if (isName) {
    if (word.length <= 12)
      out.push({ text: word, segs: [word], kind: 'full', cost: word.length <= 8 ? 0 : RUNG_COST.fullLong, plain: true })
  } else out.push({ text: word, segs: [word], kind: 'full', cost: fullCost(word), plain: true })

  const boundaries = new Set<number>()
  if (parts !== undefined && parts.length > 1) {
    // morph rungs: every prefix that ends at a part boundary; head rung: the last part (SPEC 7.3)
    for (let i = 1; i < parts.length; i++) {
      const prefix = joinParts(parts.slice(0, i))
      boundaries.add(prefix.length)
      out.push({ text: prefix, segs: [prefix], kind: 'morph', cost: RUNG_COST.morph, plain: plainPart(prefix) })
    }
    const head = (parts[parts.length - 1] as PartInfo).text
    out.push({ text: head, segs: [head], kind: 'head', cost: RUNG_COST.head, plain: plainPart(head) })
    // joined abbr rungs: one part's abbr joined with the full form or abbr of the others, 8 chars or less
    if (c.parts !== undefined) out.push(...joinedAbbrs(c.parts))
  }
  // cuts (no morph kind for names) and the skeleton (not for names)
  const ph = phonologyOf(comp.pack(c.lang)?.phonology)
  for (const cut of cuts({ ascii: word, phonology: ph, boundaries, lexForm: (p) => comp.lexicon.hasExact(p) })) {
    if (isName && cut.kind === 'morph') continue
    out.push({
      text: cut.text,
      segs: [cut.text],
      kind: cut.kind,
      cost: cut.cost,
      plain: cut.kind === 'morph' && plainPart(cut.text),
    })
  }
  if (!isName) {
    const sk = skeleton(word)
    if (sk !== null) out.push({ text: sk, segs: [sk], kind: 'skeleton', cost: RUNG_COST.skeleton, plain: false })
  }
  return out
}

function joinedAbbrs(parts: readonly PartInfo[]): Draft[] {
  const choices = parts.map((p) => {
    const own: { text: string; cost: number; abbr: boolean; plain: boolean }[] = [
      { text: p.text, cost: 0, abbr: false, plain: true },
    ]
    const lex = p.lex
    if (lex !== undefined && lex.cls !== 'marker')
      (lex.abbr ?? []).forEach((a, i) => {
        own.push({ text: a, cost: RUNG_COST.abbrStep * i, abbr: true, plain: (lex.known ?? []).includes(a) })
      })
    return own
  })
  if (choices.every((c) => c.length === 1)) return []
  const out: Draft[] = []
  const walk = (i: number, text: string, cost: number, abbr: boolean, plain: boolean) => {
    if (text.length > 8) return
    if (i === choices.length) {
      if (abbr) out.push({ text, segs: [text], kind: 'joined', cost, plain })
      return
    }
    for (const ch of choices[i] as (typeof choices)[number])
      walk(i + 1, text + ch.text, cost + ch.cost, abbr || ch.abbr, plain && ch.plain)
  }
  walk(0, '', 0, false, true)
  return out
}

function cmpRung(a: Rung, b: Rung): number {
  return a.cost - b.cost || a.text.length - b.text.length || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)
}

/**
 * Build the ladder of one ranked concept (SPEC 11.1): collect the rungs, run B1, B2, B7 and I8 on each,
 * dedupe by text (lowest cost), sort by cost, length and text, and keep the first 4. B7 (a hard word
 * anywhere, verbatim or not) is applied per rung here, so no candidate can hold such a rung.
 */
export function buildLadder(c: ConceptX, cfg: ResolvedConfig, comp: Compiled): Laddered {
  const rejected: RejectedRung[] = []
  const drafts: Draft[] = WORD_CLASSES.has(c.cls) ? wordDrafts(c, comp) : numberDrafts(c, comp)
  const verbatimOf = (text: string) =>
    c.verbatim.includes(text) || tokenParts(c).some((p) => p.text === text) || (c.tok.parts ?? []).includes(text)
  const ownWords = new Set<string>([...(c.lex?.abbr ?? []), c.lex?.key ?? '', ...(c.lex?.forms ?? [])])
  const byText = new Map<string, Rung>()
  for (const d of drafts) {
    const verbatim = verbatimOf(d.text)
    let rule: RejectedRung['rule'] | undefined
    if (d.segs.some((s) => hardHitIn(fold(s), cfg))) rule = 'B7'
    else if (d.segs.some((s) => segmentBlocked(s, cfg))) rule = 'B1'
    else if (!verbatim && d.kind !== 'number' && d.kind !== 'code' && rungBlocked(d.text, cfg)) rule = 'B2'
    else if (d.segs.some((s) => hasLookalikePair(s))) rule = 'I8'
    else if (
      c.cls === 'name' &&
      !ownWords.has(d.text) &&
      (comp.stop.words.has(d.text) || comp.lexicon.hasExact(d.text) || allAbbrs(comp).has(d.text))
    )
      rule = 'name'
    else if (c.score < LOW_SCORE && d.cost > LOW_SCORE_MAX_COST) rule = 'low-score'
    if (rule !== undefined) {
      rejected.push({ text: d.text, rule })
      continue
    }
    const r: Rung = { ...d, verbatim }
    const old = byText.get(d.text)
    if (old === undefined || r.cost < old.cost || (r.cost === old.cost && r.plain && !old.plain)) byText.set(d.text, r)
  }
  let ladder = [...byText.values()].sort(cmpRung).slice(0, LADDER_SIZE)
  if (cfg.consistentRungs) ladder = ladder.slice(0, 1)
  return { ...c, ladder, rejected }
}

/** Build the ladders of the ranked concepts. */
export function buildLadders(concepts: readonly ConceptX[], cfg: ResolvedConfig, comp: Compiled): Laddered[] {
  return concepts.map((c) => buildLadder(c, cfg, comp))
}
