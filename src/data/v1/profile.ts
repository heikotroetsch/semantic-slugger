/**
 * The v1 data profile (SPEC 14.2 item 4): every export of the v1 data modules and the built-in
 * language packs (functions recorded as "fn"). `V1_DATA_DIGEST` is the hex SipHash of its canonical
 * JSON; a test recomputes it, so any data edit fails CI until the digest is updated on purpose
 * (`pnpm digest`).
 */

import { canonicalJson } from '../../config.ts'
import { utf8 } from '../../hash/encode.ts'
import { siphash, u64hex } from '../../hash/siphash.ts'
import { dePack } from '../../lang/de.ts'
import { enPack } from '../../lang/en.ts'
import * as blocklist from './blocklist.ts'
import * as conflict from './conflict.ts'
import * as constants from './constants.ts'
import * as dockind from './dockind.ts'
import * as legal from './legal.ts'
import * as lexiconDe from './lexicon-de.ts'
import * as lexiconEn from './lexicon-en.ts'
import * as lexiconShared from './lexicon-shared.ts'
import * as markers from './markers.ts'
import * as months from './months.ts'
import * as noise from './noise.ts'
import * as numberWords from './number-words.ts'
import * as parts from './parts-de.ts'
import * as phonology from './phonology.ts'
import * as qualifiers from './qualifiers.ts'
import * as reserved from './reserved.ts'
import * as stopDe from './stop-de.ts'
import * as stopEn from './stop-en.ts'
import * as translit from './translit.ts'
import * as units from './units.ts'
import * as versions from './versions.ts'
import * as weak from './weak.ts'
import * as weekdays from './weekdays.ts'

/** The v1 profile object. */
export function v1Profile(): Record<string, unknown> {
  return {
    blocklist,
    conflict,
    constants,
    dockind,
    legal,
    lexiconDe,
    lexiconEn,
    lexiconShared,
    markers,
    months,
    noise,
    numberWords,
    parts,
    phonology,
    qualifiers,
    reserved,
    stopDe,
    stopEn,
    translit,
    units,
    versions,
    weak,
    weekdays,
    packs: { de: dePack(), en: enPack() },
  }
}

/** Hex SipHash (key `K_V1`) of the canonical JSON of the v1 profile. */
export function computeV1Digest(): string {
  return u64hex(siphash(utf8(constants.K_V1_TEXT), utf8(canonicalJson(v1Profile()))))
}
