/**
 * Cut tables of the built-in packs (SPEC 11.3). A cut may end only in an allowed final consonant
 * cluster (coda), and a syllable cut needs an allowed onset after it. Every single consonant is
 * allowed in both lists; the lists below hold the clusters. Packs without `phonology` use the `en`
 * tables. This is v1 data: a change changes IDs (SPEC 14.2).
 */

/** Single consonant letters: each is an allowed coda and onset in every table. */
export const SINGLE_CONSONANTS: readonly string[] = 'bcdfghjklmnpqrstvwxz'.split('')

// biome-ignore format: word list
export const CODAS_DE: readonly string[] = [
  'ch', 'ck', 'ng', 'nk', 'nd', 'nt', 'nz', 'ns', 'nf', 'mp', 'ms', 'mt', 'lt', 'ld', 'lf', 'lk', 'lm', 'ln',
  'lp', 'ls', 'lz', 'rt', 'rd', 'rg', 'rk', 'rl', 'rm', 'rn', 'rp', 'rs', 'rz', 'rb', 'rf', 'rch', 'lch', 'nch',
  'st', 'ft', 'cht', 'pf', 'tz', 'ss', 'ff', 'll', 'mm', 'nn', 'rr', 'tt', 'pp', 'sch', 'rst', 'nst', 'ngs',
  // M4 (docs/DEVIATIONS.md): common German codas missing from the SPEC 11.3 list (Stadt, Bahn, Fahrt, Stuhl)
  'dt', 'hl', 'hm', 'hn', 'hr', 'ht',
]

/** The `de` codas of SPEC 11.3 plus the English clusters (SPEC 11.3). */
// biome-ignore format: word list
export const CODAS_EN: readonly string[] = [
  'ch', 'ck', 'ng', 'nk', 'nd', 'nt', 'nz', 'ns', 'nf', 'mp', 'ms', 'mt', 'lt', 'ld', 'lf', 'lk', 'lm', 'ln',
  'lp', 'ls', 'lz', 'rt', 'rd', 'rg', 'rk', 'rl', 'rm', 'rn', 'rp', 'rs', 'rz', 'rb', 'rf', 'rch', 'lch', 'nch',
  'st', 'ft', 'cht', 'pf', 'tz', 'ss', 'ff', 'll', 'mm', 'nn', 'rr', 'tt', 'pp', 'sch', 'rst', 'nst', 'ngs',
  'sh', 'th', 'ght', 'ct', 'pt', 'sk', 'sp', 'x',
]

// biome-ignore format: word list
export const ONSETS_DE: readonly string[] = [
  'bl', 'br', 'ch', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kn', 'kr', 'pf', 'pfl', 'pfr', 'ph', 'pl', 'pr', 'qu',
  'sch', 'schl', 'schm', 'schn', 'schr', 'schw', 'sp', 'spr', 'st', 'str', 'th', 'tr', 'ts', 'tz', 'zw',
]

// biome-ignore format: word list
export const ONSETS_EN: readonly string[] = [
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn',
  'sp', 'spr', 'st', 'str', 'sw', 'th', 'thr', 'tr', 'tw', 'wh', 'wr',
]
