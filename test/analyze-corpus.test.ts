import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeDoc } from '../src/core/analyze.ts'
import { rankConcepts } from '../src/core/rank.ts'
import { analyze } from '../src/index.ts'
import { cfgOf } from './helpers/front.ts'

interface Fixture {
  id: string
  lang: string
  kind: string
  title: string
  keep?: string[]
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8')) as Fixture[]

/** Steps 7 to 9 over the whole corpus (SPEC 19.7): total, deterministic, integer, sorted. */
describe('concepts and rank over the corpus', () => {
  it('never throws, is deterministic and keeps the data rules', () => {
    for (const f of fixtures) {
      const a = analyze(f.title)
      expect(analyze(f.title), f.id).toEqual(a)
      expect(a.storedStems, f.id).toEqual([...new Set(a.storedStems)].sort())
      const keys = a.concepts.map((c) => c.key)
      expect(new Set(keys).size, f.id).toBe(keys.length)
      for (const c of a.concepts) {
        expect(Number.isInteger(c.score), f.id).toBe(true)
        expect(c.tf, f.id).toBeGreaterThanOrEqual(1)
        // every concept stem is a stored stem (plain mode)
        for (const s of c.stemKeys) expect(a.storedStems, `${f.id} ${c.key}`).toContain(s)
      }
      expect(a.pool.length, f.id).toBeLessThanOrEqual(6)
    }
  })

  it('rank order is score desc, pos asc, key asc', () => {
    const cfg = cfgOf()
    for (const f of fixtures) {
      const r = rankConcepts(analyzeDoc(f.title, cfg).concepts, cfg)
      for (let i = 1; i < r.concepts.length; i++) {
        const a = r.concepts[i - 1]
        const b = r.concepts[i]
        if (a === undefined || b === undefined) continue
        const ok = a.score > b.score || (a.score === b.score && (a.pos < b.pos || (a.pos === b.pos && a.key < b.key)))
        expect(ok, `${f.id}: ${a.key} before ${b.key}`).toBe(true)
      }
    }
  })

  it('every content title with `keep` words has a non-empty pool', () => {
    for (const f of fixtures) {
      if (f.keep === undefined || f.kind === 'edge') continue
      expect(analyze(f.title).pool.length, `${f.id}: ${f.title}`).toBeGreaterThan(0)
    }
  })
})
