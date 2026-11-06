/**
 * The merged lexicon of one config (SPEC 4.4, 15.1): built-in entries of the enabled packs, shared
 * entries, then user pack entries and user entries merged by key (same key replaces in place, new keys
 * are appended). Lookup order: step 0 (upper-case known abbreviation), exact match, stem match.
 */

import type { LexiconEntry } from '../config.ts'
import type { LanguagePack } from '../lang/pack.ts'
import { asciiFold } from './normalize.ts'
import { RE_NON_ALNUM } from './regexes.ts'
import type { Stemmer } from './stem.ts'

/** Case flag of a token (SPEC 4.1). */
export type CaseFlag = 'upper' | 'title' | 'lower' | 'mixed' | 'unknown'

/** What lookup needs from a token. */
export interface LookupTok {
  readonly ascii: string
  readonly case: CaseFlag
  /** Set when the raw token is 2 to 6 upper-case letters, optionally with a lower-case plural `s` (step 0). */
  readonly capsAbbr?: string | undefined
}

function clean(w: string): string {
  return asciiFold(w.toLowerCase()).replace(RE_NON_ALNUM, '')
}

function words(entry: LexiconEntry): { single: string[]; phrases: string[][] } {
  const single: string[] = []
  const phrases: string[][] = []
  const add = (s: string) => {
    const parts = s
      .split(' ')
      .map(clean)
      .filter((p) => p !== '')
    if (parts.length === 1) single.push(parts[0] as string)
    else if (parts.length > 1) phrases.push(parts)
  }
  add(entry.key)
  for (const f of entry.forms ?? []) add(f)
  for (const p of entry.phrase ?? []) add(p)
  return { single, phrases }
}

/** Case condition of an entry (SPEC 4.4 step 1, 15.1). */
export function caseOk(e: LexiconEntry, c: CaseFlag): boolean {
  if (e.upperOnly === true) return c === 'upper'
  if (e.lowerOnly === true) return c === 'lower'
  return true
}

export interface Lexicon {
  /** Merged entries in data order. */
  readonly entries: readonly LexiconEntry[]
  /** Longest phrase in tokens. */
  readonly maxPhrase: number
  hasExact(ascii: string): boolean
  /** Entries whose key or form equals `ascii`, in data order (no case check). */
  exactAll(ascii: string): readonly LexiconEntry[]
  phrase(tokens: readonly string[]): LexiconEntry | undefined
  /** Entries that list `abbr` as a known abbreviation. */
  knownAbbr(abbr: string): readonly LexiconEntry[]
  /**
   * Full lookup (SPEC 4.4). `pref` is the per-token or title language for step 0; `stemLangs` are the
   * languages whose stem index is searched, in order.
   */
  lookup(t: LookupTok, pref: string | undefined, stemLangs: readonly string[]): LexiconEntry | undefined
  /** Stem index hit of one language (no direction entries), or undefined. */
  stemHit(ascii: string, lang: string): LexiconEntry | undefined
  /** All stem clashes: stems shared by two or more entries of one language (unit test, SPEC 4.4). */
  stemClashes(): string[]
}

export interface LexiconSource {
  /** Enabled packs in `languages` order. */
  readonly packs: readonly LanguagePack[]
  /** Built-in codes: their pack entries get `prior: 'common'` when missing. */
  readonly builtin: ReadonlySet<string>
  /** Built-in shared (`*`) entries, already with priors. */
  readonly shared: readonly LexiconEntry[]
  /** User entries (validated). */
  readonly user: readonly LexiconEntry[]
  /** Stemmers by code. */
  readonly stemmers: ReadonlyMap<string, Stemmer>
}

function withPrior(e: LexiconEntry): LexiconEntry {
  return e.prior === undefined ? Object.freeze({ ...e, prior: 'common' as const }) : e
}

/** Merge the lexicon sources in data order (SPEC 15.1). */
export function mergeEntries(src: LexiconSource): LexiconEntry[] {
  const list: LexiconEntry[] = []
  const index = new Map<string, number>()
  const put = (e: LexiconEntry, replace: boolean) => {
    const at = index.get(e.key)
    if (at === undefined) {
      index.set(e.key, list.length)
      list.push(e)
    } else if (replace) list[at] = e
  }
  for (const p of src.packs) {
    const builtin = src.builtin.has(p.code)
    const own = (p.lexicon ?? []).map((e) => (builtin ? withPrior(e) : e))
    for (const e of own) put(e, !builtin)
    for (const part of p.compound?.parts ?? []) {
      put(
        Object.freeze({ key: part, lang: p.code, cls: 'topic', part: true, partOnly: true, prior: 'common' } as const),
        false,
      )
    }
  }
  for (const e of src.shared) put(e, false)
  for (const e of src.user) put(e, true)
  return list
}

export function buildLexicon(src: LexiconSource): Lexicon {
  const entries = mergeEntries(src)
  const exact = new Map<string, LexiconEntry[]>()
  const phrases = new Map<string, LexiconEntry>()
  const known = new Map<string, LexiconEntry[]>()
  let maxPhrase = 1
  for (const e of entries) {
    if (e.cls === 'marker') continue // marker words are handled by the tokenizer (SPEC 5.3)
    const w = words(e)
    for (const s of w.single) {
      const l = exact.get(s)
      if (l === undefined) exact.set(s, [e])
      else if (!l.includes(e)) l.push(e)
    }
    for (const ph of w.phrases) {
      const k = ph.join(' ')
      if (!phrases.has(k)) phrases.set(k, e)
      if (ph.length > maxPhrase) maxPhrase = ph.length
    }
    for (const a of e.known ?? []) {
      const l = known.get(a)
      if (l === undefined) known.set(a, [e])
      else l.push(e)
    }
  }
  const stemIndex = new Map<string, Map<string, LexiconEntry>>()
  const stemList = new Map<string, Map<string, LexiconEntry[]>>()
  const indexFor = (lang: string): Map<string, LexiconEntry> => {
    let m = stemIndex.get(lang)
    if (m === undefined) {
      m = new Map()
      const all = new Map<string, LexiconEntry[]>()
      const st = src.stemmers.get(lang)
      if (st !== undefined) {
        for (const e of entries) {
          if (e.cls === 'marker' || e.cls === 'direction') continue
          if (e.lang !== lang && e.lang !== '*') continue
          for (const s of words(e).single) {
            const k = st.stem(s)
            if (!m.has(k)) m.set(k, e)
            const l = all.get(k)
            if (l === undefined) all.set(k, [e])
            else if (!l.includes(e)) l.push(e)
          }
        }
      }
      stemIndex.set(lang, m)
      stemList.set(lang, all)
    }
    return m
  }
  const stemHit = (ascii: string, lang: string): LexiconEntry | undefined => {
    const st = src.stemmers.get(lang)
    if (st === undefined) return undefined
    return indexFor(lang).get(st.stem(ascii))
  }
  return {
    entries,
    maxPhrase,
    hasExact: (a) => exact.has(a),
    exactAll: (a) => exact.get(a) ?? [],
    phrase: (toks) => phrases.get(toks.join(' ')),
    knownAbbr: (a) => known.get(a) ?? [],
    stemHit,
    lookup(t, pref, stemLangs) {
      if (t.capsAbbr !== undefined) {
        const hits = known.get(t.capsAbbr)
        if (hits !== undefined && hits.length > 0) return hits.find((e) => e.lang === pref) ?? hits[0]
      }
      for (const e of exact.get(t.ascii) ?? []) if (caseOk(e, t.case)) return e
      if (t.ascii.length >= 5) {
        for (const lang of stemLangs) {
          const e = stemHit(t.ascii, lang)
          if (e !== undefined && caseOk(e, t.case)) return e
        }
      }
      return undefined
    },
    stemClashes() {
      const out: string[] = []
      for (const p of src.packs) {
        indexFor(p.code)
        for (const [k, l] of stemList.get(p.code) ?? []) {
          const keys = [...new Set(l.map((e) => e.key))]
          if (keys.length > 1) out.push(`${p.code}:${k}=${keys.join('|')}`)
        }
      }
      return out.sort()
    },
  }
}
