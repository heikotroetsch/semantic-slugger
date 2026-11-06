import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeStemmer, UND_STEMMER } from '../../src/core/stem.ts'
import { deKeyFold, dePack } from '../../src/lang/de.ts'
import { enPack } from '../../src/lang/en.ts'
import { cistem } from '../../src/vendor/cistem.ts'
import { porter2 } from '../../src/vendor/porter2.ts'

describe('CISTEM (SPEC 8.2)', () => {
  it('reference pairs from the NLTK tests (case sensitive and case insensitive)', () => {
    expect(cistem('Speicherbehältern')).toBe('speicherbehalt')
    expect(cistem('Grenzpostens')).toBe('grenzpost')
    expect(cistem('Ausgefeiltere')).toBe('ausgefeilt')
    expect(cistem('Speicherbehältern', true)).toBe('speicherbehal')
    expect(cistem('Grenzpostens', true)).toBe('grenzpo')
    expect(cistem('Ausgefeiltere', true)).toBe('ausgefeil')
  })

  it('more pairs from the algorithm (ge- prefix, sch/ei/ie, doubled letters)', () => {
    expect(cistem('gegessen', true)).toBe('gess')
    expect(cistem('schiffe', true)).toBe('schiff')
    expect(cistem('kinder', true)).toBe('kind')
    expect(cistem('', true)).toBe('')
  })
})

describe('Porter2 (SPEC 8.2)', () => {
  it('matches the Snowball voc/output sample (500 words)', () => {
    const data = JSON.parse(readFileSync(new URL('../fixtures/porter2-sample.json', import.meta.url), 'utf8')) as {
      pairs: [string, string][]
    }
    expect(data.pairs.length).toBe(500)
    const bad = data.pairs.filter(([w, s]) => porter2(w) !== s)
    expect(bad).toEqual([])
  })

  it('a few classic pairs', () => {
    expect(porter2('generously')).toBe('generous')
    expect(porter2('meetings')).toBe('meet')
    expect(porter2('recipes')).toBe('recip')
  })
})

describe('key fold and pack stemmers (SPEC 4.4, 6.7)', () => {
  it('keyFold folds umlauts and digraphs except after a vowel or q', () => {
    expect(deKeyFold('kindergärten')).toBe('kindergarten')
    expect(deKeyFold('muenchen')).toBe('munchen')
    expect(deKeyFold('straße')).toBe('strasse')
    for (const w of ['steuer', 'feuer', 'quelle', 'neue']) expect(deKeyFold(w)).toBe(w)
  })

  it('de stems keyFold(ascii) with CISTEM; umlaut and ascii forms agree', () => {
    const de = makeStemmer(dePack())
    expect(de.stem('besprechungen')).toBe(de.stem('besprechung'))
    expect(de.stem('umzuege')).toBe(de.stem('umzug'))
    expect(de.stem('kaesten')).toBe(de.stem('kasten'))
  })

  it('en stems with Porter2; und uses the plural fold', () => {
    expect(makeStemmer(enPack()).stem('meetings')).toBe('meet')
    expect(UND_STEMMER.stem('recipes')).toBe('recipe')
  })

  it('pack stem output that is not [a-z0-9]+ falls back to the ascii input', () => {
    const st = makeStemmer({ code: 'xx', id: 'xx@1', stopWords: [], stem: (s) => (s === 'abc' ? 'A-B' : `${s}!`) })
    expect(st.stem('abc')).toBe('abc')
    expect(st.stem('word')).toBe('word')
    const ok = makeStemmer({ code: 'xx', id: 'xx@1', stopWords: [], stem: (s) => s.slice(0, 3), keyFold: () => '' })
    expect(ok.stem('words')).toBe('wor')
  })

  it('a pack stemmer is called once per word', () => {
    let calls = 0
    const st = makeStemmer({
      code: 'xx',
      id: 'xx@1',
      stopWords: [],
      stem: (s) => {
        calls++
        return s
      },
    })
    st.stem('a1')
    st.stem('a1')
    expect(calls).toBe(1)
  })
})
