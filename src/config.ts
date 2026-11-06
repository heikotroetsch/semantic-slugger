/**
 * Config types, DEFAULTS, validation, resolved config and fingerprint (SPEC 16.2, 14.2).
 */

import { normalizeListEntry } from './core/normalize.ts'
import { fold, hardHitIn, segmentBlocked } from './core/safety.ts'
import { keyFor } from './core/tail.ts'
import { BLOCK_HARD, BLOCK_SOFT } from './data/v1/blocklist.ts'
import {
  CUSTOM_ALPHABET_MIN,
  CUSTOM_ALPHABET_MIN_LETTERS,
  FALLBACK_WORD,
  K_V1_TEXT,
  TAIL_ALPHABETS,
  TAIL_FORBIDDEN_CHARS,
} from './data/v1/constants.ts'
import { RESERVED } from './data/v1/reserved.ts'
import { ConfigError } from './errors.ts'
import { utf8 } from './hash/encode.ts'
import { siphash, u64hex } from './hash/siphash.ts'
import type { LanguagePack } from './lang/pack.ts'

/** Built-in codes; more through `languagePacks` (SPEC 6.7, 16.2). */
export type Lang = 'de' | 'en' | (string & {})
export type DetectedLang = Lang | 'und'
export type ListOption =
  | { add?: readonly string[]; remove?: readonly string[] }
  | ((defaults: readonly string[]) => readonly string[])

/** Concept classes (SPEC 5.2, 15.1). */
export type ConceptClass =
  | 'topic'
  | 'name'
  | 'acronym'
  | 'attr'
  | 'qualifier'
  | 'place'
  | 'direction'
  | 'region'
  | 'marker'
  | 'year'
  | 'range'
  | 'quarter'
  | 'month'
  | 'week'
  | 'weekday'
  | 'version'
  | 'model'
  | 'longnum'
  | 'code'
  | 'quantity'

/** Classes a lexicon entry may have (SPEC 15.1). `attr`, `acronym` and the number classes are not allowed. */
export type LexiconClass = 'topic' | 'name' | 'qualifier' | 'place' | 'direction' | 'region' | 'marker'

/** Lexicon entry (SPEC 15.1). */
export interface LexiconEntry {
  key: string
  /** User entries default to '*'. Must be '*' or an enabled language code. */
  lang: Lang | '*'
  phrase?: readonly string[]
  forms?: readonly string[]
  /** Display rungs. For cls 'marker', abbr[0] is the marker prefix (SPEC 5.3). */
  abbr?: readonly string[]
  known?: readonly string[]
  cls: LexiconClass
  weak?: boolean
  /** Match only when the raw token is upper case. */
  upperOnly?: boolean
  /** Match only when the raw token is lower case. */
  lowerOnly?: boolean
  weight?: number
  prior?: 'common' | 'medium' | 'rare'
  part?: boolean
  partOnly?: boolean
  group?: string
  /** Key of the entry with the same meaning in the other built-in language (SPEC 15.6). */
  pair?: string
}

/** User config (SPEC 16.2). Every field is optional. */
export interface SluggerConfig {
  length?: number
  lengthMode?: 'exact' | 'max'
  separator?: '-' | '_' | ''
  maxSegments?: number
  tailMin?: number
  tailAlphabet?: 'safe' | 'strict' | (string & {})
  consistentRungs?: boolean
  languages?: readonly Lang[]
  defaultLang?: Lang
  /** Experimental (SPEC 6.7): extra languages. */
  languagePacks?: readonly LanguagePack[]
  detectLanguage?: (normalized: string) => DetectedLang | undefined
  transliterate?: (input: string) => string
  stopWords?: ListOption
  reserved?: ListOption
  blocklist?: { hard?: ListOption; soft?: ListOption }
  lexicon?: readonly LexiconEntry[]
  denyTokens?: readonly string[]
  leak?: 'normal' | 'minimal' | 'opaque'
  secret?: string
  storeStems?: 'plain' | 'hashed'
  rarity?: 'store' | 'static'
  corpusSize?: number
  fallbackWord?: string
  onEmpty?: 'fallback' | 'throw'
  maxPlans?: number
  maxAttempts?: number
  maxScan?: number
  maxInputLength?: number
  algorithm?: 1
}

/** Validated, normalized and frozen config. Lists are resolved against the v1 defaults. */
export interface ResolvedConfig {
  readonly length: number
  readonly lengthMode: 'exact' | 'max'
  readonly separator: '-' | '_' | ''
  readonly maxSegments: number
  readonly tailMin: number
  /** 'safe', 'strict' or 'custom'. */
  readonly tailAlphabetName: 'safe' | 'strict' | 'custom'
  /** Chars allowed as the first tail char. */
  readonly tailFirst: string
  /** Chars allowed at the other tail positions. */
  readonly tailAlphabet: string
  readonly consistentRungs: boolean
  /** Enabled codes in priority order. */
  readonly languages: readonly Lang[]
  readonly defaultLang: Lang
  /** Validated copies of the user packs, frozen. */
  readonly languagePacks: readonly LanguagePack[]
  readonly detectLanguage?: (normalized: string) => DetectedLang | undefined
  readonly transliterate?: (input: string) => string
  readonly stopWords: readonly string[]
  readonly reserved: readonly string[]
  /** Leet-folded entries. */
  readonly blocklist: { readonly hard: readonly string[]; readonly soft: readonly string[] }
  readonly lexicon: readonly LexiconEntry[]
  readonly denyTokens: readonly string[]
  readonly leak: 'normal' | 'minimal' | 'opaque'
  readonly secret?: string
  readonly storeStems: 'plain' | 'hashed'
  readonly rarity: 'store' | 'static'
  readonly corpusSize: number
  readonly fallbackWord: string
  readonly onEmpty: 'fallback' | 'throw'
  readonly maxPlans: number
  readonly maxAttempts: number
  readonly maxScan: number
  readonly maxInputLength: number
  readonly algorithm: 1
}

type DefaultKeys =
  | 'length'
  | 'lengthMode'
  | 'separator'
  | 'maxSegments'
  | 'tailMin'
  | 'tailAlphabet'
  | 'consistentRungs'
  | 'languages'
  | 'defaultLang'
  | 'leak'
  | 'storeStems'
  | 'rarity'
  | 'corpusSize'
  | 'fallbackWord'
  | 'onEmpty'
  | 'maxPlans'
  | 'maxAttempts'
  | 'maxScan'
  | 'maxInputLength'
  | 'algorithm'

export type DefaultConfig = Readonly<Required<Pick<SluggerConfig, DefaultKeys>>>

/** Frozen default config. List options default to the built-in v1 lists. */
export const DEFAULTS: DefaultConfig = Object.freeze({
  length: 16,
  lengthMode: 'exact',
  separator: '-',
  maxSegments: 4,
  tailMin: 2,
  tailAlphabet: 'safe',
  consistentRungs: false,
  languages: Object.freeze(['de', 'en'] as const),
  defaultLang: 'de',
  leak: 'normal',
  storeStems: 'plain',
  rarity: 'store',
  corpusSize: 1000,
  fallbackWord: FALLBACK_WORD,
  onEmpty: 'fallback',
  maxPlans: 16,
  maxAttempts: 8,
  maxScan: 64,
  maxInputLength: 4096,
  algorithm: 1,
})

/**
 * Built-in defaults for the list options that come with the language data (SPEC 6.3: the
 * function and noise tiers). The lists are filled in M2; until then they are empty.
 */
const LIST_DEFAULTS: { readonly stopWords: readonly string[] } = { stopWords: [] }

/** Built-in language codes (SPEC 6.7). */
const BUILTIN_LANGS: readonly string[] = ['de', 'en']

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'length',
  'lengthMode',
  'separator',
  'maxSegments',
  'tailMin',
  'tailAlphabet',
  'consistentRungs',
  'languages',
  'defaultLang',
  'languagePacks',
  'detectLanguage',
  'transliterate',
  'stopWords',
  'reserved',
  'blocklist',
  'lexicon',
  'denyTokens',
  'leak',
  'secret',
  'storeStems',
  'rarity',
  'corpusSize',
  'fallbackWord',
  'onEmpty',
  'maxPlans',
  'maxAttempts',
  'maxScan',
  'maxInputLength',
  'algorithm',
])

/** The LexiconClass set: the classes allowed for lexicon `cls` (SPEC 15.1). */
export const LEXICON_CLASSES: ReadonlySet<string> = new Set<LexiconClass>([
  'topic',
  'name',
  'qualifier',
  'place',
  'direction',
  'region',
  'marker',
])

/** Marker prefix rule (SPEC 5.3): up to 6 letters, the last one not `l`, `i` or `o`. */
const MARKER_PREFIX = /^[a-z]{0,5}[a-hj-km-np-z]$/

export const SECRET_MIN_LENGTH = 16

function fail(field: string, value: unknown, reason: string, message?: string): never {
  throw new ConfigError(message ?? `invalid config "${field}": ${reason}`, { field, value, reason })
}

/** Any non-array object. Only own enumerable keys are read from it (see `own`). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Own enumerable keys only. Inherited keys are ignored (no prototype pollution). */
function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) && Object.prototype.propertyIsEnumerable.call(obj, key) ? obj[key] : undefined
}

function intIn(field: string, v: unknown, def: number, min: number, max: number): number {
  if (v === undefined) return def
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(field, v, 'not-integer')
  if (v < min || v > max) fail(field, v, 'out-of-range', `invalid config "${field}": must be ${min} to ${max}`)
  return v
}

function oneOf<T extends string>(field: string, v: unknown, def: T, values: readonly T[]): T {
  if (v === undefined) return def
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) fail(field, v, 'invalid-enum')
  return v as T
}

function bool(field: string, v: unknown, def: boolean): boolean {
  if (v === undefined) return def
  if (typeof v !== 'boolean') fail(field, v, 'not-boolean')
  return v
}

function fnOpt<F>(field: string, v: unknown): F | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'function') fail(field, v, 'not-function')
  return v as F
}

function stringArray(field: string, v: unknown): readonly string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(field, v, 'invalid-list')
  return v as readonly string[]
}

function normEntries(field: string, list: readonly string[], leet: boolean): string[] {
  const out = new Set<string>()
  for (const raw of list) {
    const n = normalizeListEntry(raw)
    if (!/^[a-z0-9]+$/.test(n)) fail(field, raw, 'invalid-list-entry')
    out.add(leet ? fold(n) : n)
  }
  return [...out].sort()
}

function resolveList(field: string, opt: unknown, defaults: readonly string[], leet = false): readonly string[] {
  if (opt === undefined) return normEntries(field, defaults, leet)
  if (typeof opt === 'function') {
    const r: unknown = (opt as (d: readonly string[]) => unknown)(Object.freeze([...defaults]))
    return normEntries(field, stringArray(field, r), leet)
  }
  if (!isPlainObject(opt)) fail(field, opt, 'invalid-list')
  for (const k of Object.keys(opt)) if (k !== 'add' && k !== 'remove') fail(`${field}.${k}`, opt[k], 'unknown-key')
  const add = own(opt, 'add')
  const remove = own(opt, 'remove')
  const a = add === undefined ? [] : stringArray(`${field}.add`, add)
  const r = remove === undefined ? [] : stringArray(`${field}.remove`, remove)
  const drop = new Set(normEntries(`${field}.remove`, r, leet))
  const base = normEntries(field, defaults, leet).filter((x) => !drop.has(x))
  return normEntries(field, [...base, ...a], leet)
}

function resolveAlphabet(v: unknown): { name: 'safe' | 'strict' | 'custom'; first: string; rest: string } {
  if (v === undefined || v === 'safe') return { name: 'safe', ...TAIL_ALPHABETS.safe }
  if (v === 'strict') return { name: 'strict', ...TAIL_ALPHABETS.strict }
  if (typeof v !== 'string') fail('tailAlphabet', v, 'not-string')
  if (new Set(v).size !== v.length) fail('tailAlphabet', v, 'alphabet-duplicate-char')
  if (!/^[a-z0-9]+$/.test(v)) fail('tailAlphabet', v, 'alphabet-invalid-char')
  for (const c of TAIL_FORBIDDEN_CHARS) if (v.includes(c)) fail('tailAlphabet', v, 'alphabet-forbidden-char')
  if (v.length < CUSTOM_ALPHABET_MIN) fail('tailAlphabet', v, 'alphabet-too-short')
  const letters = v.replace(/[0-9]/g, '')
  if (letters.length < CUSTOM_ALPHABET_MIN_LETTERS) fail('tailAlphabet', v, 'alphabet-too-few-letters')
  return { name: 'custom', first: letters, rest: v }
}

/**
 * Copy pack data: arrays and plain objects are copied (own enumerable keys only), functions and
 * primitives are kept. The copy is frozen later, so the caller's objects are never frozen.
 */
function copyData(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copyData)
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) if (own(v, k) !== undefined) out[k] = copyData(v[k])
    return out
  }
  return v
}

/**
 * Minimal language pack validation (SPEC 6.7, 23 #5). Full validation of every pack field follows
 * in M2 (src/lang/pack.ts).
 */
function resolvePacks(v: unknown): readonly LanguagePack[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) fail('languagePacks', v, 'invalid-language-pack')
  const seen = new Set<string>()
  return v.map((p: unknown, i: number): LanguagePack => {
    const field = `languagePacks[${i}]`
    if (!isPlainObject(p)) fail(field, p, 'invalid-language-pack')
    const code = own(p, 'code')
    if (typeof code !== 'string' || !/^[a-z]{2,3}$/.test(code) || code === 'und')
      fail(`${field}.code`, code, 'invalid-language-pack')
    if (BUILTIN_LANGS.includes(code)) fail(`${field}.code`, code, 'builtin-pack')
    if (seen.has(code)) fail(`${field}.code`, code, 'invalid-language-pack')
    seen.add(code)
    const id = own(p, 'id')
    if (typeof id !== 'string' || id === '') fail(`${field}.id`, id, 'invalid-language-pack')
    const sw = own(p, 'stopWords')
    if (!Array.isArray(sw) || sw.some((x) => typeof x !== 'string'))
      fail(`${field}.stopWords`, sw, 'invalid-language-pack')
    if (typeof own(p, 'stem') !== 'function') fail(`${field}.stem`, own(p, 'stem'), 'invalid-language-pack')
    return copyData(p) as LanguagePack
  })
}

/** Enabled language codes in the given priority order, without duplicates (SPEC 6.7). */
function resolveLanguages(v: unknown, packs: readonly LanguagePack[]): readonly Lang[] {
  if (v === undefined) return [...BUILTIN_LANGS]
  if (!Array.isArray(v) || v.length === 0) fail('languages', v, 'invalid-languages')
  const known = new Set([...BUILTIN_LANGS, ...packs.map((p) => p.code)])
  const out: Lang[] = []
  for (const l of v) {
    if (typeof l !== 'string') fail('languages', v, 'invalid-languages')
    if (!known.has(l)) fail('languages', l, 'unknown-language')
    if (!out.includes(l)) out.push(l)
  }
  return out
}

function resolveLexicon(v: unknown, languages: readonly Lang[]): readonly LexiconEntry[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) fail('lexicon', v, 'invalid-lexicon')
  return v.map((e: unknown, i: number): LexiconEntry => {
    const field = `lexicon[${i}]`
    if (!isPlainObject(e)) fail(field, e, 'invalid-lexicon')
    const key = own(e, 'key')
    const cls = own(e, 'cls')
    const lang = own(e, 'lang') ?? '*'
    if (typeof key !== 'string' || !/^[a-z0-9]+( [a-z0-9]+)*$/.test(key)) fail(`${field}.key`, key, 'invalid-lexicon')
    if (typeof cls !== 'string' || !LEXICON_CLASSES.has(cls)) fail(`${field}.cls`, cls, 'invalid-lexicon')
    if (typeof lang !== 'string') fail(`${field}.lang`, lang, 'invalid-lexicon')
    if (lang !== '*' && !languages.includes(lang)) fail(`${field}.lang`, lang, 'unknown-language')
    const out: Record<string, unknown> = { key, cls, lang }
    for (const k of ['phrase', 'forms', 'abbr', 'known'] as const) {
      const a = own(e, k)
      if (a !== undefined) out[k] = Object.freeze([...stringArray(`${field}.${k}`, a)])
    }
    for (const k of ['weak', 'upperOnly', 'lowerOnly', 'part', 'partOnly'] as const) {
      const b = own(e, k)
      if (b !== undefined) out[k] = bool(`${field}.${k}`, b, false)
    }
    if (out.upperOnly === true && out.lowerOnly === true)
      fail(`${field}.lowerOnly`, true, 'invalid-lexicon', `invalid config "${field}": upperOnly and lowerOnly both set`)
    if (cls === 'marker') {
      const prefix = (out.abbr as readonly string[] | undefined)?.[0]
      if (prefix === undefined || !MARKER_PREFIX.test(prefix))
        fail(
          `${field}.abbr`,
          prefix,
          'invalid-marker-prefix',
          `invalid config "${field}.abbr": a marker needs abbr[0] matching ${MARKER_PREFIX.source} (SPEC 5.3)`,
        )
    }
    const weight = own(e, 'weight')
    if (weight !== undefined) out.weight = intIn(`${field}.weight`, weight, 0, -100, 100)
    const prior = own(e, 'prior')
    if (prior !== undefined) out.prior = oneOf(`${field}.prior`, prior, 'medium', ['common', 'medium', 'rare'])
    for (const k of ['group', 'pair'] as const) {
      const g = own(e, k)
      if (g === undefined) continue
      if (typeof g !== 'string') fail(`${field}.${k}`, g, 'invalid-lexicon')
      out[k] = g
    }
    for (const k of Object.keys(e))
      if (!Object.hasOwn(out, k) && own(e, k) !== undefined) fail(`${field}.${k}`, e[k], 'unknown-key')
    return Object.freeze(out) as unknown as LexiconEntry
  })
}

/** Throws ConfigError 'runtime-no-normalize' when String.prototype.normalize is missing or broken (SPEC 4.1). */
export function checkRuntime(): void {
  const ok =
    typeof String.prototype.normalize === 'function' &&
    'ä'.normalize('NFD').length === 2 &&
    'ﬁ'.normalize('NFKC') === 'fi'
  if (!ok) fail('runtime', undefined, 'runtime-no-normalize', 'String.prototype.normalize is missing or incomplete')
}

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
  }
  return v
}

/** Validate a user config and resolve it to a frozen ResolvedConfig. Throws ConfigError. */
export function resolveConfig(input?: SluggerConfig): ResolvedConfig {
  checkRuntime()
  if (input === undefined) input = {}
  if (!isPlainObject(input)) fail('config', input, 'not-object')
  const c = input as Record<string, unknown>
  for (const k of Object.keys(c)) if (!KNOWN_KEYS.has(k)) fail(k, c[k], 'unknown-key')
  const g = (k: string): unknown => own(c, k)

  const length = intIn('length', g('length'), DEFAULTS.length, 8, 64)
  const lengthMode = oneOf('lengthMode', g('lengthMode'), DEFAULTS.lengthMode, ['exact', 'max'])
  const separator = oneOf<'-' | '_' | ''>('separator', g('separator'), DEFAULTS.separator, ['-', '_', ''])
  const maxSegments = intIn('maxSegments', g('maxSegments'), DEFAULTS.maxSegments, 1, 5)
  const tailMin = intIn('tailMin', g('tailMin'), DEFAULTS.tailMin, 1, length - 3)
  const alpha = resolveAlphabet(g('tailAlphabet'))
  const consistentRungs = bool('consistentRungs', g('consistentRungs'), DEFAULTS.consistentRungs)
  const languagePacks = resolvePacks(g('languagePacks'))
  const languages = resolveLanguages(g('languages'), languagePacks)
  const defaultLang = g('defaultLang') ?? DEFAULTS.defaultLang
  if (typeof defaultLang !== 'string') fail('defaultLang', defaultLang, 'not-string')
  if (!BUILTIN_LANGS.includes(defaultLang) && !languagePacks.some((p) => p.code === defaultLang))
    fail('defaultLang', defaultLang, 'unknown-language')
  if (!languages.includes(defaultLang)) fail('defaultLang', defaultLang, 'default-lang-not-enabled')
  const detectLanguage = fnOpt<ResolvedConfig['detectLanguage']>('detectLanguage', g('detectLanguage'))
  const transliterate = fnOpt<ResolvedConfig['transliterate']>('transliterate', g('transliterate'))
  const stopWords = resolveList('stopWords', g('stopWords'), LIST_DEFAULTS.stopWords)
  const reserved = resolveList('reserved', g('reserved'), RESERVED)
  const bl = g('blocklist')
  if (bl !== undefined && !isPlainObject(bl)) fail('blocklist', bl, 'invalid-list')
  if (bl)
    for (const k of Object.keys(bl)) if (k !== 'hard' && k !== 'soft') fail(`blocklist.${k}`, bl[k], 'unknown-key')
  const blocklist = {
    hard: resolveList('blocklist.hard', bl ? own(bl, 'hard') : undefined, BLOCK_HARD, true),
    soft: resolveList('blocklist.soft', bl ? own(bl, 'soft') : undefined, BLOCK_SOFT, true),
  }
  const lexicon = resolveLexicon(g('lexicon'), languages)
  const dt = g('denyTokens')
  const denyTokens = dt === undefined ? [] : normEntries('denyTokens', stringArray('denyTokens', dt), false)
  const leak = oneOf('leak', g('leak'), DEFAULTS.leak, ['normal', 'minimal', 'opaque'])
  const secret = g('secret')
  if (secret !== undefined) {
    if (typeof secret !== 'string') fail('secret', '<hidden>', 'not-string')
    if (secret.length < SECRET_MIN_LENGTH) fail('secret', '<hidden>', 'secret-too-short')
  }
  const storeStems = oneOf('storeStems', g('storeStems'), DEFAULTS.storeStems, ['plain', 'hashed'])
  if (leak === 'opaque' && secret === undefined)
    fail('leak', leak, 'opaque-needs-secret', 'leak "opaque" requires a secret (SPEC 13.6)')
  if (storeStems === 'hashed' && secret === undefined)
    fail('storeStems', storeStems, 'hashed-needs-secret', 'storeStems "hashed" requires a secret (SPEC 13.6)')
  const rarity = oneOf('rarity', g('rarity'), DEFAULTS.rarity, ['store', 'static'])
  const corpusSize = intIn('corpusSize', g('corpusSize'), DEFAULTS.corpusSize, 1, 1_000_000_000)
  const fw = g('fallbackWord') ?? DEFAULTS.fallbackWord
  if (typeof fw !== 'string' || !/^[a-z]{2,8}$/.test(fw)) fail('fallbackWord', fw, 'invalid-fallback-word')
  const onEmpty = oneOf('onEmpty', g('onEmpty'), DEFAULTS.onEmpty, ['fallback', 'throw'])
  const maxPlans = intIn('maxPlans', g('maxPlans'), DEFAULTS.maxPlans, 1, 256)
  const maxAttempts = intIn('maxAttempts', g('maxAttempts'), DEFAULTS.maxAttempts, 1, 256)
  const maxScan = intIn('maxScan', g('maxScan'), DEFAULTS.maxScan, 1, 1024)
  const maxInputLength = intIn('maxInputLength', g('maxInputLength'), DEFAULTS.maxInputLength, 1, 1_048_576)
  const algorithm = g('algorithm')
  if (algorithm !== undefined && algorithm !== 1) fail('algorithm', algorithm, 'invalid-algorithm')

  const cfg: ResolvedConfig = {
    length,
    lengthMode,
    separator,
    maxSegments,
    tailMin,
    tailAlphabetName: alpha.name,
    tailFirst: alpha.first,
    tailAlphabet: alpha.rest,
    consistentRungs,
    languages,
    defaultLang,
    languagePacks,
    ...(detectLanguage ? { detectLanguage } : {}),
    ...(transliterate ? { transliterate } : {}),
    stopWords,
    reserved,
    blocklist,
    lexicon,
    denyTokens,
    leak,
    ...(secret !== undefined ? { secret: secret as string } : {}),
    storeStems,
    rarity,
    corpusSize,
    fallbackWord: fw,
    onEmpty,
    maxPlans,
    maxAttempts,
    maxScan,
    maxInputLength,
    algorithm: 1,
  }

  // fallback word checks need the resolved blocklist and reserved words
  if (segmentBlocked(fw, cfg) || hardHitIn(fold(fw), cfg)) fail('fallbackWord', fw, 'fallback-blocked')
  if (reserved.includes(fw)) fail('fallbackWord', fw, 'fallback-reserved')
  if (fw.length + separator.length + tailMin > length)
    fail('fallbackWord', fw, 'fallback-too-long', 'fallbackWord + separator + tailMin must fit in length')

  return deepFreeze(cfg)
}

let defaultResolved: ResolvedConfig | undefined
/** The resolved default config, built on first use. */
export function defaultConfig(): ResolvedConfig {
  if (!defaultResolved) defaultResolved = resolveConfig()
  return defaultResolved
}

/**
 * Canonical JSON: sorted keys, functions as "fn", undefined dropped (SPEC 14.2 item 9).
 * Language packs are part of the resolved config, so their code, id and data are recorded (SPEC 6.7).
 */
export function canonicalJson(v: unknown): string {
  if (typeof v === 'function') return '"fn"'
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

/**
 * 16 hex chars of SipHash over the canonical JSON of the resolved config (SPEC 14.2 item 9).
 * The secret is never hashed in plain form: it is replaced by a keyed check value.
 */
export function fingerprint(cfg: ResolvedConfig): string {
  const view: Record<string, unknown> = { ...cfg }
  if (cfg.secret !== undefined) view.secret = `k:${u64hex(siphash(keyFor(cfg), utf8('fingerprint')))}`
  return u64hex(siphash(utf8(K_V1_TEXT), utf8(canonicalJson(view))))
}
