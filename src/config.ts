/**
 * Config types, DEFAULTS, validation, resolved config and fingerprint (SPEC 16.2, 14.2).
 */

import { RE_DIGIT_CHAR, RE_FALLBACK_WORD, RE_LIST_ENTRY } from './core/regexes.ts'
import { fold, hardHitIn, segmentBlocked } from './core/safety.ts'
import { keyFor } from './core/tail.ts'
import {
  bool,
  fail,
  fnOpt,
  intIn,
  isPlainObject,
  LEXICON_CLASSES,
  normEntries,
  oneOf,
  own,
  stringArray,
  validateLexiconEntry,
} from './core/validate.ts'
import { BLOCK_HARD, BLOCK_SOFT } from './data/v1/blocklist.ts'
import {
  CUSTOM_ALPHABET_MIN,
  CUSTOM_ALPHABET_MIN_LETTERS,
  FALLBACK_WORD,
  K_V1_TEXT,
  TAIL_ALPHABETS,
  TAIL_FORBIDDEN_CHARS,
} from './data/v1/constants.ts'
import { NOISE_SHARED } from './data/v1/noise.ts'
import { RESERVED } from './data/v1/reserved.ts'
import { utf8 } from './hash/encode.ts'
import { siphash, u64hex } from './hash/siphash.ts'
import { dePack } from './lang/de.ts'
import { enPack } from './lang/en.ts'
import { type LanguagePack, validatePacks } from './lang/pack.ts'

export { LEXICON_CLASSES }

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
  /**
   * '*' or an enabled language code. Built-in entries always set it (SPEC 6.1); user entries default
   * to '*', pack entries to the pack code. Validated entries always have it.
   */
  lang?: Lang | '*'
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
  /** Tail IDs tried per window in tiers B and C, 2 to 256 (default 8). */
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

/** Built-in language codes (SPEC 6.7). */
export const BUILTIN_LANGS: readonly string[] = ['de', 'en']

/** The built-in pack for a code, or undefined. */
export function builtinPack(code: string): LanguagePack | undefined {
  return code === 'de' ? dePack() : code === 'en' ? enPack() : undefined
}

/**
 * Default `stopWords` list (SPEC 6.3, 16.2): the function words of all enabled packs, then the noise
 * words (shared tier plus each enabled pack's `noiseWords`). Sorted and unique after normalization.
 */
export function defaultStopWords(packs: readonly LanguagePack[]): readonly string[] {
  const out: string[] = []
  for (const p of packs) out.push(...p.stopWords)
  out.push(...NOISE_SHARED)
  for (const p of packs) out.push(...(p.noiseWords ?? []))
  return out
}

/** The enabled packs in `languages` order. */
export function enabledPacks(languages: readonly string[], userPacks: readonly LanguagePack[]): LanguagePack[] {
  return languages.map((l) => builtinPack(l) ?? (userPacks.find((p) => p.code === l) as LanguagePack))
}

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

export const SECRET_MIN_LENGTH = 16

function resolveList(field: string, opt: unknown, defaults: readonly string[], leet = false): readonly string[] {
  const map = leet ? fold : undefined
  if (opt === undefined) return normEntries(field, defaults, map)
  if (typeof opt === 'function') {
    const r: unknown = (opt as (d: readonly string[]) => unknown)(Object.freeze(normEntries(field, defaults)))
    return normEntries(field, stringArray(field, r), map)
  }
  if (!isPlainObject(opt)) fail(field, opt, 'invalid-list')
  for (const k of Object.keys(opt)) if (k !== 'add' && k !== 'remove') fail(`${field}.${k}`, opt[k], 'unknown-key')
  const add = own(opt, 'add')
  const remove = own(opt, 'remove')
  const a = add === undefined ? [] : stringArray(`${field}.add`, add)
  const r = remove === undefined ? [] : stringArray(`${field}.remove`, remove)
  const drop = new Set(normEntries(`${field}.remove`, r, map))
  const base = normEntries(field, defaults, map).filter((x) => !drop.has(x))
  return normEntries(field, [...base, ...a], map)
}

function resolveAlphabet(v: unknown): { name: 'safe' | 'strict' | 'custom'; first: string; rest: string } {
  if (v === undefined || v === 'safe') return { name: 'safe', ...TAIL_ALPHABETS.safe }
  if (v === 'strict') return { name: 'strict', ...TAIL_ALPHABETS.strict }
  if (typeof v !== 'string') fail('tailAlphabet', v, 'not-string')
  if (new Set(v).size !== v.length) fail('tailAlphabet', v, 'alphabet-duplicate-char')
  if (!RE_LIST_ENTRY.test(v)) fail('tailAlphabet', v, 'alphabet-invalid-char')
  for (const c of TAIL_FORBIDDEN_CHARS) if (v.includes(c)) fail('tailAlphabet', v, 'alphabet-forbidden-char')
  if (v.length < CUSTOM_ALPHABET_MIN) fail('tailAlphabet', v, 'alphabet-too-short')
  const letters = v.replace(RE_DIGIT_CHAR, '')
  if (letters.length < CUSTOM_ALPHABET_MIN_LETTERS) fail('tailAlphabet', v, 'alphabet-too-few-letters')
  return { name: 'custom', first: letters, rest: v }
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
  return v.map((e: unknown, i: number) => validateLexiconEntry(e, `lexicon[${i}]`, languages, '*'))
}

/** Deny tokens (SPEC 6.6): single words or multi-word entries (`anna weber`), normalized like titles. */
function resolveDeny(v: unknown): readonly string[] {
  if (v === undefined) return []
  return normEntries('denyTokens', stringArray('denyTokens', v), undefined, true)
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
  const languagePacks = validatePacks(g('languagePacks'), BUILTIN_LANGS)
  const languages = resolveLanguages(g('languages'), languagePacks)
  const defaultLang = g('defaultLang') ?? DEFAULTS.defaultLang
  if (typeof defaultLang !== 'string') fail('defaultLang', defaultLang, 'not-string')
  if (!BUILTIN_LANGS.includes(defaultLang) && !languagePacks.some((p) => p.code === defaultLang))
    fail('defaultLang', defaultLang, 'unknown-language')
  if (!languages.includes(defaultLang)) fail('defaultLang', defaultLang, 'default-lang-not-enabled')
  const detectLanguage = fnOpt<ResolvedConfig['detectLanguage']>('detectLanguage', g('detectLanguage'))
  const transliterate = fnOpt<ResolvedConfig['transliterate']>('transliterate', g('transliterate'))
  const stopWords = resolveList('stopWords', g('stopWords'), defaultStopWords(enabledPacks(languages, languagePacks)))
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
  const denyTokens = resolveDeny(g('denyTokens'))
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
  if (typeof fw !== 'string' || !RE_FALLBACK_WORD.test(fw)) fail('fallbackWord', fw, 'invalid-fallback-word')
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
