/**
 * Language pack interface (SPEC 6.7). Experimental: it may change before 1.0.
 * M1.5 has the type only; the built-in `de` and `en` packs and the full validation follow in M2.
 */

import type { LexiconEntry } from '../config.ts'

/** @experimental A language pack adds a language without a code change (SPEC 6.7). */
export interface LanguagePack {
  /** /^[a-z]{2,3}$/, not 'und', not a built-in code. */
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
  markers?: readonly { words: readonly string[]; prefix: string; takes: 'number' | 'number-or-letter' }[]
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
  }
}
