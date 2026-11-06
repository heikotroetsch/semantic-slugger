import { describe, expect, expectTypeOf, it } from 'vitest'
import { memoryStore } from '../../src/adapters/memory.ts'
import {
  ConfigError,
  ConflictError,
  createSlugger,
  createUnique,
  generate,
  InputError,
  isSluggerError,
  isUniqueViolation,
  type SlugResult,
  type SlugStore,
  StoreError,
  slugMany,
  suggest,
} from '../../src/index.ts'
import { asyncSingles, existsOnly, noFind, recordAnswers } from '../helpers/stores.ts'

const T = 'Jahresbericht Vertrieb Nord 2026'

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

describe('generate() (SPEC 13.4 drivers)', () => {
  it('a free body: same ID as suggest(), tier C, checked', async () => {
    const r = await generate(T, { store: memoryStore() })
    expect(r).toMatchObject({ id: suggest(T).id, reason: 'base', storeTier: 'C', checked: true, tailIndex: 0 })
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('the tier follows the methods of the store', async () => {
    const m = memoryStore()
    expect((await generate(T, { store: existsOnly(m) })).storeTier).toBe('A')
    expect((await generate(T, { store: noFind(m) })).storeTier).toBe('B')
    expect((await generate(T, { store: asyncSingles(m) })).storeTier).toBe('C')
    expect((await generate(T, { store: recordAnswers(m) })).storeTier).toBe('C')
  })

  it('3 round trips without a collision: stats, countBodies, exists', async () => {
    const s = asyncSingles(memoryStore())
    await generate(T, { store: s })
    // stats = countStem per stem + total, in parallel
    const stems = createSlugger().analyze(T).storedStems.length
    expect(s.calls).toEqual([...Array(stems).fill('countStem'), 'total', 'countBody', 'exists'])
  })

  it('3 round trips for a padded title without a collision (exact mode): no second countBody', async () => {
    const s = asyncSingles(memoryStore())
    // one-word title: no unused word can fill the room, so it keeps a padding tail (quality round 1)
    const r = await generate('Board', { store: s })
    expect(r.reason).toBe('base')
    expect(r.tail).not.toBe('')
    const stems = createSlugger().analyze('Board').storedStems.length
    // one exists batch of 8 tail IDs, asked in parallel (no existsMany)
    const exists = Array(8).fill('exists')
    expect(s.calls).toEqual([...Array(stems).fill('countStem'), 'total', 'countBody', ...exists])
  })

  it('a truthy non-boolean from exists counts as taken (13.3)', async () => {
    const own = suggest('Sommerfest 2026').id
    const r = await generate('Sommerfest 2026', { store: { exists: (id) => (id === own ? 1 : 0) as never } })
    expect(r.id).not.toBe(own)
    expect(r.checked).toBe(true)
    const row = await generate('Sommerfest 2026', {
      store: { exists: (id) => (id === own ? ({ id } as never) : (null as never)) },
    })
    expect(row.id).not.toBe(own)
  })

  it('existsMany that answers no iterable is a StoreError', async () => {
    const e = await rejection(generate(T, { store: { exists: () => false, existsMany: () => undefined as never } }))
    expect(e).toBeInstanceOf(StoreError)
  })

  it('ExhaustedError: the counting-store hint only for tier A', async () => {
    const a = await rejection(generate(T, { store: { exists: () => true } }))
    expect(isSluggerError(a, 'E_EXHAUSTED')).toBe(true)
    expect((a as Error).message).toContain('countBody')
    const b = await rejection(generate(T, { store: { exists: () => true, countBody: () => 0 } }))
    expect(isSluggerError(b, 'E_EXHAUSTED')).toBe(true)
    expect((b as Error).message).not.toContain('countBody')
    expect((b as Error).message).toContain('maxAttempts')
  })

  it('maxAttempts 1: 200 identical titles keep their body in tier C (no blank-index lag)', async () => {
    const s = createSlugger({ maxAttempts: 1 })
    const m = memoryStore()
    const bodies = new Set<string>()
    for (let i = 0; i < 200; i++)
      // a one-word body with a long tail (weak words fill short bodies since quality round 1)
      bodies.add((await s.createUnique('Board', { store: m })).result.body)
    expect([...bodies]).toEqual(['board'])
    expect(m.size).toBe(200)
  })

  it('rarity static asks no df', async () => {
    const s = asyncSingles(memoryStore())
    await createSlugger({ rarity: 'static' }).generate(T, { store: s })
    expect(s.calls).toEqual(['countBody', 'exists'])
  })

  it('single-key, record and Map answers give the same ID sequence', async () => {
    const titles = [T, T, 'Jahresbericht Vertrieb Süd 2026', T, 'Sommerfest 2026', 'Sommerfest 2026']
    const run = async (wrap: (m: ReturnType<typeof memoryStore>) => SlugStore) => {
      const m = memoryStore()
      const store = wrap(m)
      const ids: string[] = []
      for (const t of titles) ids.push((await createUnique(t, { store })).result.id)
      return ids
    }
    const plain = await run((m) => m)
    expect(new Set(plain).size).toBe(titles.length)
    expect(await run(asyncSingles)).toEqual(plain)
    expect(await run(recordAnswers)).toEqual(plain)
  })

  it('identical titles keep the body; the tail tells them apart', async () => {
    const m = memoryStore()
    const a = (await createUnique('Sommerfest 2026', { store: m })).result
    const b = (await createUnique('Sommerfest 2026', { store: m })).result
    expect(b.body).toBe(a.body)
    expect(b.reason).toBe('shared-body')
    expect(b.tailIndex).toBe(a.tailIndex + 1)
  })

  it('scope: counts never cross; the same title gives the same ID in every scope', async () => {
    const m = memoryStore()
    const a = (await createUnique(T, { store: m, scope: 'tenant-a' })).result
    const b = (await createUnique(T, { store: m, scope: 'tenant-b' })).result
    expect(b.id).toBe(a.id)
    expect(m.snapshot('tenant-a')).toHaveLength(1)
    expect(m.snapshot('')).toHaveLength(0)
  })

  it('exclude skips IDs without asking the store', async () => {
    const asked: string[] = []
    const store: SlugStore = {
      exists: (id) => {
        asked.push(id)
        return false
      },
    }
    const first = suggest(T).id
    const r = await generate(T, { store, exclude: [first] })
    expect(r.id).not.toBe(first)
    expect(asked).not.toContain(first)
  })

  it('store errors become StoreError with the cause; sync throws and rejections', async () => {
    const boom = new Error('db down')
    const e1 = await rejection(generate(T, { store: { exists: () => Promise.reject(boom) } }))
    expect(e1).toBeInstanceOf(StoreError)
    expect((e1 as StoreError).cause).toBe(boom)
    const e2 = await rejection(
      generate(T, {
        store: {
          exists: () => false,
          countBody: () => {
            throw boom
          },
        },
      }),
    )
    expect(isSluggerError(e2, 'E_STORE')).toBe(true)
  })

  it('an aborted signal rethrows its reason as is', async () => {
    const reason = new Error('stop')
    const e1 = await rejection(generate(T, { store: memoryStore(), signal: { aborted: true, reason } }))
    expect(e1).toBe(reason)
    const signal = { aborted: false, reason: 'later' as unknown }
    const store: SlugStore = {
      exists: () => false,
      countBody: () => {
        signal.aborted = true
        throw new Error('aborted inside the driver')
      },
    }
    expect(await rejection(generate(T, { store, signal }))).toBe('later')
    const bare = await rejection(generate(T, { store: memoryStore(), signal: { aborted: true } }))
    expect((bare as Error).name).toBe('AbortError')
  })

  it('a missing store, a store without exists, a bad scope or title reject', async () => {
    const e1 = await rejection(generate(T, undefined as unknown as { store: SlugStore }))
    expect(e1).toBeInstanceOf(ConfigError)
    const e2 = await rejection(generate(T, { store: {} as SlugStore }))
    expect((e2 as ConfigError).details?.reason).toBe('invalid-store')
    const e3 = await rejection(generate(T, { store: memoryStore(), scope: 3 as unknown as string }))
    expect(e3).toBeInstanceOf(ConfigError)
    expect(await rejection(generate(42 as unknown as string, { store: memoryStore() }))).toBeInstanceOf(InputError)
  })

  it('the same store snapshot gives the same result (19.3 item 3)', async () => {
    const m = memoryStore()
    for (const t of [T, T, 'Sommerfest 2026']) await createUnique(t, { store: m })
    const a = await generate(T, { store: m })
    const b = await generate(T, { store: memoryStore(m.snapshot()) })
    expect(b).toEqual(a)
  })
})

describe('createUnique() (SPEC 13.5)', () => {
  it('store.insert path: the row holds id, body, stems and titleKey; record is undefined', async () => {
    const m = memoryStore()
    const { result, record } = await createUnique(T, { store: m })
    expect(record).toBeUndefined()
    expect(m.snapshot()).toEqual([
      { id: result.id, body: result.body, stems: [...result.stems], titleKey: result.titleKey, algorithm: 1 },
    ])
  })

  it('insert callback: a unique violation retries with a new ID; the record is returned', async () => {
    const m = memoryStore()
    const seen: string[] = []
    const out = await createUnique(T, {
      store: { exists: (id, ctx) => m.exists(id, ctx) }, // no store.isConflict: isUniqueViolation decides
      insert: async (r: SlugResult) => {
        seen.push(r.id)
        if (seen.length < 3) throw Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['slug'] } })
        return { row: r.id }
      },
    })
    expectTypeOf(out.record).toEqualTypeOf<{ row: string } | undefined>()
    expect(out.record).toEqual({ row: out.result.id })
    expect(new Set(seen).size).toBe(3)
    expect(seen[2]).toBe(out.result.id)
  })

  it('a non-conflict error from insert is rethrown as is; a custom isConflict decides', async () => {
    const err = new Error('validation')
    expect(await rejection(createUnique(T, { store: memoryStore(), insert: () => Promise.reject(err) }))).toBe(err)
    let n = 0
    const out = await createUnique(T, {
      store: memoryStore(),
      isConflict: (e) => e === err,
      insert: async () => {
        if (n++ === 0) throw err
        return 1
      },
    })
    expect(out.record).toBe(1)
  })

  it('ConflictError after maxInsertRetries lost races, with the tried IDs', async () => {
    const e = await rejection(
      createUnique(T, {
        store: { exists: () => false },
        maxInsertRetries: 3,
        insert: () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' })),
      }),
    )
    expect(e).toBeInstanceOf(ConflictError)
    expect((e as ConflictError).details.tried).toHaveLength(3)
    expect(new Set((e as ConflictError).details.tried).size).toBe(3)
  })

  it('a stale read (exists says free, insert says conflict) retries with another ID', async () => {
    const m = memoryStore()
    const hidden = memoryStore()
    const first = (await createUnique(T, { store: hidden })).result.id
    const store: SlugStore = {
      exists: (id, ctx) => m.exists(id, ctx),
      insert: (r, ctx) => (r.id === first ? 'conflict' : m.insert(r, ctx)),
    }
    const { result } = await createUnique(T, { store })
    expect(result.id).not.toBe(first)
  })

  it('config errors: no insert path, bad maxInsertRetries; store.insert failures are StoreError', async () => {
    const e1 = await rejection(createUnique(T, { store: { exists: () => false } }))
    expect((e1 as ConfigError).details?.reason).toBe('no-insert')
    const e2 = await rejection(createUnique(T, { store: memoryStore(), maxInsertRetries: 0 }))
    expect(e2).toBeInstanceOf(ConfigError)
    const boom = new Error('write failed')
    const e3 = await rejection(
      createUnique(T, {
        store: {
          exists: () => false,
          insert: () => {
            throw boom
          },
        },
      }),
    )
    expect(e3).toBeInstanceOf(StoreError)
    expect((e3 as StoreError).cause).toBe(boom)
  })

  it('store.isConflict is used before isUniqueViolation', async () => {
    const err = new Error('custom')
    let n = 0
    const out = await createUnique(T, {
      store: { exists: () => false, isConflict: (e) => e === err },
      insert: async () => {
        if (n++ === 0) throw err
        return 'ok'
      },
    })
    expect(out.record).toBe('ok')
  })

  it('50 parallel calls with the same title and a retryKey each: all unique, <= 5 inserts each (13.5)', async () => {
    const m = memoryStore()
    const inserts: number[] = Array(50).fill(0)
    const all = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        createUnique('Team Lunch Friday', {
          store: m,
          retryKey: `row-${i}`,
          insert: async (r) => {
            inserts[i] = (inserts[i] ?? 0) + 1
            await Promise.resolve()
            m.add({ id: r.id, body: r.body, stems: r.stems, titleKey: r.titleKey })
            return i
          },
        }),
      ),
    )
    expect(new Set(all.map((x) => x.result.id)).size).toBe(50)
    expect(all.map((x) => x.record)).toEqual(Array.from({ length: 50 }, (_, i) => i))
    expect(Math.max(...inserts)).toBeLessThanOrEqual(5)
    expect(m.size).toBe(50)
  })

  it('retryKey: the same key and store state give the same ID; a bad key is a ConfigError', async () => {
    const run = async () => {
      const m = memoryStore()
      let n = 0
      return (
        await createUnique('Team Lunch Friday', {
          store: m,
          retryKey: 'k1',
          isConflict: () => true,
          insert: async (r) => {
            if (n++ < 2) throw Object.assign(new Error('dup'), { code: '23505' })
            return r.id
          },
        })
      ).record
    }
    expect(await run()).toBe(await run())
    const e = await rejection(createUnique(T, { store: memoryStore(), retryKey: 1 as never }))
    expect((e as ConfigError).details?.reason).toBe('not-string')
  })

  it('without a retryKey, 6 parallel identical calls with the default 5 retries can lose (13.5 limit)', async () => {
    const m = memoryStore()
    const out = await Promise.allSettled(
      Array.from({ length: 6 }, () => createUnique('Release Planning Workshop', { store: m })),
    )
    expect(out.filter((x) => x.status === 'rejected')).toHaveLength(1)
  })

  // The calls run in lockstep on a sync store: every round, all of them compute the same next ID and
  // one wins. So n identical parallel calls need up to n rounds here (docs/DEVIATIONS.md, M5).
  it('50 parallel calls with the same title on one memory store: all unique (lost races retry)', async () => {
    const m = memoryStore()
    const all = await Promise.all(
      Array.from({ length: 50 }, () => createUnique('Team Lunch Friday', { store: m, maxInsertRetries: 50 })),
    )
    const ids = all.map((x) => x.result.id)
    expect(new Set(ids).size).toBe(50)
    expect(m.size).toBe(50)
  })
})

describe('isUniqueViolation (SPEC 13.5)', () => {
  const p2002 = (target?: unknown) => Object.assign(new Error('x'), { code: 'P2002', meta: { target } })
  it('Prisma P2002, with and without a field', () => {
    expect(isUniqueViolation(p2002(['scope', 'slug']))).toBe(true)
    expect(isUniqueViolation(p2002(['scope', 'slug']), 'slug')).toBe(true)
    expect(isUniqueViolation(p2002(['email']), 'slug')).toBe(false)
    expect(isUniqueViolation(p2002('SlugEntry_scope_slug_key'), 'slug')).toBe(true)
    expect(isUniqueViolation(p2002(undefined), 'slug')).toBe(true)
    const adapter = { code: 'P2002', meta: { driverAdapterError: { cause: { constraint: { fields: ['slug'] } } } } }
    expect(isUniqueViolation(adapter, 'slug')).toBe(true)
    expect(isUniqueViolation(adapter, 'email')).toBe(false)
  })

  it('Postgres 23505 by constraint name or detail; wrapped in cause', () => {
    expect(isUniqueViolation({ code: '23505', constraint: 'slug_entry_scope_slug_uq' }, 'slug')).toBe(true)
    expect(isUniqueViolation({ code: '23505', constraint: 'user_email_key' }, 'slug')).toBe(false)
    expect(isUniqueViolation({ code: '23505', detail: 'Key (scope, slug)=(a, b) already exists.' }, 'slug')).toBe(true)
    expect(isUniqueViolation(new Error('wrap', { cause: { code: '23505' } }))).toBe(true)
  })

  it('other errors are not violations', () => {
    for (const e of [undefined, null, 'P2002', new Error('x'), { code: 'P2025' }, { code: '23503' }])
      expect(isUniqueViolation(e)).toBe(false)
  })
})

describe('slugMany() (SPEC 16.1)', () => {
  it('unique within the batch, the same IDs as one memory store in order', async () => {
    const titles = [T, T, 'Sommerfest 2026', T, 'Jahresbericht Vertrieb Süd 2026', 'Sommerfest 2026']
    const many = slugMany(titles)
    expect(new Set(many.map((r) => r.id)).size).toBe(titles.length)
    const m = memoryStore()
    const seq: string[] = []
    for (const t of titles) seq.push((await createUnique(t, { store: m })).result.id)
    expect(many.map((r) => r.id)).toEqual(seq)
    expect(many[0]).toMatchObject({ storeTier: 'C', checked: false })
    expect(Object.isFrozen(many[0])).toBe(true)
  })

  it('respects taken, exclude and lang; checked with taken', () => {
    const first = suggest(T).id
    const many = createSlugger().slugMany([T], { taken: new Set([first]) })
    expect(many[0]?.id).not.toBe(first)
    expect(many[0]?.checked).toBe(true)
    expect(createSlugger().slugMany([T], { exclude: [first] })[0]?.id).not.toBe(first)
    expect(slugMany(['Gift'], { lang: 'en' })[0]?.lang).toBe('en')
  })

  it('accepts any iterable, an empty batch, and throws InputError for a non-string', () => {
    expect(slugMany(new Set(['a b c']))).toHaveLength(1)
    expect(slugMany([])).toEqual([])
    expect(() => slugMany([1 as unknown as string])).toThrow(InputError)
  })
})
