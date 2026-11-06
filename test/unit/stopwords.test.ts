import { describe, expect, it } from 'vitest'
import { front, kept } from '../helpers/front.ts'

const removed = (title: string, config?: Parameters<typeof front>[1]) => front(title, config).removed

describe('stop word tiers (SPEC 6.3)', () => {
  it('function words of every enabled language are removed', () => {
    expect(kept('Rezept für einen Apfelkuchen mit Zimt')).toEqual(['rezept:topic', 'apfelkuchen:topic', 'zimt:topic'])
    expect(kept('Effects of Sleep on Memory')).toEqual(['effects:topic', 'sleep:topic', 'memory:topic'])
    expect(removed('Plan für the Team')).toEqual(
      expect.arrayContaining([
        { word: 'fuer', list: 'function' },
        { word: 'the', list: 'function' },
      ]),
    )
  })

  it('pronouns and contraction stems (rev 3.1)', () => {
    expect(kept('Mein erstes Jahr als Freelancerin in Leipzig')).toEqual([
      'jahr:topic',
      'freelancerin:topic',
      'leipzig:topic',
    ])
    expect(kept('Cannot reset password')).toEqual(['reset:topic', 'password:topic'])
    expect(kept('Best Ever Banana Bread')).toEqual(['best:topic', 'banana:topic', 'bread:topic'])
    expect(kept("Why the Build Doesn't Start")).toEqual(['build:topic', 'start:topic'])
  })

  it('conflict words are removed only in titles of their language', () => {
    expect(removed('Die Ergebnisse der Umfrage')).toContainEqual({ word: 'die', list: 'conflict' })
    expect(kept('Die Casting')).toContain('die:topic')
    expect(kept('So geht es weiter')).not.toContain('so:topic')
  })

  it('noise words', () => {
    expect(kept('Kopie Anhang Vertrag pdf')).toEqual(['vertrag:topic'])
    expect(removed('Fwd: Budget Review')).toContainEqual({ word: 'fwd', list: 'noise' })
  })

  it('person titles are dropped without the next token; upper case keeps them', () => {
    expect(kept('Termin Dr. Weber')).toEqual(['termin:topic', 'weber:topic'])
    expect(kept('Call with Mr. Smith about pricing')).toContain('smith:name')
    expect(kept('MS Teams Rollout')).toContain('ms:acronym')
  })

  it('upper-case US and IT reach the lexicon, lower case us and it are stop words', () => {
    expect(kept('IT Security Audit')).toContain('it:topic')
    expect(kept('US Market Entry')).toContain('us:region')
    expect(kept('let us check it')).toEqual(['let:topic', 'check:topic'])
  })

  it('stopWords add, remove and function forms', () => {
    expect(kept('Plan Foo Bar', { stopWords: { add: ['foo'] } })).toEqual(['plan:topic~weak', 'bar:topic'])
    expect(removed('Plan Foo', { stopWords: { add: ['foo'] } })).toContainEqual({ word: 'foo', list: 'custom' })
    expect(kept('Fragen über das Wetter', { stopWords: { remove: ['ueber'] } })).toContain('ueber:attr')
    expect(kept('Report about the Weather', { stopWords: (d) => d.filter((w) => w !== 'about') })).toContain(
      'about:topic',
    )
    expect(kept('Die Casting', { stopWords: (d) => d })).toContain('die:topic')
  })
})

describe('legal forms (SPEC 6.3)', () => {
  it('always and multi-token forms', () => {
    expect(kept('Isarwerk GmbH Jahresabschluss')).toEqual(['isarwerk:name', 'jahresabschluss:topic'])
    expect(kept('Bergmann GmbH & Co. KG Vertrag')).toEqual(['bergmann:name', 'vertrag:topic'])
    expect(kept('Sportverein e.V. Satzung')).toEqual(['sportverein:name', 'satzung:topic'])
  })

  it('ambiguous forms only in upper case or dotted, at the end or before punctuation, co, a form or a year', () => {
    expect(kept('Acme AG')).toEqual(['acme:name'])
    expect(kept('Acme AG, Zürich')).toEqual(expect.arrayContaining(['acme:name']))
    expect(kept('Acme S.A. 2026')).toEqual(['acme:name', 'y2026:year'])
    expect(kept('Limited Edition Sneaker')).toContain('limited:attr')
    expect(kept('Spa Weekend in Bavaria')).toContain('spa:topic')
    expect(kept('Acme Limited')).toEqual(['acme:name'])
    expect(removed('Urlaub ag Plan').map((r) => r.word)).not.toContain('ag')
  })

  it('only legal forms: empty', () => {
    expect(front('GmbH AG Inc Ltd').empty).toBe(true)
  })
})

describe('weak words (SPEC 6.3, 15.6)', () => {
  it('weak words are marked, not removed', () => {
    expect(kept('Projekt Update Website')).toEqual(['projekt:topic~weak', 'update:topic~weak', 'website:topic'])
    expect(front('Projekt Update Website').weak).toEqual(['projekt', 'update'])
  })

  it('doc-kind words are not weak and keep weight -60', () => {
    const t = front('Checkliste Umzug').tokens[0]
    expect(t?.weak).toBeUndefined()
    expect(t?.lex?.weight).toBe(-60)
  })

  it('a user entry with the same key replaces the weak entry', () => {
    expect(kept('Team Offsite', { lexicon: [{ key: 'team', lang: '*', cls: 'topic' }] })).toEqual([
      'team:topic',
      'offsite:topic',
    ])
  })
})

describe('attr words (SPEC 6.4)', () => {
  it('DE suffixes in lower case, -iert in any case; nouns and names are not attr', () => {
    expect(kept('Rechnung falsch berechnet')).toEqual(['rechnung:topic', 'falsch:attr', 'berechnet:attr'])
    expect(kept('Ablauf Optimiert für Kunden')).toContain('optimiert:attr')
    expect(kept('Wirtschaft und Partnerschaft in Leipzig')).toEqual([
      'wirtschaft:topic',
      'partnerschaft:topic',
      'leipzig:topic',
    ])
    expect(kept('Ausflug nach Venedig')).toContain('venedig:topic')
    expect(kept('Ergonomische Stühle')).toContain('ergonomische:topic')
  })

  it('DE lower case: a lower-case token not at title start', () => {
    expect(kept('Tasse rot für das Büro')).toEqual(['tasse:topic', 'rot:attr', 'buero:topic'])
  })

  it('compounds with a known head are not checked', () => {
    expect(kept('Netzwerk Kindergarten')).toEqual(['netzwerk:topic', 'kindergarten:topic'])
  })

  it('EN suffixes', () => {
    expect(kept('Ten Houseplants That Survive Any Office')).toContain('survive:attr')
    expect(kept('Quickly Delivered Gifts for Everyone')).toEqual(
      expect.arrayContaining(['quickly:attr', 'delivered:attr']),
    )
  })
})

describe('back-off (SPEC 6.5)', () => {
  it('nothing, only function words, only noise tokens: empty', () => {
    for (const t of ['', '   \t ', '​', 'der die das', 'und oder für mit von der', 'the and of', '!!! ...', 'a b c']) {
      const f = front(t)
      expect(f.empty, t).toBe(true)
      expect(f.warnings, t).toContain('empty')
    }
  })

  it('only noise words: the first noise word comes back as a topic', () => {
    const f = front('Datei.pdf')
    expect(f.backoff).toBe('noise')
    expect(f.warnings).toContain('stopwords-relaxed')
    expect(kept('Datei.pdf')).toEqual(['datei:topic'])
  })

  it('only weak words: they come back as normal words, numbers stay', () => {
    expect(kept('Neue Projekte 2026')).toEqual(['neue:topic', 'projekte:topic', 'y2026:year'])
    expect(front('Neue Projekte 2026').backoff).toBe('weak')
    expect(kept('new')).toEqual(['new:topic'])
  })

  it('only numbers or markers: nothing here', () => {
    const f = front('Teil 1 Teil 2 Teil 3')
    expect(f.empty).toBe(false)
    expect(f.backoff).toBeUndefined()
    expect(front('2026').empty).toBe(false)
  })
})
