/**
 * Number words (SPEC 5.1 step 4b). Rows for 1 to 12; all forms of one number in a row.
 * After a marker word they are the marker's number (`Teil Zwei` -> `pt2`, `Part One` -> `pt1`).
 * Elsewhere they are dropped like `smallnum`, but only in titles of their language (`Elf on the Shelf`).
 * `ein` and `eine` are function words, not number words.
 */

/** Cardinal, then the ordinal stem with the endings `e er es en em`. */
export const NUMBER_WORDS_DE: readonly (readonly string[])[] = [
  ['eins', 'erste', 'erster', 'erstes', 'ersten', 'erstem'],
  ['zwei', 'zweite', 'zweiter', 'zweites', 'zweiten', 'zweitem'],
  ['drei', 'dritte', 'dritter', 'drittes', 'dritten', 'drittem'],
  ['vier', 'vierte', 'vierter', 'viertes', 'vierten', 'viertem'],
  ['fuenf', 'fuenfte', 'fuenfter', 'fuenftes', 'fuenften', 'fuenftem'],
  ['sechs', 'sechste', 'sechster', 'sechstes', 'sechsten', 'sechstem'],
  ['sieben', 'siebte', 'siebter', 'siebtes', 'siebten', 'siebtem'],
  ['acht', 'achte', 'achter', 'achtes', 'achten', 'achtem'],
  ['neun', 'neunte', 'neunter', 'neuntes', 'neunten', 'neuntem'],
  ['zehn', 'zehnte', 'zehnter', 'zehntes', 'zehnten', 'zehntem'],
  ['elf', 'elfte', 'elfter', 'elftes', 'elften', 'elftem'],
  ['zwoelf', 'zwoelfte', 'zwoelfter', 'zwoelftes', 'zwoelften', 'zwoelftem'],
]

export const NUMBER_WORDS_EN: readonly (readonly string[])[] = [
  ['one', 'first'],
  ['two', 'second'],
  ['three', 'third'],
  ['four', 'fourth'],
  ['five', 'fifth'],
  ['six', 'sixth'],
  ['seven', 'seventh'],
  ['eight', 'eighth'],
  ['nine', 'ninth'],
  ['ten', 'tenth'],
  ['eleven', 'eleventh'],
  ['twelve', 'twelfth'],
]
