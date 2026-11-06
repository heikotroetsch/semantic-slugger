import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SluggerConfig } from '../../src/config.ts'
import { compile } from '../../src/core/compile.ts'
import {
  type Candidate,
  compareCandidates,
  fallbackCandidate,
  fitBody,
  refitWithTail,
  tailCost,
  tailOptions,
} from '../../src/core/fit.ts'
import type { Laddered } from '../../src/core/ladder.ts'
import { rankPool } from '../../src/core/resolve.ts'
import { doc } from '../helpers/concepts.ts'
import { cfgOf } from '../helpers/front.ts'

function poolOf(title: string, config?: SluggerConfig): Laddered[] {
  const cfg = cfgOf(config)
  return rankPool(doc(title, config), null, cfg, compile(cfg)).pool
}

function cands(title: string, config?: SluggerConfig): Candidate[] {
  return fitBody(poolOf(title, config), cfgOf(config))
}

const row = (c: Candidate) => `${c.body}${c.tailLen > 0 ? `+t${c.tailLen}` : ''} ${c.cost}`

describe('tail options and cost (SPEC 12)', () => {
  const cfg = cfgOf()
  it('exact: a body of L, or L - 1 - tailMin and shorter with a tail', () => {
    expect(tailOptions(16, cfg, 0)).toEqual([0])
    expect(tailOptions(15, cfg, 0)).toEqual([])
    expect(tailOptions(14, cfg, 0)).toEqual([])
    expect(tailOptions(13, cfg, 0)).toEqual([2])
    expect(tailOptions(16, cfg, 2)).toEqual([])
    expect(tailOptions(10, cfg, 7)).toEqual([])
  })
  it('max: no tail unless asked', () => {
    const max = cfgOf({ lengthMode: 'max' })
    expect(tailOptions(14, max, 0)).toEqual([0])
    expect(tailOptions(17, max, 0)).toEqual([])
    expect(tailOptions(13, max, 2)).toEqual([2])
    expect(tailOptions(14, max, 2)).toEqual([])
  })
  it('tail cost 250 + 50 per char over tailMin', () => {
    expect(tailCost(0, cfg)).toBe(0)
    expect(tailCost(2, cfg)).toBe(250)
    expect(tailCost(7, cfg)).toBe(500)
  })
})

describe('worked cost checks (SPEC 12.2)', () => {
  it('A: Jahresbericht Vertrieb Nord 2026', () => {
    const c = cands('Jahresbericht Vertrieb Nord 2026')
    expect(c.slice(0, 3).map(row)).toEqual(['vertrieb-nord-26 100', 'vertrieb-nord+t2 525', 'vertrieb-2026+t2 535'])
    expect(c[0]?.parts).toEqual({ rungs: 40, cryptic: 0, lost: 0, chunks: 60, tail: 0 })
  })

  it('B: refit with a tail of 2 keeps the content, rungs shrink', () => {
    const pool = poolOf('Jahresbericht Vertrieb Nord 2026')
    const cfg = cfgOf()
    const best = fitBody(pool, cfg)[0] as Candidate
    const r = refitWithTail(pool, cfg, best, 2) as Candidate
    expect(row(r)).toBe('ver-nord-2026+t2 490')
    const max = cfgOf({ lengthMode: 'max' })
    const m = refitWithTail(
      poolOf('Jahresbericht Vertrieb Nord 2026', { lengthMode: 'max' }),
      max,
      best,
      2,
    ) as Candidate
    expect(row(m)).toBe('ver-nord-26+t2 460')
  })

  it('C: Q3 2026 Marketing Budget Review', () => {
    expect(cands('Q3 2026 Marketing Budget Review').slice(0, 3).map(row)).toEqual([
      'mktg-budget-26q3 375',
      'mktg-review-26q3 400',
      'mktg-budget-2026 620',
    ])
  })

  it('D: Chocolate Cake Recipe', () => {
    expect(cands('Chocolate Cake Recipe').slice(0, 2).map(row)).toEqual([
      'choc-cake-recipe 190',
      'chocolate-recipe 370',
    ])
  })
})

describe('fit rules', () => {
  it('one candidate per subset: spelling variants never compete', () => {
    for (const t of ['Q3 2026 Marketing Budget Review', 'Rezept Apfelkuchen mit Zimt', 'Firefox v132 Release Notes']) {
      const keys = cands(t).map((c) => c.contentKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('tie-break by rung cost in rank order: firefox-rel-v132 beats fir-release-v132', () => {
    const c = cands('Firefox v132 Release Notes')
    expect(row(c[0] as Candidate)).toBe('firefox-rel-v132 230')
  })

  it('tie-break by content rank, then body', () => {
    const pool = poolOf('Team Lunch Friday')
    const rank = new Map(pool.map((c, i) => [c.key, i]))
    const a = fitBody(pool, cfgOf())
    for (let i = 1; i < a.length; i++)
      expect(compareCandidates(a[i - 1] as Candidate, a[i] as Candidate, rank)).toBeLessThanOrEqual(0)
  })

  it('max mode prefers the shorter ID on equal cost and needs no tail', () => {
    const c = cands('MRT Knie links', { lengthMode: 'max' })
    expect(row(c[0] as Candidate)).toBe('mrt-knie-links 60')
  })

  it('a model number only with its word; the bond joins in the word slot', () => {
    for (const c of cands('Tavora Phone 8 128 GB Midnight Blue')) {
      const keys = c.content.map((x) => x.key)
      if (keys.includes('d8')) expect(c.body).toContain('phone8')
    }
    expect(cands('Tavora Phone 8 128 GB Midnight Blue')[0]?.body).toBe('phone8-mdgt-blue')
  })

  it('quarter and month bond with the year into one segment', () => {
    expect(cands('Newsletter März 2026')[0]?.body).toContain('26mrz')
    expect(cands('Board Minutes March 2026')[0]?.body).toContain('26mar')
  })

  it('a wide range fills two segments', () => {
    const c = cands('Archiv 1950–2020')[0] as Candidate
    expect(c.body).toBe('archiv-1950-2020')
    expect(c.segs.length).toBe(3)
  })

  it('a body that starts with a digit gets the fallback word', () => {
    expect(cands('2026')[0]?.body).toBe('doc-2026')
    expect(cands('Teil 1 Teil 2 Teil 3')[0]?.body).toBe('pt1-pt2-pt3')
  })

  it('slot order T, Q, N, then title position', () => {
    expect(cands('Elternabend Klasse 4b Grundschule Nord')[0]?.body).toBe('abend-nord-kla4b')
  })

  it('leak minimal: at most 3 segments; maxSegments caps the body', () => {
    for (const c of cands('Q3 2026 Marketing Budget Review Team Nord', { leak: 'minimal' }))
      expect(c.segs.length).toBeLessThanOrEqual(3)
    for (const c of cands('Q3 2026 Marketing Budget Review', { maxSegments: 2 }))
      expect(c.segs.length).toBeLessThanOrEqual(2)
  })

  it('reserved bodies: no body-only ID; in max mode a tail is forced', () => {
    const max = cands('new', { lengthMode: 'max' })
    expect(row(max[0] as Candidate)).toBe('new+t2 250')
    const ex = cands('admin', { length: 8, tailMin: 2 })
    for (const c of ex) expect(c.tailLen === 0 && c.body === 'admin').toBe(false)
  })

  it('fallback candidate and onlyContent', () => {
    const cfg = cfgOf()
    const f = fallbackCandidate([], cfg, 2) as Candidate
    expect(f.body).toBe('doc')
    expect(f.tailLen).toBe(12)
    const pool = poolOf('Q3 2026 Marketing Budget Review')
    const only = fitBody(pool, cfg, { onlyContent: 'budget|marketing' })
    expect(only.map((c) => c.contentKey)).toEqual(['budget|marketing'])
  })
})

describe('lower-bound cut (SPEC 12)', () => {
  it('gives the same best candidates as a full search (maxPlans 256 holds every subset), over the corpus', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../fixtures/titles.json', import.meta.url), 'utf8')) as {
      title: string
    }[]
    const cfg = cfgOf()
    const full = cfgOf({ maxPlans: 256 })
    for (const f of fixtures.slice(0, 250)) {
      const d = doc(f.title)
      if (d.empty) continue
      const pool = rankPool(d, null, cfg, compile(cfg)).pool
      const a = fitBody(pool, cfg).map(row)
      const b = fitBody(pool, full).slice(0, cfg.maxPlans).map(row)
      expect(a, f.title).toEqual(b)
    }
  })

  it('worst case (pool 6, maxSegments 5) stays under 10 ms', () => {
    const config: SluggerConfig = { maxSegments: 5 }
    const title = 'Kraftwerk Nordsee Windpark Turbine Wartung Planung Leistung Netzanschluss Q3 2026'
    const pool = poolOf(title, config)
    expect(pool.length).toBe(6)
    const cfg = cfgOf(config)
    fitBody(pool, cfg)
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      fitBody(pool, cfg)
      times.push(performance.now() - t0)
    }
    times.sort((x, y) => x - y)
    expect(times[2]).toBeLessThan(10)
  })
})
