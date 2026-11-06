/**
 * Collision stress tests (SPEC 19.4, memory parts; the pglite race tests follow with M6).
 * The spec numbers ("at most 3 tail indexes per insert", "64 rows in tier A") assume no hash collisions
 * between tails of one length; the measured behavior is in docs/DEVIATIONS.md (M5).
 */
import { describe, expect, it } from 'vitest'
import { type MemoryStore, memoryStore } from '../src/adapters/memory.ts'
import { createSlugger, ExhaustedError, type SlugStore } from '../src/index.ts'
import { existsOnly } from './helpers/stores.ts'

const T = 'Chocolate Cake Recipe'

/**
 * A memory store that counts the taken answers of `existsMany`: each one is a tail index tried before
 * the free one (an upper bound, because a batch of 8 may also hold taken IDs after the free one). The
 * body-only check of the first row's ID is not a tail index.
 */
function counting(m: MemoryStore, bodyOnly: string): { store: SlugStore; tries: () => number; reset: () => void } {
  let taken = 0
  const store: SlugStore = {
    exists: (id, ctx) => m.exists(id, ctx),
    existsMany: (ids, ctx) => {
      const got = m.existsMany(ids, ctx)
      taken += got.filter((id) => id !== bodyOnly).length
      return got
    },
    countBodies: (b, ctx) => m.countBodies(b, ctx),
    countStems: (s, ctx) => m.countStems(s, ctx),
    total: (ctx) => m.total(ctx),
    findByBody: (b, ctx, l) => m.findByBody(b, ctx, l),
    insert: (r, ctx) => m.insert(r, ctx),
  }
  return { store, tries: () => taken + 1, reset: () => (taken = 0) }
}

async function run(config: Parameters<typeof createSlugger>[0], n: number) {
  const s = createSlugger(config)
  const m = memoryStore()
  const c = counting(m, s.slug(T))
  const rows: { id: string; body: string; t: number; tries: number }[] = []
  for (let i = 0; i < n; i++) {
    c.reset()
    const { result } = await s.createUnique(T, { store: c.store })
    rows.push({ id: result.id, body: result.body, t: result.tail.length, tries: c.tries() })
  }
  return { rows, m }
}

describe('memory store, tier C: the same title 2000 times (SPEC 19.4)', () => {
  it('exact 16: all unique, one window per insert, tail 2 from row 1 and 4 from row 36', async () => {
    const { rows } = await run({}, 2000)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2000)
    expect(rows[0]).toMatchObject({ id: 'choc-cake-recipe', t: 0 })
    expect(rows.slice(1, 36).every((r) => r.t === 2)).toBe(true)
    // the load rule asks t = 3 at n = 35; in exact mode the refit body leaves room for 4
    expect(rows.slice(36).every((r) => r.t === 4)).toBe(true)
    expect(Math.max(...rows.map((r) => r.tries))).toBeLessThanOrEqual(8)
  }, 60_000)

  it('max 16: all unique; t = 3 from n = 35, t = 4 for good from about n = 980', async () => {
    const { rows } = await run({ lengthMode: 'max' }, 2000)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2000)
    expect(rows.slice(1, 36).every((r) => r.t === 2)).toBe(true)
    expect(rows[36]?.t).toBe(3)
    const lastT3 = rows.map((r) => r.t).lastIndexOf(3)
    // 36 rows sit on other bodies (the body-only row and the t = 2 rows), so n = 980 is near row 1016
    expect(lastT3).toBeGreaterThan(900)
    expect(lastT3).toBeLessThan(1100)
    expect(rows.slice(lastT3 + 1).every((r) => r.t === 4)).toBe(true)
    // tail lag: a full window at t = 3 moves on to t = 4 (docs/DEVIATIONS.md #22)
    expect(Math.max(...rows.map((r) => r.tries))).toBeLessThanOrEqual(16)
  }, 60_000)
})

describe('exists-only store, tier A (SPEC 19.4)', () => {
  it('the walk ends after maxScan indexes; the next row throws ExhaustedError with the hint', async () => {
    const s = createSlugger()
    const m = memoryStore()
    const store = existsOnly(m)
    let err: unknown
    for (let i = 0; i < 70 && err === undefined; i++) {
      try {
        await s.createUnique(T, { store })
      } catch (e) {
        err = e
      }
    }
    expect(err).toBeInstanceOf(ExhaustedError)
    expect((err as ExhaustedError).message).toMatch(/countBody/)
    // every distinct tailed ID of the 64 indexes is used, plus the body-only row
    const asked = new Set<string>()
    expect(() =>
      s.suggest(T, {
        taken: (id) => {
          asked.add(id)
          return true
        },
      }),
    ).toThrow(ExhaustedError)
    asked.delete('choc-cake-recipe')
    expect(m.size).toBe(asked.size + 1)
    expect(m.size).toBeGreaterThanOrEqual(55)
  })

  it('without tail collisions in the window: 64 rows work, the 65th throws (length 26, 4-char tails)', async () => {
    const s = createSlugger({ length: 26 })
    expect(s.suggest(T).tail).toHaveLength(4)
    const m = memoryStore()
    const store = existsOnly(m)
    for (let i = 0; i < 64; i++) await s.createUnique(T, { store })
    await expect(s.createUnique(T, { store })).rejects.toBeInstanceOf(ExhaustedError)
    expect(m.size).toBe(64)
  })
})
