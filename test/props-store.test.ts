/**
 * Property tests with a store (SPEC 19.3 items 3, 6, 8, 9, 10, 11). Runs: FC_RUNS (default 1000) for
 * the light properties; the sequence properties run FC_RUNS / 10 cases, each with up to 34 inserts in
 * three tiers (docs/DEVIATIONS.md, M5).
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { loadFixtures } from '../scripts/lib/corpus.ts'
import { type MemoryStore, memoryStore } from '../src/adapters/memory.ts'
import { tailCapacity } from '../src/core/tail.ts'
import { createSlugger, isSluggerError, type SluggerConfig, type SlugStore } from '../src/index.ts'
import { cfgArb, title } from './helpers/arb.ts'
import { existsOnly, noFind } from './helpers/stores.ts'

const seed = Number(process.env.FC_SEED ?? Date.now() % 2 ** 31)
const numRuns = Math.max(1, Number(process.env.FC_RUNS ?? 1000))
const seqRuns = Math.max(1, Math.floor(numRuns / 10))
console.log(`fast-check seed ${seed} (set FC_SEED to replay), runs ${numRuns} / ${seqRuns}`)

/** Tier A with df: exists, countStems and total (no body counts). */
function existsWithDf(m: MemoryStore): SlugStore {
  return {
    exists: (id, ctx) => m.exists(id, ctx),
    countStems: (s, ctx) => m.countStems(s, ctx),
    total: (ctx) => m.total(ctx),
    insert: (r, ctx) => m.insert(r, ctx),
  }
}

/** Insert titles in order; an ExhaustedError (tier A limit) ends the run early. */
async function fill(config: SluggerConfig, store: SlugStore, titles: readonly string[]): Promise<string[]> {
  const s = createSlugger(config)
  const ids: string[] = []
  for (const t of titles) {
    try {
      ids.push((await s.createUnique(t, { store })).result.id)
    } catch (e) {
      if (isSluggerError(e, 'E_EXHAUSTED')) break
      throw e
    }
  }
  return ids
}

describe('store properties (SPEC 19.3)', () => {
  it('3. generate with the same store snapshot gives the same result', async () => {
    await fc.assert(
      fc.asyncProperty(cfgArb, fc.array(title, { maxLength: 6 }), title, async (config, before, t) => {
        const s = createSlugger(config)
        const m = memoryStore()
        await fill(config, m, before)
        const copy = memoryStore(m.snapshot())
        const a = await s.generate(t, { store: m })
        const b = await s.generate(t, { store: copy })
        expect(b).toEqual(a)
      }),
      { seed, numRuns },
    )
  }, 300_000)

  it('6. slugMany gives distinct IDs, also with duplicates', () => {
    fc.assert(
      fc.property(cfgArb, fc.array(title, { maxLength: 8 }), fc.integer({ min: 1, max: 4 }), (config, ts, rep) => {
        const titles = ts.flatMap((t) => Array(rep).fill(t) as string[])
        let ids: string[]
        try {
          ids = createSlugger(config)
            .slugMany(titles)
            .map((r) => r.id)
        } catch (e) {
          if (isSluggerError(e, 'E_EXHAUSTED')) return // tiny lengths and strict alphabets can run out
          throw e
        }
        expect(new Set(ids).size).toBe(titles.length)
      }),
      { seed, numRuns },
    )
  }, 300_000)

  it('8. same tier: suggest(t, { taken }) === generate(t, { store: existsOnly(memoryStore(taken)) })', async () => {
    await fc.assert(
      fc.asyncProperty(cfgArb, fc.array(title, { maxLength: 5 }), title, async (config, before, t) => {
        const s = createSlugger(config)
        const m = memoryStore()
        await fill(config, m, before)
        // the suggested ID of t itself is taken too, so the walk is tested
        const own = s.suggest(t).id
        if (!m.exists(own, { scope: '' })) m.add(own)
        const taken = new Set(m.snapshot().map((r) => r.id))
        let a: unknown
        let b: unknown
        try {
          a = s.suggest(t, { taken })
        } catch (e) {
          a = (e as Error).name
        }
        try {
          b = await s.generate(t, { store: existsOnly(memoryStore(taken)) })
        } catch (e) {
          b = (e as Error).name
        }
        expect(b).toEqual(a)
      }),
      { seed, numRuns },
    )
  }, 300_000)

  // A store with only `exists` has no df, so its ranking can differ from tiers B and C once df counts
  // (docs/DEVIATIONS.md, M5). Parity holds for the same ranking: tier A with df, or `rarity: 'static'`.
  it('9. identical titles: tiers C, B and A give the same ID sequence before the tail grows', async () => {
    await fc.assert(
      fc.asyncProperty(cfgArb, title, fc.integer({ min: 1, max: 34 }), async (config, t, n) => {
        const cfg = createSlugger(config).config
        // tiers B and C grow the tail once (n + 1) * 16 > K(tailMin)
        const max = Math.min(n, Math.floor(tailCapacity(cfg.tailMin, cfg) / 16))
        const titles: string[] = Array(Math.max(1, max)).fill(t)
        const c = await fill(config, memoryStore(), titles)
        const b = await fill(config, noFind(memoryStore()), titles)
        const a = await fill(config, existsWithDf(memoryStore()), titles)
        expect(b).toEqual(c)
        expect(a).toEqual(c.slice(0, a.length))
        const fixed = { ...config, rarity: 'static' as const }
        const cs = await fill(fixed, memoryStore(), titles)
        const as = await fill(fixed, existsOnly(memoryStore()), titles)
        expect(as).toEqual(cs.slice(0, as.length))
      }),
      { seed, numRuns: seqRuns },
    )
  }, 300_000)

  it('10. without a collision, tiers A, B and C give the same ID', async () => {
    await fc.assert(
      fc.asyncProperty(cfgArb, fc.array(title, { maxLength: 6 }), title, async (config, before, t) => {
        const s = createSlugger(config)
        const m = memoryStore()
        await fill(config, m, before)
        const c = await s.generate(t, { store: m })
        if (c.reason !== 'base' && c.reason !== 'opaque' && c.reason !== 'empty') return
        if (c.tailIndex !== 0) return // a hash collision with another row's tail, not a body collision
        const b = await s.generate(t, { store: noFind(m) })
        const a = await s.generate(t, { store: existsWithDf(m) })
        expect(b.id).toBe(c.id)
        expect(a.id).toBe(c.id)
      }),
      { seed, numRuns },
    )
  }, 300_000)

  it('11. hashed stems: the sequential corpus gives the same IDs as plain stems', async () => {
    const secret = 'prop-test-secret-0123'
    const titles = loadFixtures().map((f) => f.title)
    const plain = await fill({ secret }, memoryStore(), titles)
    const hashed = await fill({ secret, storeStems: 'hashed' }, memoryStore(), titles)
    expect(plain).toHaveLength(titles.length)
    expect(hashed).toEqual(plain)
  }, 120_000)
})
