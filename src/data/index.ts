/**
 * "semantic-slugger/data": the frozen v1 data, for inspection and for building custom lists
 * (SPEC 16.1). It exports no domain packs.
 */

export { BLOCK_HARD, BLOCK_SHORT_DE, BLOCK_SOFT, TAIL_BLOCK, TAIL_BLOCK_EXTRA } from './v1/blocklist.ts'
export { CONFLICT_DE, CONFLICT_EN } from './v1/conflict.ts'
export { FALLBACK_WORD, K_V1_TEXT, LEET_FOLD, TAIL_ALPHABETS, type TailAlphabetDef } from './v1/constants.ts'
export { V1_DATA_DIGEST } from './v1/digest.ts'
export { DOCKIND_DE, DOCKIND_EN } from './v1/dockind.ts'
export { LEGAL_ALWAYS, LEGAL_AMBIGUOUS, LEGAL_MULTI, LEGAL_TITLE_CASE } from './v1/legal.ts'
export { LEXICON_DE } from './v1/lexicon-de.ts'
export { LEXICON_EN } from './v1/lexicon-en.ts'
export { LEXICON_SHARED } from './v1/lexicon-shared.ts'
export {
  MARKER_HASH_PREFIX,
  MARKER_PARAGRAPH_PREFIX,
  MARKER_SIZES,
  MARKERS_DE,
  MARKERS_EN,
  MARKERS_SHARED,
  type MarkerDef,
  type MarkerTakes,
} from './v1/markers.ts'
export { MONTHS_DE, MONTHS_EN } from './v1/months.ts'
export { NOISE_DE, NOISE_EN, NOISE_SHARED } from './v1/noise.ts'
export { NUMBER_WORDS_DE, NUMBER_WORDS_EN } from './v1/number-words.ts'
export { PARTS_DE, PARTS_SHARED } from './v1/parts-de.ts'
export { QUALIFIERS } from './v1/qualifiers.ts'
export { RESERVED } from './v1/reserved.ts'
export { PERSON_TITLES_DE, STOP_DE } from './v1/stop-de.ts'
export { PERSON_TITLES_EN, STOP_EN } from './v1/stop-en.ts'
export { TRANSLIT_CYRILLIC, TRANSLIT_GREEK } from './v1/translit.ts'
export { UNITS } from './v1/units.ts'
export { VERSION_WORDS } from './v1/versions.ts'
export { WEAK_DE, WEAK_EN, WEAK_SHARED } from './v1/weak.ts'
export { WEEKDAYS_DE, WEEKDAYS_EN } from './v1/weekdays.ts'
