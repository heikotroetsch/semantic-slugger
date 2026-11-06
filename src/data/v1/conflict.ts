/**
 * Conflict words (SPEC 6.3): function words that are also content words in the other language.
 * They are removed only when the title language matches (`und` titles: `defaultLang` decides).
 * Each word is also in the function word list of its language (unit test).
 */

/** `die war hat bin man fast pro` must survive in EN titles (`Die Casting`, `War Room`, `Pro 14`). */
export const CONFLICT_DE: readonly string[] = [
  'die',
  'war',
  'hat',
  'bin',
  'man',
  'fast',
  'will',
  'also',
  'so',
  'an',
  'pro',
]

/** `an also so will` are in both lists. */
export const CONFLICT_EN: readonly string[] = ['an', 'also', 'so', 'will']
