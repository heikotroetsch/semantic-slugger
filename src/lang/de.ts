/**
 * Built-in German pack (SPEC 6.7). Same interface as user packs. Its data is v1 data (SPEC 14.2):
 * a change needs a digest update.
 */

import { CONFLICT_DE } from '../data/v1/conflict.ts'
import { DOCKIND_DE } from '../data/v1/dockind.ts'
import { LEXICON_DE } from '../data/v1/lexicon-de.ts'
import { MARKERS_DE } from '../data/v1/markers.ts'
import { MONTHS_DE } from '../data/v1/months.ts'
import { NOISE_DE } from '../data/v1/noise.ts'
import { NUMBER_WORDS_DE } from '../data/v1/number-words.ts'
import { PARTS_DE } from '../data/v1/parts-de.ts'
import { QUALIFIERS } from '../data/v1/qualifiers.ts'
import { STOP_DE } from '../data/v1/stop-de.ts'
import { VERSION_WORDS } from '../data/v1/versions.ts'
import { WEAK_DE } from '../data/v1/weak.ts'
import { WEEKDAYS_DE } from '../data/v1/weekdays.ts'
import { cistem } from '../vendor/cistem.ts'
import type { LanguagePack } from './pack.ts'

/** Compound linkers (SPEC 7.1). */
export const LINKERS_DE: readonly string[] = ['', 's', 'es', 'n', 'en', 'er', 'e', 'ens']

/** Weak heads (SPEC 7.1): the head is dropped and the modifier becomes the concept. */
// biome-ignore format: word list, one line per group
export const WEAK_HEADS_DE: readonly string[] = [
  'wesen', 'bereich', 'thema', 'frage', 'bericht', 'uebersicht', 'liste', 'plan', 'planung', 'prozess', 'verfahren',
  'konzept', 'system', 'plattform', 'projekt', 'management', 'leitfaden', 'anleitung', 'dokument', 'vorlage',
  'sitzung', 'besprechung', 'protokoll', 'information',
]

/** Generic modifiers (SPEC 7.1): the modifier is dropped and the head becomes the concept. */
// biome-ignore format: word list, one line per group
export const GENERIC_MODIFIERS_DE: readonly string[] = [
  'haupt', 'gesamt', 'sonder', 'neu', 'alt', 'zusatz', 'einzel', 'jahr', 'monat',
]

const VOWELS_Q = 'aeiouyq'
const UMLAUTS: Readonly<Record<string, string>> = { ä: 'a', ö: 'o', ü: 'u' }

/**
 * Key fold for stemming (SPEC 4.4): `ä|ae -> a`, `ö|oe -> o`, `ü|ue -> u`, `ß -> ss`, except
 * `ae/oe/ue` directly after a vowel or `q` (`steuer`, `feuer`, `quelle`, `neue`).
 */
export function deKeyFold(w: string): string {
  let out = ''
  for (let i = 0; i < w.length; i++) {
    const c = w[i] as string
    const u = UMLAUTS[c]
    if (u !== undefined) {
      out += u
      continue
    }
    if (c === 'ß') {
      out += 'ss'
      continue
    }
    const n = w[i + 1]
    if ((c === 'a' || c === 'o' || c === 'u') && n === 'e') {
      const prev = i > 0 ? (w[i - 1] as string) : ''
      if (prev === '' || !VOWELS_Q.includes(prev)) {
        out += c
        i++
        continue
      }
    }
    out += c
  }
  return out
}

/** CISTEM, case insensitive (SPEC 8.2). Input: keyFold of the part. */
export function deStem(w: string): string {
  return cistem(w, true)
}

let pack: LanguagePack | undefined

/** The built-in `de` pack, built on first use. */
export function dePack(): LanguagePack {
  if (pack === undefined) {
    pack = Object.freeze({
      code: 'de',
      id: 'de@1',
      stopWords: STOP_DE,
      conflictWords: CONFLICT_DE,
      noiseWords: NOISE_DE,
      lexicon: [...LEXICON_DE, ...QUALIFIERS.filter((e) => e.lang === 'de'), ...WEAK_DE, ...DOCKIND_DE],
      stem: deStem,
      keyFold: deKeyFold,
      hints: {
        chars: 'äöüß',
        suffixes: ['ung', 'keit', 'heit', 'schaft', 'lich', 'isch'],
        weakSuffixes: [],
        digraphs: ['ae', 'oe', 'ue'],
      },
      nounsCapitalized: true,
      compound: {
        parts: PARTS_DE,
        linkers: LINKERS_DE,
        weakHeads: WEAK_HEADS_DE,
        genericModifiers: GENERIC_MODIFIERS_DE,
      },
      months: MONTHS_DE,
      weekdays: WEEKDAYS_DE,
      weekPrefix: 'kw',
      markers: MARKERS_DE,
      units: [],
      versionWords: VERSION_WORDS,
      numberWords: NUMBER_WORDS_DE,
      attr: {
        suffixes: ['iert'],
        lowerSuffixes: ['lich', 'ig', 'isch', 'bar', 'los', 'haft', 'et', 'end', 'er', 'es', 'en', 'em'],
        lowerCaseRule: true,
      },
    })
  }
  return pack
}
