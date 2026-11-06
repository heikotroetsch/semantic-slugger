import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Fixture {
  id: string
  lang: 'de' | 'en' | 'mixed'
  kind: string
  title: string
  group?: string
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8')) as Fixture[]

describe('fixture corpus', () => {
  it('has 407 titles with unique ids t001..t407', () => {
    expect(fixtures).toHaveLength(407)
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(407)
    fixtures.forEach((f, i) => {
      expect(f.id).toBe(`t${String(i + 1).padStart(3, '0')}`)
    })
  })

  it('every entry has the required fields', () => {
    for (const f of fixtures) {
      expect(['de', 'en', 'mixed']).toContain(f.lang)
      expect(typeof f.kind).toBe('string')
      expect(typeof f.title).toBe('string')
    }
  })

  it('340 content titles (kind !== "edge")', () => {
    expect(fixtures.filter((f) => f.kind !== 'edge')).toHaveLength(340)
  })
})
