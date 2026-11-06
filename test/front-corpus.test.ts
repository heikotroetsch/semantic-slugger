import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { keptTokens } from '../src/core/analyze.ts'
import { front, show } from './helpers/front.ts'

interface Fixture {
  id: string
  kind: string
  title: string
  group?: string
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8')) as Fixture[]

/** Steps 1 to 6 over the whole corpus (SPEC 19.7): total, deterministic, and normalization-stable. */
describe('language front over the corpus', () => {
  it('never throws and is deterministic', () => {
    for (const f of fixtures) {
      const a = front(f.title)
      const b = front(f.title)
      expect(keptTokens(a).map(show), f.id).toEqual(keptTokens(b).map(show))
      expect(a.lang, f.id).toBe(b.lang)
    }
  })

  it('Q8 precursor: each norm-* group gives one canonical title, language and token list', () => {
    const groups = new Map<string, Fixture[]>()
    for (const f of fixtures) if (f.group?.startsWith('norm-')) groups.set(f.group, [...(groups.get(f.group) ?? []), f])
    expect(groups.size).toBeGreaterThan(0)
    for (const [g, rows] of groups) {
      const first = front((rows[0] as Fixture).title)
      for (const r of rows) {
        const x = front(r.title)
        expect(x.normalized.canonical, `${g}: ${r.title}`).toBe(first.normalized.canonical)
        expect(x.lang, `${g}: ${r.title}`).toBe(first.lang)
        expect(
          keptTokens(x).map((t) => `${t.ascii}:${t.cls}`),
          `${g}: ${r.title}`,
        ).toEqual(keptTokens(first).map((t) => `${t.ascii}:${t.cls}`))
      }
    }
  })

  it('every content title keeps at least one token (no unexpected empty path)', () => {
    const empty = fixtures.filter((f) => f.kind !== 'edge' && front(f.title).empty).map((f) => f.id)
    expect(empty).toEqual([])
  })
})
