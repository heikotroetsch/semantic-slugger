/**
 * Language pack interface, validation and lookup (SPEC 6.7). Experimental: it may change before 1.0.
 * The built-in `de` and `en` packs (`de.ts`, `en.ts`) use the same interface as user packs.
 */

import type { LexiconEntry } from '../config.ts'
import { RE_LINKER, RE_MARKER_PREFIX, RE_PACK_CODE, RE_TRANSLIT_VALUE } from '../core/regexes.ts'
import { fail, isPlainObject, normOrdered, own, stringArray, validateLexiconEntry } from '../core/validate.ts'
import type { MarkerTakes } from '../data/v1/markers.ts'

/** A marker of a pack (SPEC 5.3). `takes` beyond the two basic values is used by the built-in packs. */
export interface PackMarker {
  words: readonly string[]
  prefix: string
  takes: MarkerTakes
}

/** @experimental A language pack adds a language without a code change (SPEC 6.7). */
export interface LanguagePack {
  /** Two or three letters `a-z`, not 'und', not a built-in code. */
  code: string
  /** Version tag, recorded in the fingerprint, for example 'fr@1'. Change it when `stem` or `keyFold` change. */
  id: string
  /** Function words, normalized like titles. */
  stopWords: readonly string[]
  /** Subset of stopWords removed only in titles of this language. */
  conflictWords?: readonly string[]
  /** Extra noise words (added to the shared noise tier). */
  noiseWords?: readonly string[]
  /** Entries without `lang` get lang = code. */
  lexicon?: readonly LexiconEntry[]
  /** Pure and deterministic; the result is stored (SPEC 8.2). */
  stem: (ascii: string) => string
  /** Fold before stemming (SPEC 4.4); default identity. */
  keyFold?: (ascii: string) => string
  /**
   * Inflection endings for the lexicon stem match (SPEC 4.4 step 2, see DEVIATIONS). When set, a stem
   * match also needs the token and the indexed word to differ only by these endings after their common
   * prefix (`besprechung|en`, `polic|y|ies`), so `marketing` does not take `market`. Omit: any stem match.
   */
  inflections?: readonly string[]
  /** Extra single-char table, applied before the built-in ones. */
  translit?: Readonly<Record<string, string>>
  /** Language detection hints (SPEC 6.1). */
  hints?: {
    chars?: string
    suffixes?: readonly string[]
    weakSuffixes?: readonly string[]
    digraphs?: readonly string[]
  }
  /** true: name signal 4 is off, no model position after plain words (SPEC 5.1, 6.6). */
  nounsCapitalized?: boolean
  /** Compound data (SPEC 7); omit for languages without closed compounds. */
  compound?: {
    parts: readonly string[]
    linkers: readonly string[]
    weakHeads?: readonly string[]
    genericModifiers?: readonly string[]
  }
  /** SPEC 11.3; default: the en tables. */
  phonology?: { codas: readonly string[]; onsets: readonly string[] }
  /** 12 rows; row[0] is the 3-letter display form. */
  months?: readonly (readonly string[])[]
  /** 7 rows, Monday first; row[0] is the display form (SPEC 5.4). */
  weekdays?: readonly (readonly string[])[]
  /** Default 'wk'; must end in a safe letter. */
  weekPrefix?: string
  markers?: readonly PackMarker[]
  /** Extra unit rows (SPEC 5.2); row[0] is the display short form. */
  units?: readonly (readonly string[])[]
  /** Words before a version number (SPEC 5.4). */
  versionWords?: readonly string[]
  /** Rows for 1..12; all forms of one number in a row (SPEC 5.1 step 4b). */
  numberWords?: readonly (readonly string[])[]
  /** SPEC 6.4; omit for no attr rules. */
  attr?: {
    suffixes?: readonly string[]
    lowerSuffixes?: readonly string[]
    lowerCaseRule?: boolean
    /** Words that end in a suffix but are never attr (`family`, `supply`); see DEVIATIONS. */
    except?: readonly string[]
  }
}

const PACK_KEYS: ReadonlySet<string> = new Set([
  'code',
  'id',
  'stopWords',
  'conflictWords',
  'noiseWords',
  'lexicon',
  'stem',
  'keyFold',
  'inflections',
  'translit',
  'hints',
  'nounsCapitalized',
  'compound',
  'phonology',
  'months',
  'weekdays',
  'weekPrefix',
  'markers',
  'units',
  'versionWords',
  'numberWords',
  'attr',
])

const TAKES: readonly MarkerTakes[] = ['number', 'number-or-letter', 'number-letter-or-size', 'number-or-class']

const BAD = 'invalid-language-pack'

function obj(field: string, v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(v)) fail(field, v, BAD)
  for (const k of Object.keys(v)) if (!keys.includes(k) && own(v, k) !== undefined) fail(`${field}.${k}`, v[k], BAD)
  return v
}

function list(field: string, v: unknown, phrases = false): readonly string[] | undefined {
  return v === undefined ? undefined : normOrdered(field, v, BAD, phrases)
}

function rows(field: string, v: unknown, count?: number, max?: number): readonly (readonly string[])[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) fail(field, v, BAD)
  if (count !== undefined && v.length !== count) fail(field, v, BAD)
  if (max !== undefined && v.length > max) fail(field, v, BAD)
  return Object.freeze(
    v.map((r: unknown, i: number) => {
      const out = normOrdered(`${field}[${i}]`, r, BAD)
      if (out.length === 0) fail(`${field}[${i}]`, r, BAD)
      return out
    }),
  )
}

function fn(field: string, v: unknown, required: boolean): unknown {
  if (v === undefined && !required) return undefined
  if (typeof v !== 'function') fail(field, v, BAD)
  return v
}

/**
 * Validate one pack and return a frozen, normalized copy (SPEC 6.7). `builtin` lists the codes a
 * user pack may not reuse. Functions are kept; every list is normalized like a title.
 */
export function validatePack(p: unknown, field: string, builtin: readonly string[]): LanguagePack {
  const v = obj(field, p, [...PACK_KEYS])
  const code = own(v, 'code')
  if (typeof code !== 'string' || !RE_PACK_CODE.test(code) || code === 'und') fail(`${field}.code`, code, BAD)
  if (builtin.includes(code)) fail(`${field}.code`, code, 'builtin-pack')
  const id = own(v, 'id')
  if (typeof id !== 'string' || id === '') fail(`${field}.id`, id, BAD)
  const stopWords = normOrdered(`${field}.stopWords`, own(v, 'stopWords'), BAD)
  const out: Record<string, unknown> = { code, id, stopWords }
  const conflict = list(`${field}.conflictWords`, own(v, 'conflictWords'))
  if (conflict) {
    for (const w of conflict) if (!stopWords.includes(w)) fail(`${field}.conflictWords`, w, BAD)
    out.conflictWords = conflict
  }
  const noise = list(`${field}.noiseWords`, own(v, 'noiseWords'))
  if (noise) out.noiseWords = noise
  const lex = own(v, 'lexicon')
  if (lex !== undefined) {
    if (!Array.isArray(lex)) fail(`${field}.lexicon`, lex, BAD)
    out.lexicon = Object.freeze(
      lex.map((e: unknown, i: number) => validateLexiconEntry(e, `${field}.lexicon[${i}]`, [code], code)),
    )
  }
  out.stem = fn(`${field}.stem`, own(v, 'stem'), true)
  const keyFold = fn(`${field}.keyFold`, own(v, 'keyFold'), false)
  if (keyFold) out.keyFold = keyFold
  const infl = list(`${field}.inflections`, own(v, 'inflections'))
  if (infl) out.inflections = infl
  const tl = own(v, 'translit')
  if (tl !== undefined) {
    const t = obj(`${field}.translit`, tl, Object.keys(isPlainObject(tl) ? tl : {}))
    const copy: Record<string, string> = {}
    for (const k of Object.keys(t)) {
      const val = own(t, k)
      if ([...k].length !== 1 || typeof val !== 'string' || !RE_TRANSLIT_VALUE.test(val))
        fail(`${field}.translit.${k}`, val, BAD)
      copy[k] = val
    }
    out.translit = Object.freeze(copy)
  }
  const hints = own(v, 'hints')
  if (hints !== undefined) {
    const h = obj(`${field}.hints`, hints, ['chars', 'suffixes', 'weakSuffixes', 'digraphs'])
    const hc: Record<string, unknown> = {}
    const chars = own(h, 'chars')
    if (chars !== undefined) {
      if (typeof chars !== 'string') fail(`${field}.hints.chars`, chars, BAD)
      hc.chars = chars.normalize('NFKC').toLowerCase()
    }
    for (const k of ['suffixes', 'weakSuffixes', 'digraphs'] as const) {
      const l = list(`${field}.hints.${k}`, own(h, k))
      if (l) hc[k] = l
    }
    out.hints = Object.freeze(hc)
  }
  const nc = own(v, 'nounsCapitalized')
  if (nc !== undefined) {
    if (typeof nc !== 'boolean') fail(`${field}.nounsCapitalized`, nc, BAD)
    out.nounsCapitalized = nc
  }
  const comp = own(v, 'compound')
  if (comp !== undefined) {
    const c = obj(`${field}.compound`, comp, ['parts', 'linkers', 'weakHeads', 'genericModifiers'])
    const linkers = stringArray(`${field}.compound.linkers`, own(c, 'linkers'), BAD)
    for (const l of linkers) if (!RE_LINKER.test(l)) fail(`${field}.compound.linkers`, l, BAD)
    const cc: Record<string, unknown> = {
      parts: normOrdered(`${field}.compound.parts`, own(c, 'parts'), BAD),
      linkers: Object.freeze([...new Set(linkers)]),
    }
    for (const k of ['weakHeads', 'genericModifiers'] as const) {
      const l = list(`${field}.compound.${k}`, own(c, k))
      if (l) cc[k] = l
    }
    out.compound = Object.freeze(cc)
  }
  const ph = own(v, 'phonology')
  if (ph !== undefined) {
    const c = obj(`${field}.phonology`, ph, ['codas', 'onsets'])
    out.phonology = Object.freeze({
      codas: normOrdered(`${field}.phonology.codas`, own(c, 'codas'), BAD),
      onsets: normOrdered(`${field}.phonology.onsets`, own(c, 'onsets'), BAD),
    })
  }
  const months = rows(`${field}.months`, own(v, 'months'), 12)
  if (months) out.months = months
  const weekdays = rows(`${field}.weekdays`, own(v, 'weekdays'), 7)
  if (weekdays) out.weekdays = weekdays
  const wp = own(v, 'weekPrefix')
  if (wp !== undefined) {
    if (typeof wp !== 'string' || !RE_MARKER_PREFIX.test(wp)) fail(`${field}.weekPrefix`, wp, BAD)
    out.weekPrefix = wp
  }
  const markers = own(v, 'markers')
  if (markers !== undefined) {
    if (!Array.isArray(markers)) fail(`${field}.markers`, markers, BAD)
    out.markers = Object.freeze(
      markers.map((m: unknown, i: number) => {
        const f = `${field}.markers[${i}]`
        const mm = obj(f, m, ['words', 'prefix', 'takes'])
        const words = normOrdered(`${f}.words`, own(mm, 'words'), BAD, true)
        if (words.length === 0) fail(`${f}.words`, words, BAD)
        const prefix = own(mm, 'prefix')
        if (typeof prefix !== 'string' || !RE_MARKER_PREFIX.test(prefix))
          fail(`${f}.prefix`, prefix, 'invalid-marker-prefix')
        const takes = own(mm, 'takes')
        if (typeof takes !== 'string' || !(TAKES as readonly string[]).includes(takes)) fail(`${f}.takes`, takes, BAD)
        return Object.freeze({ words, prefix, takes })
      }),
    )
  }
  const units = rows(`${field}.units`, own(v, 'units'))
  if (units) out.units = units
  const vw = list(`${field}.versionWords`, own(v, 'versionWords'))
  if (vw) out.versionWords = vw
  const nw = rows(`${field}.numberWords`, own(v, 'numberWords'), undefined, 12)
  if (nw) out.numberWords = nw
  const attr = own(v, 'attr')
  if (attr !== undefined) {
    const a = obj(`${field}.attr`, attr, ['suffixes', 'lowerSuffixes', 'lowerCaseRule', 'except'])
    const ac: Record<string, unknown> = {}
    for (const k of ['suffixes', 'lowerSuffixes', 'except'] as const) {
      const l = list(`${field}.attr.${k}`, own(a, k))
      if (l) ac[k] = l
    }
    const lcr = own(a, 'lowerCaseRule')
    if (lcr !== undefined) {
      if (typeof lcr !== 'boolean') fail(`${field}.attr.lowerCaseRule`, lcr, BAD)
      ac.lowerCaseRule = lcr
    }
    out.attr = Object.freeze(ac)
  }
  return Object.freeze(out) as unknown as LanguagePack
}

/** Validate the `languagePacks` option (SPEC 6.7). */
export function validatePacks(v: unknown, builtin: readonly string[]): readonly LanguagePack[] {
  if (v === undefined) return Object.freeze([])
  if (!Array.isArray(v)) fail('languagePacks', v, BAD)
  const seen = new Set<string>()
  return Object.freeze(
    v.map((p: unknown, i: number) => {
      const pack = validatePack(p, `languagePacks[${i}]`, builtin)
      if (seen.has(pack.code)) fail(`languagePacks[${i}].code`, pack.code, BAD)
      seen.add(pack.code)
      return pack
    }),
  )
}
