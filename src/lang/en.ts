/**
 * Built-in English pack (SPEC 6.7). Same interface as user packs. Its data is v1 data (SPEC 14.2):
 * a change needs a digest update.
 */

import { CONFLICT_EN } from '../data/v1/conflict.ts'
import { DOCKIND_EN } from '../data/v1/dockind.ts'
import { LEXICON_EN } from '../data/v1/lexicon-en.ts'
import { MARKERS_EN } from '../data/v1/markers.ts'
import { MONTHS_EN } from '../data/v1/months.ts'
import { NOISE_EN } from '../data/v1/noise.ts'
import { NUMBER_WORDS_EN } from '../data/v1/number-words.ts'
import { QUALIFIERS } from '../data/v1/qualifiers.ts'
import { STOP_EN } from '../data/v1/stop-en.ts'
import { VERSION_WORDS } from '../data/v1/versions.ts'
import { WEAK_EN } from '../data/v1/weak.ts'
import { WEEKDAYS_EN } from '../data/v1/weekdays.ts'
import { porter2 } from '../vendor/porter2.ts'
import type { LanguagePack } from './pack.ts'

let pack: LanguagePack | undefined

/** The built-in `en` pack, built on first use. */
export function enPack(): LanguagePack {
  if (pack === undefined) {
    pack = Object.freeze({
      code: 'en',
      id: 'en@1',
      stopWords: STOP_EN,
      conflictWords: CONFLICT_EN,
      noiseWords: NOISE_EN,
      lexicon: [...LEXICON_EN, ...QUALIFIERS.filter((e) => e.lang === 'en'), ...WEAK_EN, ...DOCKIND_EN],
      stem: porter2,
      hints: {
        chars: '',
        suffixes: ['tion', 'ment', 'ing', 'ship', 'ness', 'ity'],
        weakSuffixes: ['ed', 'ers', 'ies', 'ly', 'ware'],
        digraphs: [],
      },
      nounsCapitalized: false,
      months: MONTHS_EN,
      weekdays: WEEKDAYS_EN,
      weekPrefix: 'wk',
      markers: MARKERS_EN,
      units: [],
      versionWords: VERSION_WORDS,
      numberWords: NUMBER_WORDS_EN,
      attr: {
        suffixes: ['ly', 'ive', 'ous', 'able', 'ible', 'ful', 'less', 'ed'],
        lowerSuffixes: [],
        lowerCaseRule: false,
      },
    })
  }
  return pack
}
