import { describe, expect, it } from 'vitest'
import { compile } from '../../src/core/compile.ts'
import { hasPart, type PartIndex, splitCompound } from '../../src/core/compound.ts'
import { makeStemmer, UND_STEMMER } from '../../src/core/stem.ts'
import { dePack } from '../../src/lang/de.ts'
import { cfgOf } from '../helpers/front.ts'

const idx = compile(cfgOf()).parts.get('de') as PartIndex
const split = (w: string) => splitCompound(w, idx)?.map((p) => `${p.linker}${p.text}`) ?? null

describe('DP split (SPEC 7.2), used by the language hint and the attr rule', () => {
  it('pass 1: known parts with linkers, fewer parts win', () => {
    expect(split('sommerfest')).toEqual(['sommer', 'fest'])
    expect(split('jahresbericht')).toEqual(['jahr', 'esbericht'])
    expect(split('lebensmittellager')).toEqual(['lebensmittel', 'lager'])
    expect(split('apfelkuchen')).toEqual(['apfel', 'kuchen'])
  })

  it('no linker before the first part; inflected heads at the end', () => {
    expect(split('sbahnhof')).toBeNull()
    expect(hasPart(idx, 'fahrzeuge', true)).toBe(false)
    expect(hasPart(idx, 'kindern', true)).toBe(true)
    expect(hasPart(idx, 'kindern', false)).toBe(false)
  })

  it('pass 2: one unknown modifier (5+ chars, with a vowel) before a known head', () => {
    expect(split('xantoplexplan')).toEqual(['xantoplex', 'plan'])
    expect(split('xantoplex')).toBeNull()
    expect(split('brrrrrplan')).toBeNull()
    expect(split('microservices')).toEqual(['micro', 'services'])
  })

  it('known compounds and short words stay whole', () => {
    expect(split('kindergarten')).toBeNull()
    expect(split('haus')).toBeNull()
    expect(split('a'.repeat(80))).toBeNull()
  })
})

describe('stemmer key fold', () => {
  it('exposes the pack key fold, falling back to the input', () => {
    expect(makeStemmer(dePack()).keyFold('muenchen')).toBe('munchen')
    expect(UND_STEMMER.keyFold('muenchen')).toBe('muenchen')
    const bad = makeStemmer({ code: 'xx', id: 'xx@1', stopWords: [], stem: (s) => s, keyFold: () => 'A B' })
    expect(bad.keyFold('word')).toBe('word')
  })
})
