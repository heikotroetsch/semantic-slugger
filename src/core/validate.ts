/**
 * Shared config validation helpers (SPEC 16.2). Used by `config.ts` and `lang/pack.ts`.
 * Every failure throws ConfigError with `details: { field, value, reason }`.
 */

import type { LexiconEntry } from '../config.ts'
import { ConfigError } from '../errors.ts'
import { normalizeListEntry } from './normalize.ts'
import { RE_LEXICON_KEY, RE_LIST_ENTRY, RE_MARKER_PREFIX, RE_PHRASE_ENTRY } from './regexes.ts'

export function fail(field: string, value: unknown, reason: string, message?: string): never {
  throw new ConfigError(message ?? `invalid config "${field}": ${reason}`, { field, value, reason })
}

/** Any non-array object. Only own enumerable keys are read from it (see `own`). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Own enumerable keys only. Inherited keys are ignored (no prototype pollution). */
export function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) && Object.prototype.propertyIsEnumerable.call(obj, key) ? obj[key] : undefined
}

export function intIn(field: string, v: unknown, def: number, min: number, max: number): number {
  if (v === undefined) return def
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(field, v, 'not-integer')
  if (v < min || v > max) fail(field, v, 'out-of-range', `invalid config "${field}": must be ${min} to ${max}`)
  return v
}

export function oneOf<T extends string>(field: string, v: unknown, def: T, values: readonly T[]): T {
  if (v === undefined) return def
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) fail(field, v, 'invalid-enum')
  return v as T
}

export function bool(field: string, v: unknown, def: boolean): boolean {
  if (v === undefined) return def
  if (typeof v !== 'boolean') fail(field, v, 'not-boolean')
  return v
}

export function fnOpt<F>(field: string, v: unknown): F | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'function') fail(field, v, 'not-function')
  return v as F
}

export function stringArray(field: string, v: unknown, reason = 'invalid-list'): readonly string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(field, v, reason)
  return v as readonly string[]
}

/**
 * Normalize list entries like titles (SPEC 6.7, 16.2). Single words must match `[a-z0-9]+`; with
 * `phrases`, words joined by single spaces are allowed too. Returns sorted unique entries.
 */
export function normEntries(
  field: string,
  list: readonly string[],
  map: (s: string) => string = (s) => s,
  phrases = false,
  reason = 'invalid-list-entry',
): string[] {
  const out = new Set<string>()
  for (const raw of list) {
    const n = normalizeListEntry(raw)
    if (!(phrases ? RE_PHRASE_ENTRY : RE_LIST_ENTRY).test(n)) fail(field, raw, reason)
    out.add(map(n))
  }
  return [...out].sort()
}

/** Normalize a list in order, keeping duplicates out but not sorting (for ordered pack data). */
export function normOrdered(field: string, v: unknown, reason: string, phrases = false): readonly string[] {
  const list = stringArray(field, v, reason)
  const out: string[] = []
  for (const raw of list) {
    const n = normalizeListEntry(raw)
    if (!(phrases ? RE_PHRASE_ENTRY : RE_LIST_ENTRY).test(n)) fail(field, raw, reason)
    if (!out.includes(n)) out.push(n)
  }
  return Object.freeze(out)
}

/** The LexiconClass set: the classes allowed for lexicon `cls` (SPEC 15.1). */
export const LEXICON_CLASSES: ReadonlySet<string> = new Set([
  'topic',
  'name',
  'qualifier',
  'place',
  'direction',
  'region',
  'marker',
])

/**
 * Validate one lexicon entry (SPEC 15.1). `langs` are the allowed `lang` values besides `*`;
 * `defaultLang` is used when the entry has no `lang` (user entries: `*`, pack entries: the pack code).
 */
export function validateLexiconEntry(
  e: unknown,
  field: string,
  langs: readonly string[],
  defaultLang: string,
): LexiconEntry {
  if (!isPlainObject(e)) fail(field, e, 'invalid-lexicon')
  const key = own(e, 'key')
  const cls = own(e, 'cls')
  const lang = own(e, 'lang') ?? defaultLang
  if (typeof key !== 'string' || !RE_LEXICON_KEY.test(key)) fail(`${field}.key`, key, 'invalid-lexicon')
  if (typeof cls !== 'string' || !LEXICON_CLASSES.has(cls)) fail(`${field}.cls`, cls, 'invalid-lexicon')
  if (typeof lang !== 'string') fail(`${field}.lang`, lang, 'invalid-lexicon')
  if (lang !== '*' && !langs.includes(lang)) fail(`${field}.lang`, lang, 'unknown-language')
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
    if (prefix === undefined || !RE_MARKER_PREFIX.test(prefix))
      fail(
        `${field}.abbr`,
        prefix,
        'invalid-marker-prefix',
        `invalid config "${field}.abbr": a marker needs abbr[0] matching ${RE_MARKER_PREFIX.source} (SPEC 5.3)`,
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
}
