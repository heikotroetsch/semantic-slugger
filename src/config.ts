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

export type Lang = 'de' | 'en'
export type DetectedLang = Lang | 'und'
export type ListOption =
  | { add?: readonly string[]; remove?: readonly string[] }
  | ((defaults: readonly string[]) => readonly string[])

export type ConceptClass =
  | 'topic'
  | 'attr'
  | 'org'
  | 'action'
  | 'activity'
  | 'doctype'
  | 'place'
  | 'direction'
  | 'region'
  | 'marker'
  | 'year'
  | 'range'
  | 'quarter'
  | 'week'
  | 'longnum'
  | 'code'
  | 'quantity'

/** Lexicon entry (SPEC 15.1). */
export interface LexiconEntry {
  key: string
  lang: 'de' | 'en' | '*'
  phrase?: readonly string[]
  forms?: readonly string[]
  abbr?: readonly string[]
  known?: readonly string[]
  cls: ConceptClass
  weak?: boolean
  weight?: number
  prior?: 'common' | 'medium' | 'rare'
  part?: boolean
  partOnly?: boolean
  group?: string
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
  detectLanguage?: (normalized: string) => DetectedLang | undefined
  transliterate?: (input: string) => string
  stopWords?: ListOption
  domainStopWords?: ListOption
  weakWords?: ListOption
  reserved?: ListOption
  blocklist?: { hard?: ListOption; soft?: ListOption }
  lexicon?: readonly LexiconEntry[]
  denyTokens?: readonly string[]
  dropPersonNames?: boolean
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
  readonly languages: readonly Lang[]
  readonly defaultLang: Lang
  readonly detectLanguage?: (normalized: string) => DetectedLang | undefined
  readonly transliterate?: (input: string) => string
  readonly stopWords: readonly string[]
  readonly domainStopWords: readonly string[]
  readonly weakWords: readonly string[]
  readonly reserved: readonly string[]
  /** Leet-folded entries. */
  readonly blocklist: { readonly hard: readonly string[]; readonly soft: readonly string[] }
  readonly lexicon: readonly LexiconEntry[]
  readonly denyTokens: readonly string[]
  readonly dropPersonNames: boolean
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
  | 'dropPersonNames'
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
  dropPersonNames: true,
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
 * Built-in defaults for the list options that come with the language data (SPEC 6.3).
 * The stop word, domain and weak lists are filled in M2; until then they are empty.
 */
const LIST_DEFAULTS: {
  readonly stopWords: readonly string[]
  readonly domainStopWords: readonly string[]
  readonly weakWords: readonly string[]
} = { stopWords: [], domainStopWords: [], weakWords: [] }

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
  'detectLanguage',
  'transliterate',
  'stopWords',
  'domainStopWords',
  'weakWords',
  'reserved',
  'blocklist',
  'lexicon',
  'denyTokens',
  'dropPersonNames',
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

const CONCEPT_CLASSES: ReadonlySet<string> = new Set([
  'topic',
  'org',
  'action',
  'activity',
  'doctype',
  'place',
  'direction',
  'region',
  'marker',
  'year',
  'range',
  'quarter',
  'week',
  'longnum',
  'code',
  'quantity',
])

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

function resolveLanguages(v: unknown): readonly Lang[] {
  if (v === undefined) return ['de', 'en']
  if (!Array.isArray(v) || v.length === 0) fail('languages', v, 'invalid-languages')
  const set = new Set<Lang>()
  for (const l of v) {
    if (l !== 'de' && l !== 'en') fail('languages', v, 'invalid-languages')
    set.add(l)
  }
  return (['de', 'en'] as const).filter((l) => set.has(l))
}

function resolveLexicon(v: unknown): readonly LexiconEntry[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) fail('lexicon', v, 'invalid-lexicon')
  return v.map((e: unknown, i: number): LexiconEntry => {
    const field = `lexicon[${i}]`
    if (!isPlainObject(e)) fail(field, e, 'invalid-lexicon')
    const key = own(e, 'key')
    const cls = own(e, 'cls')
    const lang = own(e, 'lang') ?? '*'
    if (typeof key !== 'string' || !/^[a-z0-9]+( [a-z0-9]+)*$/.test(key)) fail(`${field}.key`, key, 'invalid-lexicon')
    if (typeof cls !== 'string' || !CONCEPT_CLASSES.has(cls)) fail(`${field}.cls`, cls, 'invalid-lexicon')
    if (lang !== 'de' && lang !== 'en' && lang !== '*') fail(`${field}.lang`, lang, 'invalid-lexicon')
    const out: Record<string, unknown> = { key, cls, lang }
    for (const k of ['phrase', 'forms', 'abbr', 'known'] as const) {
      const a = own(e, k)
      if (a !== undefined) out[k] = Object.freeze([...stringArray(`${field}.${k}`, a)])
    }
    for (const k of ['weak', 'part', 'partOnly'] as const) {
      const b = own(e, k)
      if (b !== undefined) out[k] = bool(`${field}.${k}`, b, false)
    }
    const weight = own(e, 'weight')
    if (weight !== undefined) out.weight = intIn(`${field}.weight`, weight, 0, -100, 100)
    const prior = own(e, 'prior')
    if (prior !== undefined) out.prior = oneOf(`${field}.prior`, prior, 'medium', ['common', 'medium', 'rare'])
    const group = own(e, 'group')
    if (group !== undefined) {
      if (typeof group !== 'string') fail(`${field}.group`, group, 'invalid-lexicon')
      out.group = group
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
  const languages = resolveLanguages(g('languages'))
  const defaultLang = oneOf<Lang>('defaultLang', g('defaultLang'), DEFAULTS.defaultLang, ['de', 'en'])
  if (!languages.includes(defaultLang)) fail('defaultLang', defaultLang, 'default-lang-not-enabled')
  const detectLanguage = fnOpt<ResolvedConfig['detectLanguage']>('detectLanguage', g('detectLanguage'))
  const transliterate = fnOpt<ResolvedConfig['transliterate']>('transliterate', g('transliterate'))
  const stopWords = resolveList('stopWords', g('stopWords'), LIST_DEFAULTS.stopWords)
  const domainStopWords = resolveList('domainStopWords', g('domainStopWords'), LIST_DEFAULTS.domainStopWords)
  const weakWords = resolveList('weakWords', g('weakWords'), LIST_DEFAULTS.weakWords)
  const reserved = resolveList('reserved', g('reserved'), RESERVED)
  const bl = g('blocklist')
  if (bl !== undefined && !isPlainObject(bl)) fail('blocklist', bl, 'invalid-list')
  if (bl)
    for (const k of Object.keys(bl)) if (k !== 'hard' && k !== 'soft') fail(`blocklist.${k}`, bl[k], 'unknown-key')
  const blocklist = {
    hard: resolveList('blocklist.hard', bl ? own(bl, 'hard') : undefined, BLOCK_HARD, true),
    soft: resolveList('blocklist.soft', bl ? own(bl, 'soft') : undefined, BLOCK_SOFT, true),
  }
  const lexicon = resolveLexicon(g('lexicon'))
  const dt = g('denyTokens')
  const denyTokens = dt === undefined ? [] : normEntries('denyTokens', stringArray('denyTokens', dt), false)
  const dropPersonNames = bool('dropPersonNames', g('dropPersonNames'), DEFAULTS.dropPersonNames)
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
    ...(detectLanguage ? { detectLanguage } : {}),
    ...(transliterate ? { transliterate } : {}),
    stopWords,
    domainStopWords,
    weakWords,
    reserved,
    blocklist,
    lexicon,
    denyTokens,
    dropPersonNames,
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

/** Canonical JSON: sorted keys, functions as "fn", undefined dropped (SPEC 14.2 item 9). */
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
