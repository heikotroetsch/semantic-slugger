/**
 * Expected outputs (SPEC 19.2 `expect.test.ts`, gate Q15): every fixture with an `expect` field gives
 * that body and tail length, alone or after the listed fixtures (sync memory store, tier C).
 */
import { describe, expect, it } from 'vitest'
import { checkExpect, loadFixtures } from '../scripts/lib/corpus.ts'

const fixtures = loadFixtures()
const byId = new Map(fixtures.map((f) => [f.id, f]))
const rows = fixtures.filter((f) => f.expect !== undefined)

describe('fixture expect rows (Q15)', () => {
  it('has the ref rows of SPEC 20', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50)
  })

  it.each(rows.map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const c = checkExpect(f, byId)
    expect(c.got.body, `${f.title} -> ${c.got.id}`).toBe(c.want.body)
    expect(c.got.tail, `${f.title} -> ${c.got.id}`).toBe(c.want.tail)
  })
})
