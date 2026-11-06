import { describe, expect, it } from 'vitest'
import type { ConceptX } from '../../src/core/concepts.ts'
import {
  CLASS_WEIGHT,
  classWeight,
  DIFF_BOOST,
  ilog2q8,
  PRIOR,
  prior,
  RARITY_NUMBER,
  rankConcepts,
  rankOrder,
  rarity,
  WEAK_POOL_SCORE,
} from '../../src/core/rank.ts'
import { concept, doc, ranked } from '../helpers/concepts.ts'
import { cfgOf } from '../helpers/front.ts'

const row = (t: string, key: string, ...rest: Parameters<typeof ranked> extends [string, ...infer R] ? R : never) =>
  ranked(t, ...rest).rows.find((r) => r.key === key)
const store = { rarity: 'store' as const }

describe('ilog2q8 (SPEC 10.2)', () => {
  it('is within 23 units of 256 * log2(x) for 1..1e6 and monotonic', () => {
    let prev = -1
    let worst = 0
    for (let x = 1; x <= 1_000_000; x++) {
      const v = ilog2q8(x)
      expect(Number.isInteger(v)).toBe(true)
      if (v < prev) throw new Error(`not monotonic at ${x}`)
      prev = v
      worst = Math.max(worst, Math.abs(v - 256 * Math.log2(x)))
    }
    expect(worst).toBeLessThanOrEqual(23)
  })

  it('clamps its input', () => {
    expect(ilog2q8(0)).toBe(0)
    expect(ilog2q8(-5)).toBe(0)
    expect(ilog2q8(1.9)).toBe(0)
    expect(ilog2q8(2 ** 40)).toBe(ilog2q8(0x7fffffff))
  })
})

describe('rarity (SPEC 10.2)', () => {
  const lexCommon = { cls: 'topic', lex: { key: 'x', cls: 'topic', prior: 'common' } } as const
  const unknown = { cls: 'topic' } as const

  it('priors: lexicon prior, proper for names, unknown otherwise', () => {
    expect(prior(lexCommon)).toBe(PRIOR.common)
    expect(prior({ cls: 'topic', lex: { key: 'x', cls: 'topic' } })).toBe(PRIOR.medium)
    expect(prior({ cls: 'name' })).toBe(PRIOR.proper)
    expect(prior(unknown)).toBe(PRIOR.unknown)
    expect(prior({ cls: 'acronym' })).toBe(PRIOR.unknown)
    expect(prior({ cls: 'attr' })).toBe(PRIOR.unknown)
  })

  it('number classes have a fixed rarity and ignore the store', () => {
    for (const cls of [
      'year',
      'range',
      'quarter',
      'month',
      'week',
      'weekday',
      'version',
      'marker',
      'model',
      'longnum',
      'code',
      'quantity',
    ] as const)
      expect(rarity({ cls }, 999, 1000, store)).toBe(RARITY_NUMBER)
  })

  it('without df, N or with rarity static: the prior', () => {
    expect(rarity(lexCommon, undefined, 1000, store)).toBe(20)
    expect(rarity(lexCommon, 0, undefined, store)).toBe(20)
    expect(rarity(lexCommon, 0, 0, store)).toBe(20)
    expect(rarity(lexCommon, 0, 1000, { rarity: 'static' })).toBe(20)
  })

  it('blend: within 1 point of the prior at N = 1, half at N = 200, mostly store at N = 2000', () => {
    // N = 1: a shared stem and a new stem stay next to the prior
    expect(Math.abs(rarity(lexCommon, 1, 1, store) - 20)).toBeLessThanOrEqual(1)
    expect(Math.abs(rarity(lexCommon, 0, 1, store) - 20)).toBeLessThanOrEqual(1)
    // N = 200: half prior, half store (new stem: store 100)
    expect(rarity(lexCommon, 0, 200, store)).toBe(Math.floor((20 * 200 + 100 * 200) / 400))
    expect(rarity(lexCommon, 0, 200, store)).toBe(60)
    // N = 2000: about 90% store
    const r = rarity(lexCommon, 0, 2000, store)
    expect(r).toBe(Math.floor((20 * 200 + 100 * 2000) / 2200))
    expect(r).toBeGreaterThanOrEqual(90)
    // a stem in every row: store 0
    expect(rarity(unknown, 2000, 2000, store)).toBe(Math.floor((40 * 200) / 2200))
    // df above N is capped
    expect(rarity(unknown, 5000, 2000, store)).toBe(rarity(unknown, 2000, 2000, store))
  })

  it('is monotonic in df', () => {
    let prev = 101
    for (let df = 0; df <= 500; df++) {
      const r = rarity(unknown, df, 500, store)
      expect(r).toBeLessThanOrEqual(prev)
      prev = r
    }
  })
})

describe('score (SPEC 10.3)', () => {
  it('matches the explain example of SPEC 16.4', () => {
    const r = ranked('Jahresbericht Vertrieb Nord 2026')
    expect(r.rows.map((x) => [x.key, x.cls, x.base, x.rarity, x.pos, x.tf, x.lex, x.diff, x.score])).toEqual([
      ['vertrieb', 'topic', 280, 20, 90, 1, 0, 0, 400],
      ['y2026', 'year', 220, 50, 0, 1, 0, 0, 295],
      ['nord', 'direction', 200, 50, 0, 1, 0, 0, 275],
    ])
    expect(r.excluded).toEqual([{ key: 'jahresberich', why: 'weak' }])
    expect(r.pool.map((c) => c.key)).toEqual(['vertrieb', 'y2026', 'nord'])
    expect(r.df).toBe('static')
  })

  it('class weights of SPEC 10.1 (quality rounds 1 and 2: marker, year, direction, quarter, week, version)', () => {
    expect(CLASS_WEIGHT).toMatchObject({
      topic: 280,
      name: 260,
      acronym: 240,
      place: 200,
      marker: 240,
      year: 220,
      range: 160,
      direction: 200,
      region: 140,
      qualifier: 140,
      quarter: 200,
      month: 140,
      week: 200,
      attr: 120,
      version: 200,
      model: 120,
      longnum: 120,
      code: 100,
      weekday: 100,
      quantity: 50,
    })
    expect(classWeight({ cls: 'topic' })).toBe(240)
    expect(classWeight({ cls: 'topic', lex: { key: 'x', cls: 'topic' } })).toBe(280)
    expect(ranked('Review von Acme Inc 2026').rows.find((x) => x.cls === 'name')?.base).toBe(260)
    expect(ranked('NASA Mission Report').rows.find((x) => x.cls === 'acronym')?.base).toBe(240)
  })

  it('built-in entries default to prior common, user entries to medium', () => {
    expect(row('Vertrieb Planung', 'vertrieb')?.rarity).toBe(20)
    const lexicon = [{ key: 'vertrieb', lang: 'de' as const, cls: 'topic' as const }]
    expect(row('Vertrieb Planung', 'vertrieb', { lexicon })?.rarity).toBe(50)
    const rare = [{ key: 'vertrieb', lang: 'de' as const, cls: 'topic' as const, prior: 'rare' as const }]
    expect(row('Vertrieb Planung', 'vertrieb', { lexicon: rare })?.score).toBe(280 + 105 + 90)
  })

  it('position bonus 90, 45, 20, 10, 5, then 0 for T concepts only (docs/DEVIATIONS.md, quality round 1)', () => {
    const r = ranked('Effects of Sleep on Memory in Adults and Children Today', undefined, {}, 'en')
    const bonus = [...r.rows].sort((a, b) => {
      const ca = r.concepts.find((c) => c.key === a.key) as ConceptX
      const cb = r.concepts.find((c) => c.key === b.key) as ConceptX
      return ca.pos - cb.pos
    })
    // the doc-kind word `effects` (weight -60) takes no position bonus
    expect(bonus.map((x) => x.pos)).toEqual([0, 90, 45, 20, 10, 5])
    // doc-kind weight -60 keeps the content words ahead
    expect(row('Effects of Sleep on Memory in Adults and Children Today', 'effect')?.lex).toBe(-60)
    // attr and number classes get no bonus; the bonus skips them
    const t = ranked('Tasse rot 2026 Becher', undefined, {}, 'de')
    expect(t.rows.find((x) => x.key === 'rot')?.cls).toBe('attr')
    expect(t.rows.find((x) => x.key === 'rot')?.pos).toBe(0)
    expect(t.rows.find((x) => x.key === 'y2026')?.pos).toBe(0)
    expect(t.rows.find((x) => x.key === 'bech')?.pos).toBe(45)
  })

  it('tf adds 40 per extra occurrence; the lexicon weight adds', () => {
    expect(row('Technik und Technology Trends', 'tech')?.tf).toBe(2)
    expect(row('Technik und Technology Trends', 'tech')?.score).toBe(280 + 30 + 90 + 40)
    const lexicon = [{ key: 'vertrieb', lang: 'de' as const, cls: 'topic' as const, weight: 25 }]
    expect(row('Vertrieb Planung', 'vertrieb', { lexicon })?.score).toBe(280 + 75 + 90 + 25)
  })

  it('the re-pick boost adds 300 to the diff concepts', () => {
    const r = ranked('Jahresbericht Vertrieb Nord 2026', undefined, { diff: new Set(['nord']) })
    expect(r.rows[0]?.key).toBe('nord')
    expect(r.rows[0]?.diff).toBe(DIFF_BOOST)
    expect(r.rows[0]?.score).toBe(275 + 300)
  })

  it('direction cancel: three or more direction concepts score 0, counted by class', () => {
    const r = ranked('Nordost links West Planung', undefined, {}, 'de')
    expect(r.rows.filter((x) => x.cls === 'direction').map((x) => x.score)).toEqual([0, 0, 0])
    // only the weak word is left: it takes a free slot with the low weak score (quality round 1)
    expect(r.pool.map((c) => [c.key, c.score])).toEqual([['planung', WEAK_POOL_SCORE]])
    expect(ranked('Northeast Southwest North Plan').rows.every((x) => x.score === 0)).toBe(true)
    // two directions stay
    expect(row('Nord Süd Strategie', 'nord')?.score).toBe(275)
  })

  it('store df moves rare words up and frequent words down', () => {
    const d = doc('Vertrieb Kassel Planung')
    const df = new Map([
      ['vertrieb', 900],
      ['kassel', 1],
    ])
    const r = rankConcepts(d.concepts, cfgOf(), { stats: { df, N: 1000 } })
    expect(r.df).toBe('store')
    expect(r.N).toBe(1000)
    expect(r.rows[0]?.key).toBe('kassel')
    // static rarity ignores the store
    const s = rankConcepts(d.concepts, cfgOf({ rarity: 'static' }), { stats: { df, N: 1000 } })
    expect(s.df).toBe('static')
    expect(s.rows[0]?.key).toBe('vertrieb')
  })

  it('N falls back to corpusSize when the store has df but no total', () => {
    const d = doc('Vertrieb Kassel Planung')
    const r = rankConcepts(d.concepts, cfgOf({ corpusSize: 50 }), { stats: { df: new Map() } })
    expect(r.N).toBe(50)
    expect(r.rows.find((x) => x.key === 'vertrieb')?.rarity).toBe(
      rarity({ cls: 'topic', lex: { key: 'v', cls: 'topic', prior: 'common' } }, 0, 50, store),
    )
  })

  it('sort: score desc, pos asc, key asc (code units)', () => {
    const a = { score: 300, pos: 2, key: 'b' }
    expect(rankOrder(a, { score: 301, pos: 9, key: 'z' })).toBeGreaterThan(0)
    expect(rankOrder(a, { score: 300, pos: 1, key: 'z' })).toBeGreaterThan(0)
    expect(rankOrder(a, { score: 300, pos: 2, key: 'B' })).toBeGreaterThan(0)
    expect(rankOrder(a, { score: 300, pos: 2, key: 'c' })).toBeLessThan(0)
    expect(rankOrder(a, { ...a })).toBe(0)
  })

  it('scores are integers and ranking does not change its input', () => {
    const d = doc('Sommerfest Kindergarten Nordstadt Programm 2026')
    const before = d.concepts.map((c) => c.score)
    const r = rankConcepts(d.concepts, cfgOf())
    expect(d.concepts.map((c) => c.score)).toEqual(before)
    expect(r.concepts.every((c) => Number.isInteger(c.score))).toBe(true)
  })
})

describe('pool (SPEC 10.4)', () => {
  it('quantities enter the pool at 125, at the lowest rank', () => {
    const r = ranked('Wasserkocher 50 kg Edelstahl', undefined, {}, 'de')
    const q = r.rows.find((x) => x.key === 'q50kg')
    expect(q?.score).toBe(125)
    expect(r.pool.at(-1)?.key).toBe('q50kg')
  })

  it('weak concepts are excluded; at most 6; below 100 out', () => {
    const r = ranked('Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Bericht', undefined, {}, 'en')
    expect(r.pool).toHaveLength(6)
    expect(r.excluded.filter((e) => e.why === 'pool-full').length).toBeGreaterThan(0)
    expect(r.excluded).toContainEqual({ key: 'bericht', why: 'weak' })
    expect(r.pool.every((c) => !c.weak && c.score >= 100)).toBe(true)
  })

  it('a concept without a rung is excluded', () => {
    const r = ranked('Jahresbericht Vertrieb Nord 2026', undefined, { hasRung: (c) => c.key !== 'nord' })
    expect(r.excluded).toContainEqual({ key: 'nord', why: 'no-rung' })
  })

  it('leak minimal drops names, attr, codes, markers, models, versions, longnum and quantities', () => {
    const t = 'Acme Inc NASA Teil 2 Release v2.4 Wasserkocher 50 kg PROJ-1234 Order 1000012345 2026 Nord'
    const r = ranked(t, { leak: 'minimal' })
    const kept = r.pool.map((c) => c.cls)
    for (const cls of ['name', 'attr', 'code', 'marker', 'model', 'version', 'longnum', 'quantity'])
      expect(kept, cls).not.toContain(cls)
    expect(kept).toContain('acronym')
    expect(kept).toContain('year')
    expect(r.excluded.filter((e) => e.why === 'leak').length).toBeGreaterThan(3)
    expect(concept(t, 'acm', { leak: 'minimal' })?.cls).toBe('name')
  })

  it('leak opaque: the pool is empty', () => {
    const r = ranked('Jahresbericht Vertrieb Nord 2026', { leak: 'opaque', secret: 'rank-test-secret-01234' })
    expect(r.pool).toEqual([])
  })
})
