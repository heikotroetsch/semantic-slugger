/**
 * Markers (SPEC 5.3): a marker word followed by a number, a number word, one letter or an upper-case
 * Roman numeral gives one `marker` token `<prefix><value>` (`Teil 2` -> `pt2`, `Phase II` -> `ph2`).
 * Without the value the word is a normal word. Every prefix ends in a letter other than `l i o`, so it
 * never makes an I8 pair with the digits that follow.
 */

/**
 * What a marker takes after its word: `number` (`\d{1,3}` or a number word or a Roman numeral),
 * `number-or-letter` (also one letter `[a-z]`), `number-letter-or-size` (also `xs xl xxl xxxl`),
 * `number-or-class` (also `\d{1,2}[a-z]`, `Klasse 4b`).
 */
export type MarkerTakes = 'number' | 'number-or-letter' | 'number-letter-or-size' | 'number-or-class'

export interface MarkerDef {
  readonly words: readonly string[]
  readonly prefix: string
  readonly takes: MarkerTakes
}

export const MARKERS_DE: readonly MarkerDef[] = [
  { words: ['teil'], prefix: 'pt', takes: 'number-or-letter' },
  { words: ['kapitel'], prefix: 'kap', takes: 'number' },
  { words: ['abschnitt'], prefix: 'abs', takes: 'number' },
  { words: ['folge'], prefix: 'ep', takes: 'number' },
  { words: ['staffel'], prefix: 's', takes: 'number' },
  { words: ['ausgabe', 'heft'], prefix: 'nr', takes: 'number' },
  { words: ['runde'], prefix: 'rd', takes: 'number' },
  { words: ['welle'], prefix: 'w', takes: 'number' },
  { words: ['stufe'], prefix: 'stf', takes: 'number' },
  { words: ['lektion'], prefix: 'ls', takes: 'number' },
  { words: ['modul'], prefix: 'mod', takes: 'number' },
  { words: ['schritt'], prefix: 'step', takes: 'number' },
  { words: ['meilenstein'], prefix: 'ms', takes: 'number' },
  { words: ['gruppe'], prefix: 'grp', takes: 'number-or-letter' },
  { words: ['raum'], prefix: 'rm', takes: 'number-or-letter' },
  { words: ['halle'], prefix: 'h', takes: 'number-or-letter' },
  { words: ['tag'], prefix: 'tag', takes: 'number' },
  { words: ['variante'], prefix: 'var', takes: 'number-or-letter' },
  { words: ['groesse'], prefix: 'sz', takes: 'number-letter-or-size' },
  { words: ['klasse'], prefix: 'kla', takes: 'number-or-class' },
  { words: ['einheit'], prefix: 'einh', takes: 'number' },
  { words: ['typ'], prefix: 'typ', takes: 'number-or-letter' },
  { words: ['modell'], prefix: 'md', takes: 'number-or-letter' },
  { words: ['artikel', 'art'], prefix: 'art', takes: 'number' },
  { words: ['absatz', 'abs'], prefix: 'abs', takes: 'number' },
  { words: ['los'], prefix: 'los', takes: 'number-or-letter' },
]

export const MARKERS_EN: readonly MarkerDef[] = [
  { words: ['part'], prefix: 'pt', takes: 'number-or-letter' },
  { words: ['chapter'], prefix: 'ch', takes: 'number' },
  { words: ['section'], prefix: 'sect', takes: 'number' },
  { words: ['season'], prefix: 's', takes: 'number' },
  { words: ['issue', 'edition'], prefix: 'nr', takes: 'number' },
  { words: ['round'], prefix: 'rd', takes: 'number' },
  { words: ['wave'], prefix: 'w', takes: 'number' },
  { words: ['level'], prefix: 'lv', takes: 'number' },
  { words: ['tier'], prefix: 'tier', takes: 'number' },
  { words: ['lesson'], prefix: 'ls', takes: 'number' },
  { words: ['module'], prefix: 'mod', takes: 'number' },
  { words: ['step'], prefix: 'step', takes: 'number' },
  { words: ['milestone'], prefix: 'ms', takes: 'number' },
  { words: ['group'], prefix: 'grp', takes: 'number-or-letter' },
  { words: ['room'], prefix: 'rm', takes: 'number-or-letter' },
  { words: ['hall'], prefix: 'h', takes: 'number-or-letter' },
  { words: ['day'], prefix: 'day', takes: 'number' },
  { words: ['variant'], prefix: 'var', takes: 'number-or-letter' },
  { words: ['size'], prefix: 'sz', takes: 'number-letter-or-size' },
  { words: ['class'], prefix: 'cls', takes: 'number-or-class' },
  { words: ['grade'], prefix: 'gr', takes: 'number-or-class' },
  { words: ['unit'], prefix: 'unit', takes: 'number' },
  { words: ['type'], prefix: 'typ', takes: 'number-or-letter' },
  { words: ['model'], prefix: 'md', takes: 'number-or-letter' },
  { words: ['article'], prefix: 'art', takes: 'number' },
  { words: ['lot'], prefix: 'lot', takes: 'number-or-letter' },
]

/** Same word in German and English. */
export const MARKERS_SHARED: readonly MarkerDef[] = [
  { words: ['episode', 'ep'], prefix: 'ep', takes: 'number' },
  { words: ['sprint'], prefix: 'sprint', takes: 'number' },
  { words: ['phase'], prefix: 'ph', takes: 'number' },
  { words: ['batch'], prefix: 'b', takes: 'number' },
  { words: ['option'], prefix: 'opt', takes: 'number-or-letter' },
]

/** `§` and `§§` directly before a number (`§ 5` -> `par5`). */
export const MARKER_PARAGRAPH_PREFIX = 'par'

/** `#` + `\d{1,6}` (`#4521` -> `nr4521`). */
export const MARKER_HASH_PREFIX = 'nr'

/** Sizes after a size marker (`Größe XL`), besides one letter. */
export const MARKER_SIZES: readonly string[] = ['xs', 'xl', 'xxl', 'xxxl']

/** Words between a marker word and its number (`Teil Nr. 3`). */
export const MARKER_NUMBER_WORDS: readonly string[] = ['nr', 'no']

/** Roman numerals 1 to 10 for markers, written in upper case (`Phase II`). */
export const MARKER_ROMAN: readonly string[] = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
