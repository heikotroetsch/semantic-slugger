/**
 * Every regular expression of the core, in one place (SPEC 4.3). The ReDoS harness
 * (`test/unit/redos.test.ts`) runs each export against 4096-char adversarial inputs, and a lint test
 * fails when a regex literal elsewhere in `src/` is not registered here (vendored code registers its own).
 * Rules: linear patterns only, no nested quantifiers, every repeat bounded. All patterns that touch
 * title text use the `u` flag where they need Unicode classes.
 *
 * `B` and `E` in comments are the Unicode word edges `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])`.
 */

// ---- list and config checks ----

export const RE_LIST_ENTRY: RegExp = /^[a-z0-9]+$/
export const RE_PHRASE_ENTRY: RegExp = /^[a-z0-9]+(?: [a-z0-9]+){0,15}$/
export const RE_LEXICON_KEY: RegExp = /^[a-z0-9]+(?: [a-z0-9]+){0,15}$/
export const RE_MARKER_PREFIX: RegExp = /^[a-z]{0,5}[a-hj-km-np-z]$/
export const RE_PACK_CODE: RegExp = /^[a-z]{2,3}$/
export const RE_LINKER: RegExp = /^[a-z]{0,4}$/
export const RE_TRANSLIT_VALUE: RegExp = /^[a-z0-9]{0,8}$/
export const RE_FALLBACK_WORD: RegExp = /^[a-z]{2,8}$/
export const RE_DIGIT_CHAR: RegExp = /[0-9]/g
export const RE_SPACES: RegExp = /\s{1,4096}/gu
export const RE_SPACE_CHAR: RegExp = /\s/u
export const RE_NUMBER_CHAR: RegExp = /\p{N}/u

// ---- ID shape (SPEC 2.3) ----

export const RE_ID_DASH: RegExp = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const RE_ID_UNDERSCORE: RegExp = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
export const RE_ID_PLAIN: RegExp = /^[a-z][a-z0-9]*$/
export const RE_ALL_DIGITS: RegExp = /^[0-9]+$/
export const RE_FIRST_LETTER: RegExp = /^[a-z]/
export const RE_LOOKALIKE_PAIR: RegExp = /[lio][01]|[01][lio]/

// ---- normalization (SPEC 4.1) ----

export const RE_FOLD_CHARS: RegExp = /[äöüßłøæœđðþı]/g
export const RE_MARKS: RegExp = /\p{M}/gu
export const RE_NON_ALNUM_RUN: RegExp = /[^a-z0-9]+/g
export const RE_NON_ALNUM: RegExp = /[^a-z0-9]/g
export const RE_MARKUP: RegExp = /<[^>]{0,200}>/g
export const RE_ENTITY: RegExp = /&(?:#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/gi
export const RE_SOFT_HYPHEN: RegExp = /­/g
export const RE_ZERO_WIDTH: RegExp = /[​-‍⁠﻿]/g
export const RE_EMOJI: RegExp = /\p{Extended_Pictographic}|️|⃣/gu
export const RE_CAPITAL_SHARP_S: RegExp = /ẞ/g
/** Turkish capital dotted I (U+0130). */
export const RE_CAPITAL_DOTTED_I: RegExp = /\u0130/g
export const RE_CPP: RegExp = /c\+\+/g
export const RE_CSHARP: RegExp = /c#/g
export const RE_DOTNET: RegExp = /(^|\s)\.net(?![\p{L}\p{N}])/gu
export const RE_LETTER: RegExp = /\p{L}/u
export const RE_LATIN_LETTER: RegExp = /\p{Script=Latin}/u
export const RE_ASCII_DIGIT: RegExp = /[0-9]/

// ---- noise removal (SPEC 4.3), in this order ----

/** Step 1, emails. Bounded; the rev 1 pattern took seconds on `"a@" x 2048`. */
export const RE_EMAIL: RegExp = /[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,4}/gu
/** Step 2, URLs. */
export const RE_URL: RegExp = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)[^\s]{1,2048}/gu
/** Step 3, IBAN: SEPA country code + 2 digits + 3 to 7 groups of 4 (+ a short last group). */
export const RE_IBAN: RegExp =
  /(?<![\p{L}\p{N}])(?:ad|at|be|bg|ch|cy|cz|de|dk|ee|es|fi|fr|gb|gr|hr|hu|ie|is|it|li|lt|lu|lv|mc|mt|nl|no|pl|pt|ro|se|si|sk|sm)\d{2}(?: ?[a-z0-9]{4}){3,7}(?: ?[a-z0-9]{1,3})?(?![\p{L}\p{N}])/gu
/** The 4-char groups of an IBAN match (all years: not an IBAN). */
export const RE_IBAN_GROUP: RegExp = /[a-z0-9]{4}/g
export const RE_YEAR_ONLY: RegExp = /^(?:19|20)\d\d$/
/** Step 4, dates (masked as a protected span, never removed). */
export const RE_DATE: RegExp = /(?<![\p{L}\p{N}])(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\p{L}\p{N}])/gu
/** Step 5, phone numbers: a leading `+` or `0` and at least one separator. */
export const RE_PHONE: RegExp = /(?<![\p{L}\p{N}])(?:\+\d{1,3}|0\d{1,5})(?:[ /()-]{1,2}\d{1,8}){1,4}(?![\p{L}\p{N}])/gu
export const RE_DIGIT_GROUP: RegExp = /\d{1,15}/g
/** Step 7, money (both orders). */
export const RE_MONEY: RegExp = /\d[\d.,]{0,20}\s?(?:€|eur|euro|usd|\$|chf|gbp|£|tsd|mio|mrd|k€)(?![\p{L}\p{N}])/gu
export const RE_MONEY_REVERSE: RegExp = /(?:€|eur|usd|\$|chf|gbp|£)\s?\d[\d.,]{0,20}(?![\p{L}\p{N}])/gu
/** Step 8, percent. */
export const RE_PERCENT: RegExp = /\d{1,6}(?:[.,]\d{1,4})?\s?%/gu

// ---- protected spans and number tokens (SPEC 4.3 step 6, 5.1, 5.4) ----

/** Ranges `2025/2026`, `2025/26`, `2026–2028`. */
export const RE_RANGE: RegExp =
  /(?<![\p{L}\p{N}])((?:19|20)\d{2})\s{0,3}[/–—-]\s{0,3}((?:19|20)?\d{2})(?![\p{L}\p{N}])/gu
/** Fiscal years `FY26`, `fy 2026`. */
export const RE_FY: RegExp = /(?<![\p{L}\p{N}])fy\s?(\d{4}|\d{2})(?![\p{L}\p{N}])/gu
/** Weeks `KW 12`, `CW12`, `week 22`, `wk3`. */
export const RE_WEEK: RegExp = /(?<![\p{L}\p{N}])(kw|cw|week|wk)\s?(\d{1,2})(?![\p{L}\p{N}])/gu
/** Years 1900 to 2099. */
export const RE_YEAR: RegExp = /(?<![\p{L}\p{N}])(?:19|20)\d\d(?![\p{L}\p{N}])/gu
/** Historic years 1500 to 1899 (SPEC 5.4). */
export const RE_HISTORIC_YEAR: RegExp = /(?<![\p{L}\p{N}])1[5-8]\d\d(?![\p{L}\p{N}])/gu
/** Long numbers (order, invoice, case numbers); not the digits of a decimal (`3.14159` is noise). */
export const RE_LONGNUM: RegExp = /(?<![\p{L}\p{N}]|\d[.,])\d{5,4096}(?![\p{L}\p{N}]|[.,]\d)/gu
/** `v2`, `v2.4`, `v1.10.3`. */
export const RE_VERSION_V: RegExp = /(?<![\p{L}\p{N}])v(\d{1,3}(?:[._]\d{1,3}){0,2})(?![\p{L}\p{N}])/gu
/** A word followed by a version number; the word is checked against the version words (SPEC 5.4). */
export const RE_VERSION_WORD: RegExp =
  /(?<![\p{L}\p{N}])([a-z]{2,12})\.?\s{0,3}(\d{1,3}(?:\.\d{1,3}){0,2})(?![\p{L}\p{N}])/gu
/** A number with a unit word; the unit is checked against the unit table (SPEC 5.2). */
export const RE_QUANTITY: RegExp = /(?<![\p{L}\p{N}])(\d{1,6}(?:[.,]\d{1,3})?)\s?([a-z][a-z0-9]{0,6})(?![\p{L}\p{N}])/gu
/** Decimals `42,5`, `2.0`, `3.12` (noise unless a version, SPEC 5.4). */
export const RE_DECIMAL: RegExp = /(?<![\p{L}\p{N}])\d{1,6}[.,]\d{1,6}(?:\.\d{1,3})?(?![\p{L}\p{N}])/gu
/** A decimal that can be a version: dot only, `\d{1,2}.\d{1,2}(.\d{1,3})?`. */
export const RE_DECIMAL_VERSION: RegExp = /^\d{1,2}\.\d{1,2}(?:\.\d{1,3})?$/
/** `§ 5`, `§§ 12`. */
export const RE_PARAGRAPH: RegExp = /§{1,2}\s{0,3}(\d{1,3})(?![\p{L}\p{N}])/gu
/** `#4521`. */
export const RE_HASH_NUMBER: RegExp = /#(\d{1,6})(?![\p{L}\p{N}])/gu

// ---- tokens (SPEC 5.1, 5.2) ----

/** Code run candidates: chars from `[a-z0-9()/.-]` without spaces (checked against the case mask). */
export const RE_CODE_RUN: RegExp = /[a-z0-9()/.-]{1,256}/g
/** A hyphen followed by a word of 4+ letters ends a code run (`B2B-Marketing`). */
export const RE_RUN_WORD_TAIL: RegExp = /-[a-z]{4,256}/g
/** A hyphen part that starts with 4+ letters (`3-Zimmer-Wohnung`: the number is cut off, SPEC 5.1). */
export const RE_HYPHEN_WORD: RegExp = /^\p{L}{4}/u
export const RE_TOKEN_CHARS: RegExp = /[\p{L}\p{N}-]{1,4096}/gu
export const RE_DIGITS: RegExp = /^\d{1,4096}$/
export const RE_HAS_DIGIT: RegExp = /\d/
export const RE_HAS_LETTER: RegExp = /[a-z]/
export const RE_ORDINAL: RegExp = /^\d{1,4}(?:st|nd|rd|th)$/
export const RE_AMPM_GLUED: RegExp = /^(\d{1,2})(am|pm)$/
export const RE_QUARTER: RegExp = /^q[1-4]$/
export const RE_GLUED_MARKER: RegExp = /^([a-z]{1,12})(\d{1,3})$/
export const RE_CLASS_VALUE: RegExp = /^\d{1,2}[a-z]$/
/** Roman numerals 1 to 39 (noise when written in upper case, SPEC 5.2). */
export const RE_ROMAN: RegExp = /^x{0,3}(?:ix|iv|v?i{0,3})$/
export const RE_ILO_ONLY: RegExp = /^[ilo]{1,3}$/
export const RE_VOWEL: RegExp = /[aeiouy]/
/** The char after a token that starts a new sentence (name signal 4, SPEC 6.6). */
export const RE_SENTENCE_BREAK: RegExp = /^[:!?]$/
export const RE_STANDARD_PREFIX: RegExp = /^(?:din|en|iso|iec|ieee|rfc)$/
export const RE_UNDERSCORE: RegExp = /_/g
export const RE_DOT: RegExp = /\./g

// ---- SQL identifiers of the DB adapters (SPEC 17.3) ----

export const RE_SQL_TABLE: RegExp = /^[A-Za-z_][A-Za-z0-9_]{0,62}(?:\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/
/** Constraint name in a Postgres unique-violation message (Prisma 6 raw query errors). */
export const RE_PG_CONSTRAINT: RegExp = /unique constraint "([^"]{1,128})"/
export const RE_SQL_IDENT: RegExp = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
