/**
 * v1 constants that affect output (SPEC 14.2). Changing any value changes IDs.
 */

/** Hash key text. `utf8(K_V1_TEXT)` is exactly 16 bytes (SPEC 13.1). */
export const K_V1_TEXT = 'semantic-slug-v1'

/** Hash domain prefix for tail words (SPEC 13.1). */
export const TAIL_DOMAIN = 'ss1'

/** Field separator inside hash inputs. */
export const HASH_FIELD_SEP = '\x1f'

/** Number of base-|alphabet| digits taken from one 64-bit hash word (SPEC 13.1). */
export const DIGITS_PER_WORD = 13

/** Draws per tail index before the resolver moves to k + 1 (SPEC 9.2 B5, 13.1). 16, not 4: a blank index lags the tail index walk for good (docs/DEVIATIONS.md, M5). */
export const TAIL_DRAWS = 16

/** Load rule: keep the share of taken tails per attempt at or below 1/16 (SPEC 13.2). */
export const TAIL_LOAD_FACTOR = 16

export interface TailAlphabetDef {
  /** Chars allowed as the first tail char (consonant letters). */
  readonly first: string
  /** Chars allowed at every other tail position. */
  readonly rest: string
}

/** Built-in tail alphabets (SPEC 2.2). */
export const TAIL_ALPHABETS: { readonly safe: TailAlphabetDef; readonly strict: TailAlphabetDef } = {
  /** Screen use: no vowels, no look-alikes 0 o 1 l i. */
  safe: { first: 'bcdfghjkmnpqrstvwxyz', rest: 'bcdfghjkmnpqrstvwxyz23456789' },
  /** Phone and print: Crockford-like, at most one letter per rhyme group, no 2 and 9. */
  strict: { first: 'kmqrtxy', rest: 'kmqrtxy345678' },
}

/** Chars a custom tail alphabet must not contain (SPEC 2.2). */
export const TAIL_FORBIDDEN_CHARS = 'aeiou01l'

/** Minimum size of a custom tail alphabet and its letter count (SPEC 2.2). */
export const CUSTOM_ALPHABET_MIN = 12
export const CUSTOM_ALPHABET_MIN_LETTERS = 6

/** Leet fold f(s) (SPEC 9.1). */
export const LEET_FOLD: Readonly<Record<string, string>> = {
  '4': 'a',
  '3': 'e',
  '0': 'o',
  '1': 'i',
  '5': 's',
  '7': 't',
  '8': 'b',
}

/** Extra fold for tail chars only: fT(s) = f(s) plus these (SPEC 9.1). */
export const TAIL_EXTRA_FOLD: Readonly<Record<string, string>> = { v: 'u' }

/** Default fallback word for empty titles (SPEC 13.6, decision C10). */
export const FALLBACK_WORD = 'doc'

export const ALGORITHM_VERSION = 1 as const
