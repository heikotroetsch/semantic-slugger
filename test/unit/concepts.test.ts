import { describe, expect, it } from 'vitest'
import { conceptDf, isIn } from '../../src/core/concepts.ts'
import { keyFor } from '../../src/core/tail.ts'
import { HASH_FIELD_SEP } from '../../src/data/v1/constants.ts'
import { utf8 } from '../../src/hash/encode.ts'
import { siphash, u64hex } from '../../src/hash/siphash.ts'
import { concept, concepts, doc, shapes } from '../helpers/concepts.ts'
import { cfgOf } from '../helpers/front.ts'

const stems = (t: string, config?: Parameters<typeof doc>[1]) => [...doc(t, config).storedStems]
const SECRET = 'concepts-test-secret-0123'

describe('concepts (SPEC 8.1)', () => {
  it('concepts with the same key merge: tf adds up, pos is the first', () => {
    const c = concept('Q1 2026 und Q2 2026', 'y2026')
    expect(c?.tf).toBe(2)
    expect(c?.pos).toBe(1)
    expect(c?.occurrences).toEqual([['y2026'], ['y2026']])
  })

  it('a lexicon group merges synonyms', () => {
    const c = concept('Technik und Technology Trends', 'tech')
    expect(c?.tf).toBe(2)
    expect(c?.verbatim).toEqual(['technik', 'technology'])
    expect(c?.occurrences).toHaveLength(2)
  })

  it('lexicon words use the key or group, other words their stem, numbers their key', () => {
    expect(shapes('Newsletter März 2026')).toEqual(['newsletter:topic', 'm03:month', 'y2026:year'])
    expect(concept('Release v2.4 notes', 'v2.4')?.cls).toBe('version')
    expect(concept('#4521 Login Fehler', 'nr4521')?.cls).toBe('marker')
    expect(concept('SKU A-4471 128 GB', 'q128gb')?.cls).toBe('quantity')
    expect(concept('Order 1000012345', 'n1000012345')?.cls).toBe('longnum')
    expect(concept('Team Lunch Friday', 'wd5')?.cls).toBe('weekday')
  })

  it('phrases are one concept with the stems of each word', () => {
    const c = concept('Machine Learning Basics', 'machine learning')
    expect(c?.stemKeys).toEqual(['learn', 'machin'])
    expect(c?.verbatim).toEqual(['machinelearning'])
  })

  it('topic-to-marker merge (SPEC 5.3): as text and as a compound part', () => {
    expect(shapes('Sprintplanung Sprint 22')).toEqual(['sprint22:marker'])
    const c = concept('Sprintplanung Sprint 22', 'sprint22')
    expect(c?.tf).toBe(2)
    expect(c?.verbatim).toEqual(['sprint22', 'sprint'])
    expect(shapes('Sprint 22 Sprints')).toEqual(['sprint22:marker'])
    // the marker word without a number is a topic, nothing to merge
    expect(shapes('Sprint Review')).toEqual(['sprint:topic', 'review:topic'])
  })

  it('bonds: quarter and month with the first year, a model number with its word', () => {
    expect(concept('Q3 2026 Marketing Budget Review', 'q3')?.bond).toEqual({ with: 'y2026', kind: 'year' })
    expect(concept('Board Minutes March 2026', 'm03')?.bond).toEqual({ with: 'y2026', kind: 'year' })
    expect(concept('Board Minutes March', 'm03')?.bond).toBeUndefined()
    expect(concept('Tavora Phone 8 Review', 'd8')?.bond).toEqual({ with: 'phone', kind: 'word' })
    // a historic year has no 2-digit form: no bond
    expect(concept('Paris March 1889', 'm03')?.bond).toBeUndefined()
  })

  it('concepts come out in title order with integer positions', () => {
    const cs = concepts('Sommerfest Kindergarten Nordstadt Programm 2026')
    const pos = cs.map((c) => c.pos)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(cs.every((c) => Number.isInteger(c.pos) && c.score === 0)).toBe(true)
  })
})

describe('stored stems (SPEC 8.2)', () => {
  it('stems of surviving words and compound parts, plus number keys; sorted and unique', () => {
    expect(stems('Jahresbericht Vertrieb Nord 2026')).toEqual([
      'berich',
      'jahr',
      'jahresberich',
      'nord',
      'vertrieb',
      'y2026',
    ])
    const s = stems('Sommerfest Kindergarten Nordstadt Programm 2026')
    expect(s).toEqual([...new Set(s)].sort())
    expect(s).toContain('somm')
    expect(s).toContain('fes')
  })

  it('weak, attr, name and acronym words are stored; function, noise, legal and deny tokens are not', () => {
    const s = stems('Acme GmbH Jahresbericht für die Abteilung 2026')
    expect(s).toContain('acm')
    expect(s).toContain('jahresberich')
    expect(s.some((x) => x.startsWith('gmbh'))).toBe(false)
    expect(s).not.toContain('fur')
    expect(s).not.toContain('die')
    expect(stems('Datei Vertrieb PDF')).not.toContain('pdf')
    const d = stems('Gespräch mit Anna Weber 2026', { denyTokens: ['anna weber'] })
    expect(d.some((x) => x.startsWith('anna') || x.startsWith('web'))).toBe(false)
  })

  it('a restored noise word is stored', () => {
    expect(stems('Für die Datei')).toEqual(['datei'])
  })

  it('und tokens use the plural fold: plural near-duplicates share stems', () => {
    expect(doc('Chocolate Cake Recipes').front.lang).toBe('und')
    expect(stems('Chocolate Cake Recipes')).toEqual(stems('Chocolate Cake Recipe'))
    expect(stems('Bus Status Analysis')).toEqual(['analysis', 'bus', 'status'])
  })

  it('do not depend on lexicon keys or groups', () => {
    const plain = stems('Technik und Technology Trends')
    expect(plain).not.toContain('tech')
    const lexicon = [{ key: 'trends', cls: 'topic' as const, abbr: ['trd'], group: 'trend-group' }]
    expect(stems('Technik und Technology Trends', { lexicon })).toEqual(plain)
    // phrase entries store the stems of each word, never the key
    expect(stems('Machine Learning Basics')).toEqual(['basic', 'learn', 'machin'])
  })

  it('hashed stems: 16 hex chars of SipHash(K, "stem" + sep + s), applied once', () => {
    const cfg = { storeStems: 'hashed' as const, secret: SECRET }
    const plain = stems('Jahresbericht Vertrieb Nord 2026')
    const hashed = stems('Jahresbericht Vertrieb Nord 2026', cfg)
    const key = keyFor(cfgOf(cfg))
    const expected = plain.map((s) => u64hex(siphash(key, utf8(`stem${HASH_FIELD_SEP}${s}`)))).sort()
    expect(hashed).toEqual(expected)
    expect(hashed.every((h) => /^[0-9a-f]{16}$/.test(h))).toBe(true)
    const c = concept('Jahresbericht Vertrieb Nord 2026', 'vertrieb', cfg)
    expect(c?.stemKeys).toEqual(['vertrieb'])
    expect(c?.storedKeys).toEqual([u64hex(siphash(key, utf8(`stem${HASH_FIELD_SEP}vertrieb`)))])
    expect(c?.storedOcc).toEqual([c?.storedKeys])
  })
})

describe('df and the "in" rule (SPEC 8.2)', () => {
  it('df is the min over the stems of an occurrence, the max over occurrences', () => {
    const c = concept('Apfelkuchen Rezept', 'apfel+kuch', undefined, 'de')
    if (c === undefined) throw new Error('no concept')
    expect(c.storedOcc).toEqual([['apfel', 'kuch']])
    expect(
      conceptDf(
        c,
        new Map([
          ['apfel', 3],
          ['kuch', 40],
        ]),
      ),
    ).toBe(3)
    expect(conceptDf(c, new Map([['kuch', 40]]))).toBe(0)
    const t = concept('Technik und Technology Trends', 'tech')
    if (t === undefined) throw new Error('no concept')
    expect(
      conceptDf(
        t,
        new Map([
          ['technik', 2],
          ['technolog', 9],
        ]),
      ),
    ).toBe(9)
  })

  it('a concept is in a row when all stems of one occurrence are in it', () => {
    const c = concept('Apfelkuchen Rezept', 'apfel+kuch', undefined, 'de')
    if (c === undefined) throw new Error('no concept')
    expect(isIn(c, new Set(['apfel', 'kuch', 'rezep']))).toBe(true)
    expect(isIn(c, new Set(['kuch', 'rezep']))).toBe(false)
    const t = concept('Technik und Technology Trends', 'tech')
    if (t === undefined) throw new Error('no concept')
    expect(isIn(t, new Set(['technolog']))).toBe(true)
  })
})
