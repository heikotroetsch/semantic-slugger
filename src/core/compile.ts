/**
 * Per-config compiled language data: packs, stemmers, lexicon, stop word tiers, months, weekdays,
 * units, markers, legal forms and deny tokens. Built on first use and cached per resolved config.
 */

import { BUILTIN_LANGS, enabledPacks, type LexiconEntry, type ResolvedConfig } from '../config.ts'
import { LEGAL_ALWAYS, LEGAL_AMBIGUOUS, LEGAL_MULTI, LEGAL_TITLE_CASE } from '../data/v1/legal.ts'
import { LEXICON_SHARED } from '../data/v1/lexicon-shared.ts'
import { MARKERS_SHARED, type MarkerTakes } from '../data/v1/markers.ts'
import { NOISE_SHARED } from '../data/v1/noise.ts'
import { PARTS_SHARED } from '../data/v1/parts-de.ts'
import { SINGLE_CONSONANTS } from '../data/v1/phonology.ts'
import { QUALIFIERS } from '../data/v1/qualifiers.ts'
import { PERSON_TITLES_DE } from '../data/v1/stop-de.ts'
import { PERSON_TITLES_EN } from '../data/v1/stop-en.ts'
import { TRANSLIT_CYRILLIC, TRANSLIT_GREEK } from '../data/v1/translit.ts'
import { UNITS } from '../data/v1/units.ts'
import { WEAK_SHARED } from '../data/v1/weak.ts'
import type { LanguagePack } from '../lang/pack.ts'
import type { PartIndex } from './compound.ts'
import { buildLexicon, type Lexicon } from './lexicon.ts'
import type { NoiseContext, TranslitContext } from './normalize.ts'
import { makeStemmer, type Stemmer, UND_STEMMER } from './stem.ts'

export interface MarkerSpec {
  readonly prefix: string
  readonly takes: MarkerTakes
  /** The marker word(s) as typed in the data (ascii, joined by spaces). */
  readonly word: string
}

export interface Compiled {
  readonly cfg: ResolvedConfig
  /** Enabled packs in `languages` order. */
  readonly packs: readonly LanguagePack[]
  pack(code: string): LanguagePack | undefined
  stemmer(lang: string): Stemmer
  readonly lexicon: Lexicon
  /** Part indexes of the packs with compound data. */
  readonly parts: ReadonlyMap<string, PartIndex>
  /**
   * Weak heads of a language (SPEC 7.1): the pack list, all weak lexicon words of that language and
   * `*`, and all noise words. `und` gets the weak words of every language.
   */
  weakHeads(lang: string): ReadonlySet<string>
  /** Generic modifiers of a language (SPEC 7.1); empty without compound data. */
  genericModifiers(lang: string): ReadonlySet<string>
  readonly stop: {
    /** The resolved `stopWords` list (function and noise tiers after user changes). */
    readonly words: ReadonlySet<string>
    /** Word -> codes of the packs whose function list has it. */
    readonly functionLangs: ReadonlyMap<string, ReadonlySet<string>>
    /** Word -> codes of the packs whose conflict list has it. */
    readonly conflictLangs: ReadonlyMap<string, ReadonlySet<string>>
    readonly noise: ReadonlySet<string>
    /** Person titles and keys/forms of `upperOnly` entries: kept when the raw token is all upper case. */
    readonly upperExempt: ReadonlySet<string>
  }
  /** Code -> stop words of that pack that no other enabled pack has (SPEC 6.1). */
  readonly onlyStop: ReadonlyMap<string, ReadonlySet<string>>
  /** Code -> number word -> value 1..12. */
  readonly numberWords: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** Number word -> value, over every enabled pack (marker values). */
  readonly anyNumberWord: ReadonlyMap<string, number>
  readonly months: ReadonlyMap<string, number>
  readonly weekdays: ReadonlyMap<string, { readonly d: number; readonly short: boolean }>
  /** Unit word -> display short form. */
  readonly units: ReadonlyMap<string, string>
  readonly versionWords: ReadonlySet<string>
  /** Marker word or phrase (words joined by spaces) -> spec. */
  readonly markers: ReadonlyMap<string, MarkerSpec>
  readonly maxMarkerWords: number
  readonly legal: {
    readonly always: ReadonlySet<string>
    readonly ambiguous: ReadonlySet<string>
    readonly titleCase: ReadonlySet<string>
    readonly multi: readonly (readonly string[])[]
  }
  readonly deny: { readonly single: ReadonlySet<string>; readonly multi: readonly (readonly string[])[] }
  readonly noiseCtx: NoiseContext
  readonly translit: TranslitContext
}

const cache = new WeakMap<ResolvedConfig, Compiled>()

function sharedEntries(): LexiconEntry[] {
  const out: LexiconEntry[] = []
  const prior = (e: LexiconEntry): LexiconEntry => (e.prior === undefined ? { ...e, prior: 'common' } : e)
  for (const e of LEXICON_SHARED) out.push(prior(e))
  for (const e of QUALIFIERS) if (e.lang === '*') out.push(prior(e))
  for (const e of WEAK_SHARED) out.push(prior(e))
  for (const p of PARTS_SHARED)
    out.push({ key: p, lang: '*', cls: 'topic', part: true, partOnly: true, prior: 'common' })
  return out
}

function addTo<K, V>(m: Map<K, Set<V>>, k: K, v: V): void {
  const s = m.get(k)
  if (s === undefined) m.set(k, new Set([v]))
  else s.add(v)
}

export function compile(cfg: ResolvedConfig): Compiled {
  const hit = cache.get(cfg)
  if (hit !== undefined) return hit
  const packs = enabledPacks(cfg.languages, cfg.languagePacks)
  const byCode = new Map(packs.map((p) => [p.code, p]))
  const stemmers = new Map<string, Stemmer>(packs.map((p) => [p.code, makeStemmer(p)]))
  const lexicon = buildLexicon({
    packs,
    builtin: new Set(BUILTIN_LANGS),
    shared: sharedEntries(),
    user: cfg.lexicon,
    stemmers,
  })

  // stop word tiers (SPEC 6.3)
  const words = new Set(cfg.stopWords)
  const functionLangs = new Map<string, Set<string>>()
  const conflictLangs = new Map<string, Set<string>>()
  for (const p of packs) {
    for (const w of p.stopWords) addTo(functionLangs, w, p.code)
    for (const w of p.conflictWords ?? []) addTo(conflictLangs, w, p.code)
  }
  const noise = new Set<string>(NOISE_SHARED)
  for (const p of packs) for (const w of p.noiseWords ?? []) noise.add(w)
  const upperExempt = new Set<string>([...PERSON_TITLES_DE, ...PERSON_TITLES_EN])
  for (const e of lexicon.entries) {
    if (e.upperOnly !== true) continue
    upperExempt.add(e.key)
    for (const f of e.forms ?? []) upperExempt.add(f)
  }
  const onlyStop = new Map<string, Set<string>>()
  for (const p of packs) {
    const s = new Set<string>()
    // conflict words are content words in another language, so they are no evidence (docs/DEVIATIONS.md)
    for (const w of p.stopWords)
      if (words.has(w) && functionLangs.get(w)?.size === 1 && conflictLangs.get(w) === undefined) s.add(w)
    onlyStop.set(p.code, s)
  }

  // number words, months, weekdays, units, version words
  const numberWords = new Map<string, Map<string, number>>()
  const anyNumberWord = new Map<string, number>()
  const months = new Map<string, number>()
  const weekdays = new Map<string, { d: number; short: boolean }>()
  const units = new Map<string, string>()
  const versionWords = new Set<string>()
  for (const p of packs) {
    const nw = new Map<string, number>()
    p.numberWords?.forEach((row, i) => {
      for (const w of row) {
        nw.set(w, i + 1)
        if (!anyNumberWord.has(w)) anyNumberWord.set(w, i + 1)
      }
    })
    numberWords.set(p.code, nw)
    p.months?.forEach((row, i) => {
      for (const w of row) if (!months.has(w)) months.set(w, i + 1)
    })
    p.weekdays?.forEach((row, i) => {
      row.forEach((w, j) => {
        if (!weekdays.has(w)) weekdays.set(w, { d: i + 1, short: j > 0 && w.length < 6 })
      })
    })
    for (const row of p.units ?? []) for (const w of row) if (!units.has(w)) units.set(w, row[0] as string)
    for (const w of p.versionWords ?? []) versionWords.add(w)
  }
  for (const row of UNITS) for (const w of row) if (!units.has(w)) units.set(w, row[0] as string)

  // markers: user and pack lexicon entries first, then pack markers, then shared markers (SPEC 5.3)
  const markers = new Map<string, MarkerSpec>()
  let maxMarkerWords = 1
  const addMarker = (w: string, spec: MarkerSpec) => {
    if (markers.has(w)) return
    markers.set(w, spec)
    maxMarkerWords = Math.max(maxMarkerWords, w.split(' ').length)
  }
  for (const e of lexicon.entries) {
    if (e.cls !== 'marker') continue
    const prefix = (e.abbr ?? [])[0] as string
    for (const w of [e.key, ...(e.forms ?? []), ...(e.phrase ?? [])])
      addMarker(w, { prefix, takes: 'number-or-letter', word: w })
  }
  for (const p of packs) for (const m of p.markers ?? []) for (const w of m.words) addMarker(w, { ...m, word: w })
  for (const m of MARKERS_SHARED) for (const w of m.words) addMarker(w, { prefix: m.prefix, takes: m.takes, word: w })

  // compound part indexes (SPEC 7.1)
  const parts = new Map<string, PartIndex>()
  for (const p of packs) {
    if (p.compound === undefined) continue
    const set = new Set<string>()
    const add = (w: string) => {
      set.add(w)
      if (w.length >= 5 && w.endsWith('e')) set.add(w.slice(0, -1)) // combining form (`schul`)
    }
    for (const e of lexicon.entries) {
      if (e.part === false || (e.lang !== p.code && e.lang !== '*') || e.cls === 'marker') continue
      for (const w of [e.key, ...(e.forms ?? [])]) if (!w.includes(' ')) add(w)
    }
    for (const w of p.compound.parts) add(w)
    for (const w of p.compound.weakHeads ?? []) add(w)
    for (const w of p.compound.genericModifiers ?? []) add(w)
    for (const w of noise) add(w)
    parts.set(p.code, {
      parts: set,
      linkers: p.compound.linkers,
      genericModifiers: new Set(p.compound.genericModifiers ?? []),
      linkSuffixes: p.hints?.suffixes ?? [],
      hasExact: (w) => lexicon.hasExact(w),
      onsets: new Set([...SINGLE_CONSONANTS, ...(p.phonology?.onsets ?? [])]),
      mods: new Set(
        lexicon.entries
          .filter(
            (e) =>
              (e.lang === p.code || e.lang === '*') &&
              (e.cls === 'direction' || e.cls === 'region' || e.cls === 'qualifier'),
          )
          .flatMap((e) => [e.key, ...(e.forms ?? [])])
          .filter((w) => !w.includes(' ')),
      ),
    })
  }

  // weak heads per language (SPEC 7.1), built on first use
  const weakHeadSets = new Map<string, ReadonlySet<string>>()
  const weakHeads = (lang: string): ReadonlySet<string> => {
    let set = weakHeadSets.get(lang)
    if (set === undefined) {
      const s = new Set<string>(noise)
      for (const w of byCode.get(lang)?.compound?.weakHeads ?? []) s.add(w)
      for (const e of lexicon.entries) {
        if (e.weak !== true) continue
        if (lang !== 'und' && e.lang !== lang && e.lang !== '*') continue
        for (const w of [e.key, ...(e.forms ?? [])]) if (!w.includes(' ')) s.add(w)
      }
      set = s
      weakHeadSets.set(lang, set)
    }
    return set
  }
  const noModifiers: ReadonlySet<string> = new Set()
  const genericModifiers = (lang: string): ReadonlySet<string> => parts.get(lang)?.genericModifiers ?? noModifiers

  const deny = { single: new Set<string>(), multi: [] as string[][] }
  for (const d of cfg.denyTokens) {
    if (d.includes(' ')) deny.multi.push(d.split(' '))
    else deny.single.add(d)
  }

  const tables: Readonly<Record<string, string>>[] = []
  for (const p of packs) if (p.translit) tables.push(p.translit)
  tables.push(TRANSLIT_CYRILLIC, TRANSLIT_GREEK)

  const c: Compiled = {
    cfg,
    packs,
    pack: (code) => byCode.get(code),
    stemmer: (lang) => stemmers.get(lang) ?? UND_STEMMER,
    lexicon,
    parts,
    weakHeads,
    genericModifiers,
    stop: { words, functionLangs, conflictLangs, noise, upperExempt },
    onlyStop,
    numberWords,
    anyNumberWord,
    months,
    weekdays,
    units,
    versionWords,
    markers,
    maxMarkerWords,
    legal: {
      always: new Set(LEGAL_ALWAYS),
      ambiguous: new Set(LEGAL_AMBIGUOUS),
      titleCase: new Set(LEGAL_TITLE_CASE),
      multi: LEGAL_MULTI,
    },
    deny,
    noiseCtx: { versionWords },
    translit: cfg.transliterate ? { hook: cfg.transliterate, tables } : { tables },
  }
  cache.set(cfg, c)
  return c
}
