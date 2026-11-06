import { describe, expect, it } from 'vitest'
import { isSluggerError } from '../../src/errors.ts'
import { cfgOf, front, kept } from '../helpers/front.ts'

const base = { code: 'fr', id: 'fr@1', stopWords: ['le', 'la', 'les', 'pour', 'de'], stem: (s: string) => s }

function reason(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    if (isSluggerError(e, 'E_CONFIG')) return (e.details as { reason: string }).reason
    throw e
  }
  return undefined
}

const cfgWith = (pack: object) => () => cfgOf({ languagePacks: [pack as never], languages: ['de', 'en', 'fr'] })

describe('language pack validation (SPEC 6.7)', () => {
  it('accepts a full pack and normalizes its lists', () => {
    const cfg = cfgOf({
      languagePacks: [
        {
          ...base,
          stopWords: ['Le', 'LA', 'pour'],
          conflictWords: ['la'],
          noiseWords: ['Fichier'],
          lexicon: [{ key: 'reunion', cls: 'topic', abbr: ['reu'] }],
          keyFold: (s: string) => s,
          translit: { œ: 'oe' },
          hints: { chars: 'ÉÈ', suffixes: ['tion'], weakSuffixes: ['eux'], digraphs: [] },
          nounsCapitalized: false,
          compound: { parts: ['porte'], linkers: ['', 'e'], weakHeads: ['plan'], genericModifiers: ['grand'] },
          phonology: { codas: ['r'], onsets: ['pr'] },
          months: Array.from({ length: 12 }, (_, i) => [`m${i}`]),
          weekdays: Array.from({ length: 7 }, (_, i) => [`d${i}`]),
          weekPrefix: 'sem',
          markers: [{ words: ['partie'], prefix: 'pt', takes: 'number-or-letter' }],
          units: [['kg', 'kilo']],
          versionWords: ['version'],
          numberWords: [['un', 'premier'], ['deux']],
          attr: { suffixes: ['eux'], lowerSuffixes: ['ee'], lowerCaseRule: false },
        },
      ],
      languages: ['de', 'en', 'fr'],
    })
    const p = cfg.languagePacks[0]
    expect(p?.stopWords).toEqual(['le', 'la', 'pour'])
    expect(p?.noiseWords).toEqual(['fichier'])
    expect(p?.lexicon?.[0]).toMatchObject({ key: 'reunion', lang: 'fr' })
    expect(p?.hints?.chars).toBe('éè')
    expect(Object.isFrozen(p?.compound)).toBe(true)
  })

  it('rejects bad packs', () => {
    expect(reason(cfgWith({ ...base, extra: 1 }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, conflictWords: ['xyz'] }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, stopWords: ['two words'] }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, keyFold: 'x' }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, months: [['a']] }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, weekdays: Array.from({ length: 7 }, () => []) }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, weekPrefix: 'wl' }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, markers: [{ words: ['partie'], prefix: 'pl', takes: 'number' }] }))).toBe(
      'invalid-marker-prefix',
    )
    expect(reason(cfgWith({ ...base, markers: [{ words: ['partie'], prefix: 'pt', takes: 'any' }] }))).toBe(
      'invalid-language-pack',
    )
    expect(reason(cfgWith({ ...base, numberWords: Array.from({ length: 13 }, () => ['x']) }))).toBe(
      'invalid-language-pack',
    )
    expect(reason(cfgWith({ ...base, translit: { ab: 'x' } }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, translit: { é: 'É' } }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, compound: { parts: [], linkers: ['-'] } }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, hints: { chars: 1 } }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, attr: { lowerCaseRule: 'yes' } }))).toBe('invalid-language-pack')
    expect(reason(cfgWith({ ...base, lexicon: [{ key: 'x', cls: 'org' }] }))).toBe('invalid-lexicon')
    expect(reason(cfgWith({ ...base, lexicon: [{ key: 'x', cls: 'topic', lang: 'de' }] }))).toBe('unknown-language')
    expect(reason(cfgWith({ ...base, nounsCapitalized: 1 }))).toBe('invalid-language-pack')
  })
})

describe('a user pack in the pipeline (SPEC 6.7)', () => {
  const fr = {
    ...base,
    conflictWords: ['de'],
    hints: { chars: 'éèêç', suffixes: ['tion', 'eux'] },
    lexicon: [{ key: 'reunion', cls: 'topic' as const, forms: ['reunions'], abbr: ['reu'] }],
    months: [
      ['jan', 'janvier'],
      ['fev', 'fevrier'],
      ['mar', 'mars'],
      ['avr', 'avril'],
      ['mai'],
      ['jui', 'juin'],
      ['jul', 'juillet'],
      ['aou', 'aout'],
      ['sep', 'septembre'],
      ['oct', 'octobre'],
      ['nov', 'novembre'],
      ['dec', 'decembre'],
    ],
    markers: [{ words: ['partie'], prefix: 'pt', takes: 'number-or-letter' as const }],
    numberWords: [
      ['un', 'premier', 'premiere'],
      ['deux', 'deuxieme'],
    ],
    versionWords: ['version'],
    stopWords: [...base.stopWords, 'du', 'des'],
  }
  const cfg = { languagePacks: [fr], languages: ['de', 'en', 'fr'] }

  it('detects the language and uses its stop words, months, markers and lexicon', () => {
    const f = front('Réunion de la direction pour mars 2026', cfg)
    expect(f.lang).toBe('fr')
    expect(kept('Réunion de la direction pour mars 2026', cfg)).toEqual([
      'reunion:topic',
      'direction:topic',
      'm03:month',
      'y2026:year',
    ])
    expect(kept('Partie Deux du rapport', cfg)).toEqual(expect.arrayContaining(['pt2:marker']))
  })

  it('pack conflict words are removed only in titles of the pack language', () => {
    expect(front('Projekt de Luxe Planung für Kunden', cfg).removed.map((r) => r.word)).not.toContain('de')
    expect(front('Rapport de la réunion', cfg).removed).toContainEqual({ word: 'de', list: 'conflict' })
  })
})
