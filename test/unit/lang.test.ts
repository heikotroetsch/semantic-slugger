import { describe, expect, it } from 'vitest'
import { compile } from '../../src/core/compile.ts'
import { digraphHit } from '../../src/core/lang.ts'
import { pluralFold } from '../../src/core/stem.ts'
import type { Tok } from '../../src/core/tokenize.ts'
import { dePack } from '../../src/lang/de.ts'
import { cfgOf, front, kept, tok } from '../helpers/front.ts'

const lang = (title: string, config?: Parameters<typeof front>[1]) => front(title, config).lang

function wordTok(ascii: string): Tok {
  return {
    text: ascii,
    ascii,
    cls: 'word',
    case: 'lower',
    innerCaps: false,
    cap: false,
    translit: false,
    start: 0,
    end: ascii.length,
    lang: 'und',
    next: '',
  }
}

describe('title language (SPEC 6.1)', () => {
  it('German and English titles', () => {
    expect(lang('Jahresbericht Vertrieb Nord 2026')).toBe('de')
    expect(lang('Rezept für Apfelkuchen')).toBe('de')
    expect(lang('Onboarding checklist for new hires')).toBe('en')
    expect(lang('Storm warning for the north coast')).toBe('en')
  })

  it('EN titles without function words and Title Case EN', () => {
    expect(lang('Quarterly Marketing Meeting')).toBe('en')
    expect(lang('Building Scalable Web Applications')).toBe('en')
  })

  it('no hints: und; a tie: defaultLang', () => {
    const f = front('Chocolate Cake Recipe')
    expect(f.lang).toBe('und')
    expect(f.language.source).toBe('heuristic')
    const t = front('Meeting Besprechung')
    expect(t.language.scores).toEqual({ de: 2, en: 2 })
    expect(t.lang).toBe('de')
    expect(t.language.source).toBe('default')
    expect(front('Meeting Besprechung', { defaultLang: 'en' }).lang).toBe('en')
  })

  it('mixed DE/EN titles pick the stronger language', () => {
    expect(lang('Release 2.4 Hinweise zur Migration')).toBe('de')
    expect(lang('Kick-off Meeting for the KI Strategie')).toBe('en')
  })

  it('option and hook', () => {
    expect(front('Chocolate Cake Recipe', undefined, 'en').lang).toBe('en')
    expect(front('Chocolate Cake Recipe', undefined, 'en').language.source).toBe('option')
    const f = front('Chocolate Cake', { detectLanguage: () => 'en' })
    expect(f.lang).toBe('en')
    expect(f.language.source).toBe('hook')
    expect(front('Chocolate Cake', { detectLanguage: () => 'fr' }).language.source).toBe('heuristic')
    expect(() => front('x', undefined, 'fr')).toThrow(/not enabled/)
  })

  it('conflict words give no language score and survive in EN titles', () => {
    expect(lang('Die Casting')).toBe('en')
    expect(kept('Die Casting')).toEqual(['die:topic', 'casting:topic'])
    expect(kept('War Room Notes for the Launch')).toContain('war:topic')
    expect(kept('Brightwave Pro 14 Laptop Review for Students')).toContain('pro:topic')
    expect(kept('Die Ergebnisse der Umfrage')).not.toContain('die:topic')
  })

  it('ASCII-folded German gets de (digraphs, parts hits, compound hint)', () => {
    const a = front('Sommerfest Gaertnerei Muenchen 2026')
    const b = front('Sommerfest Gärtnerei München 2026')
    expect(a.lang).toBe('de')
    expect(b.lang).toBe('de')
    expect(a.language.reasons.some((r) => r.includes('digraph:muenchen'))).toBe(true)
    expect(a.language.reasons.some((r) => r.includes('compound:sommerfest'))).toBe(true)
  })

  it('digraph exclusions: blue, queue, issues, Tuesday, steuer', () => {
    const c = compile(cfgOf())
    const de = dePack()
    for (const w of ['blue', 'queue', 'issues', 'tuesday', 'steuer', 'continued', 'values'])
      expect(digraphHit(wordTok(w), de, c), w).toBe(false)
    for (const w of ['muenchen', 'gaertnerei', 'koeln', 'pruefung']) expect(digraphHit(wordTok(w), de, c), w).toBe(true)
  })

  it('parts hits count from 6 chars; shorter parts give no score', () => {
    const long = front('Zeitung Stadt')
    expect(long.language.reasons.some((r) => r.includes('lex:zeitung'))).toBe(true)
    expect(long.language.reasons.some((r) => r.includes('lex:stadt'))).toBe(false)
    expect(lang('See Bad Tag')).toBe('und')
  })

  it('the compound hint counts from 8 chars', () => {
    expect(lang('Sommerfest')).toBe('de')
    expect(front('Apfelbaum').language.reasons).toContain('de+1 compound:apfelbaum')
  })

  it('a user pack wins detection with its hints', () => {
    const fr = {
      code: 'fr',
      id: 'fr@1',
      stopWords: ['le', 'la', 'les', 'de', 'du', 'pour'],
      stem: (s: string) => s,
      hints: { chars: 'éèê', suffixes: ['tion', 'eux'] },
    }
    const cfg = { languagePacks: [fr], languages: ['de', 'en', 'fr'] }
    expect(lang('Le rapport annuel pour la société', cfg)).toBe('fr')
    expect(tok('Le rapport annuel pour la société', 'societe', cfg)?.lang).toBe('fr')
  })
})

describe('per-token language (SPEC 6.1)', () => {
  it('translit tokens and titles without Latin letters are und; Cyrillic is never split', () => {
    const f = front('Договор поставки 2026')
    expect(f.tokens.every((t) => t.lang === 'und')).toBe(true)
    expect(f.tokens.find((t) => t.ascii === 'postavki')?.parts).toBeUndefined()
  })

  it('lexicon language, then pack chars or suffixes, then the detected title language', () => {
    expect(tok('Kick-off Meeting KI Strategie Q1 2026', 'meeting')?.lang).toBe('en')
    expect(tok('Kick-off Meeting KI Strategie Q1 2026', 'ki')?.lang).toBe('de')
    expect(tok('Chocolate Cake Recipe for Übung', 'uebung')?.lang).toBe('de')
    expect(tok('Building Scalable Web Applications', 'building')?.lang).toBe('en')
    expect(tok('Meeting Besprechung Xyz', 'xyz')?.lang).toBe('und')
  })

  it('a step-0 abbreviation with entries in two languages takes the title language (`PR`)', () => {
    expect(tok('PR Review for the Release', 'pr')?.lex?.key).toBe('pull request')
    expect(tok('PR Abstimmung für den Verein', 'pr')?.lex?.key).toBe('oeffentlichkeitsarbeit')
  })
})

describe('und plural fold (SPEC 8.2)', () => {
  it('removes one final s from 4+ chars, not after ss, us, is, os', () => {
    expect(pluralFold('recipes')).toBe('recipe')
    expect(pluralFold('registers')).toBe('register')
    for (const w of ['bus', 'status', 'analysis', 'chaos', 'class', 'gas']) expect(pluralFold(w)).toBe(w)
  })
})

describe('verifier round 1 (M2): detection', () => {
  it('a shared abbreviation and an upper-case upperOnly word give no language score', () => {
    expect(lang('PR #812: Fix pagination bug')).toBe('en')
    expect(kept('PR #812: Fix pagination bug')).toEqual(expect.arrayContaining(['pagination:topic', 'bug:topic']))
    expect(front('PR Review Checklist').tokens.find((t) => t.ascii === 'pr')?.lex?.key).toBe('pull request')
    expect(lang('HR Policy Update: Remote Work')).not.toBe('de')
    expect(lang('Risikoanalyse Rollout CRM')).not.toBe('en')
    expect(lang('IT Projekt')).toBe('de')
    expect(lang('US Markt Analyse')).not.toBe('en')
  })

  it('the compound hint counts only splits into known parts, not typed hyphens', () => {
    expect(lang('Syllabus: World History 101')).not.toBe('de')
    expect(lang('quarterly-report_Q3-2026')).not.toBe('de')
  })

  it('conflict words stay in und titles (bare spec titles, 6.3, 19.1)', () => {
    expect(kept('Brightwave Pro 14')).toEqual(['brightwave:topic', 'pro:topic', 'd14:model'])
    expect(kept('War Room')).toEqual(['war:topic', 'room:topic'])
    expect(kept('Die Casting')).toEqual(['die:topic', 'casting:topic'])
    expect(kept('Tavora Phone 8 Pro 256 GB Silver')).toContain('pro:topic')
  })

  it('stem lookup picks the word the token starts with (4.4 step 3)', () => {
    const lex = (t: string, a: string) => front(t).tokens.find((x) => x.ascii === a)?.lex?.key
    expect(lex('Neue Rechnern im Büro', 'rechnern')).toBe('rechner')
    expect(lex('Rezept des Kuchens', 'kuchens')).toBe('kuchen')
    expect(lex('Neue Küchen planen', 'kuechen')).toBe('kueche')
    expect(lex('Druck der Broschüre', 'druck')).toBeUndefined()
    expect(lex('Häuser am See', 'haeuser')).toBe('haus')
  })
})
