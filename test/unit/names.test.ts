import { describe, expect, it } from 'vitest'
import { front, kept, tok } from '../helpers/front.ts'

const signal = (title: string, ascii: string, config?: Parameters<typeof front>[1]) => tok(title, ascii, config)?.signal

describe('name signals (SPEC 6.6)', () => {
  it('inner capitals', () => {
    expect(signal('iPhone Reparatur', 'iphone')).toBe('inner-caps')
    expect(signal('GitHub Actions Setup', 'github')).toBe('inner-caps')
    expect(signal('Migration auf PostgreSQL', 'postgresql')).toBe('inner-caps')
  })

  it('a capitalized token directly before a legal form', () => {
    expect(signal('Vertrag mit Acme Inc', 'acme')).toBe('legal-form')
    expect(signal('Bluefin Ltd Annual Report', 'bluefin')).toBe('legal-form')
    expect(signal('Rechnung Isarwerk GmbH', 'isarwerk')).toBe('legal-form')
    expect(signal('Rechnung Nord Isarwerk GmbH', 'nord')).toBeUndefined()
  })

  it('sentence case in en and und titles', () => {
    expect(signal('Onboarding checklist for Acme', 'acme')).toBe('sentence-case')
    expect(signal('Trip report from Lisbon', 'lisbon')).toBe('sentence-case')
    expect(signal('Trip report from Lisbon', 'trip')).toBeUndefined()
  })

  it('no sentence-case signal in Title Case EN, in de titles, or for months and weekdays', () => {
    expect(front('Trip Report From Lisbon').names).toEqual([])
    expect(signal('Befund und Bericht für Kassel', 'kassel')).toBeUndefined()
    expect(kept('Befund und Bericht für Kassel')).toContain('kassel:topic')
    expect(signal('Lunch planned for Friday', 'friday')).toBeUndefined()
    expect(signal('Newsletter planned for August', 'august')).toBeUndefined()
  })

  it('lexicon entries with cls name', () => {
    const cfg = {
      lexicon: [{ key: 'kubernetes', lang: '*' as const, cls: 'name' as const, abbr: ['k8s'], known: ['k8s'] }],
    }
    expect(signal('Kubernetes Upgrade Plan', 'kubernetes', cfg)).toBe('lexicon')
    expect(kept('Kubernetes Upgrade Plan', cfg)).toContain('kubernetes:name')
  })
})

describe('acronyms (SPEC 6.6)', () => {
  it('2 to 6 upper-case letters in a title that is not all caps', () => {
    expect(kept('NASA RAM SSD Studie')).toEqual(['nasa:acronym', 'ram:acronym', 'ssd:acronym', 'studie:topic'])
    expect(kept('AGB Version 3.1')).toEqual(['agb:acronym', 'v3.1:version'])
    expect(kept('Auftragsverarbeitung nach Art. 28 DSGVO')).toContain('dsgvo:acronym')
    expect(kept('MRT Knie links')).toEqual(['mrt:acronym', 'knie:topic', 'links:direction'])
  })

  it('not in an all-caps title, not Q1, II or 2 PM', () => {
    expect(kept('NASA MISSION PLAN')).not.toContain('nasa:acronym')
    expect(kept('Q1 Review')).toContain('q1:quarter')
    expect(kept('Ludwig II')).toEqual(['ludwig:topic'])
    expect(kept('Party 2 PM')).toEqual(['party:topic'])
  })

  it('a known abbreviation typed in capitals maps to its entry (lookup step 0)', () => {
    expect(tok('SEO Keyword Research', 'seo')?.lex?.key).toBe('search engine optimization')
    expect(tok('SEO Keyword Research', 'seo')?.role).toBe('topic')
    expect(tok('HR Jahresplanung', 'hr')?.lex?.group).toBe('hr')
    expect(tok('KPIs for the Sales Team', 'kpis')?.lex?.key).toBe('key performance indicator')
    expect(tok('PR Review for the Release', 'pr')?.lex?.key).toBe('pull request')
    expect(tok('PR Arbeit für den Verein', 'pr')?.lex?.key).toBe('oeffentlichkeitsarbeit')
  })

  it('upperOnly and lowerOnly entries', () => {
    expect(kept('EU Förderung')).toContain('eu:region')
    expect(kept('Projekt DACH Vertrieb')).toContain('dach:region')
    expect(kept('Dach Reparatur')).toContain('dach:topic')
    expect(kept('Nützliche Links')).not.toContain('links:direction')
    expect(kept('MRT Knie links')).toContain('links:direction')
  })

  it('no stem lookup for directions (`Rights` stays a word)', () => {
    expect(tok('Human Rights Report for the Board', 'rights')?.lex).toBeUndefined()
  })

  it('stem lookup finds inflected forms of 5+ chars', () => {
    expect(tok('Umzüge Planen für Familien', 'umzuege')?.lex?.key).toBe('umzug')
  })

  it('the stem match takes inflected forms only, not derived words (4.4 step 2, DEVIATIONS)', () => {
    expect(tok('Besprechungen Team', 'besprechungen')?.lex?.key).toBe('besprechung')
    expect(tok('Häuser Verkauf', 'haeuser')?.lex?.key).toBe('haus')
    expect(tok('Rechnern Update', 'rechnern')?.lex?.key).toBe('rechner')
    const falseFriends: [string, string][] = [
      ['Market Analysis', 'market'],
      ['Applicable Law', 'applicable'],
      ['Customs Declaration', 'customs'],
      ['Operational Excellence', 'operational'],
      ['Informal Learning', 'informal'],
      ['Generally Accepted Principles', 'generally'],
      ['Finally Done', 'finally'],
      ['Product Launch Plan', 'product'],
    ]
    for (const [title, word] of falseFriends) expect(tok(title, word)?.lex, title).toBeUndefined()
    expect(tok('Besprechungen der Woche', 'besprechungen')?.lex?.key).toBe('besprechung')
    expect(tok('Häuser in der Stadt', 'haeuser')?.lex?.key).toBe('haus')
  })
})

describe('model numbers after names and acronyms (SPEC 5.1 step 4c)', () => {
  it('after a name or acronym also in de titles', () => {
    expect(kept('Reparatur iPhone 15 für Kunden')).toContain('d15:model')
    expect(kept('Upgrade auf RAM 16 für den Server')).toContain('d16:model')
  })

  it('a decimal after a model position is a version', () => {
    expect(kept('Upgrade to Python 3.12 for the Backend')).toContain('v3.12:version')
  })
})

describe('leak notes (SPEC 6.6)', () => {
  it('names in de titles stay plain topics (Q12)', () => {
    expect(kept('Mitarbeitergespräch Anna Weber 2026')).toEqual([
      'mitarbeitergespraech:topic',
      'anna:topic',
      'weber:topic',
      'y2026:year',
    ])
  })
})

describe('verifier round 1 (M2)', () => {
  it('hyphenated Title Case words are no names; inner caps still are', () => {
    for (const w of ['Edelstahl-Wasserkocher Test', 'Gluten-Free Cookies', 'Team-Meeting Notes', 'Wi-Fi Setup'])
      expect(front(w).names).toEqual([])
    expect(signal('GitHub Actions', 'github')).toBe('inner-caps')
  })

  it('an inner-caps word at title start does not break Title Case', () => {
    expect(kept('iPhone 15 Case Review')).toEqual(['iphone:name', 'd15:model', 'case:topic', 'review:topic'])
    expect(front('iPad Air Case Review').names.map((n) => n.word)).toEqual(['ipad'])
    expect(front('eBay Seller Guide').names.map((n) => n.word)).toEqual(['ebay'])
  })

  it('a word after a colon starts a new sentence', () => {
    expect(signal('PR #812: Fix pagination bug', 'fix')).toBeUndefined()
  })

  it('punctuation breaks the model link (5.1 step 4c)', () => {
    expect(kept('Organic Green Tea, 100 Bags').filter((k) => k.endsWith(':model'))).toEqual([])
    expect(kept('Syllabus: World History 101')).toContain('d101:model')
  })

  it('EN attr exceptions: common nouns with `-ly` are topics', () => {
    expect(kept('Family Trip Planning')).toContain('family:topic')
    expect(kept('Electricity Supply Contract 2026')).toContain('supply:topic')
    expect(kept('a quickly written note', undefined, 'en')).toContain('quickly:attr')
  })
})
