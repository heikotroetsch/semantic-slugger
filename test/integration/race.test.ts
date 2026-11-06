/**
 * Race tests on PGlite (SPEC 13.5, 19.4): many parallel `createUnique` calls for the same title. The
 * calls interleave their queries on one database, so they read the same state and lose insert races;
 * the `UNIQUE (scope, slug)` constraint is the only guarantee.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prismaStore } from '../../src/adapters/prisma.ts'
import { sqlSchema, sqlStore } from '../../src/adapters/sql.ts'
import { ConflictError, createSlugger, type SlugStore } from '../../src/index.ts'
import { fakeDelegate, newDb, queryOf, SLUG_ENTRY_COLUMNS } from '../helpers/pglite.ts'

let db: PGlite

beforeAll(async () => {
  db = await newDb()
  await db.exec(sqlSchema())
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('truncate slug_entry')
})

/** The store with an insert counter for one call. */
function counted(store: SlugStore, counts: number[], i: number): SlugStore {
  const insert = store.insert as NonNullable<SlugStore['insert']>
  return {
    ...store,
    insert: (r, c) => {
      counts[i] = (counts[i] ?? 0) + 1
      return insert(r, c)
    },
  }
}

async function rows(scope = ''): Promise<string[]> {
  return (await db.query<{ slug: string }>('select slug from slug_entry where scope = $1', [scope])).rows.map(
    (r) => r.slug,
  )
}

const stores = {
  sql: () => sqlStore({ query: queryOf(db), table: 'slug_entry' }),
  prisma: () =>
    prismaStore({
      delegate: fakeDelegate(queryOf(db), 'slug_entry', SLUG_ENTRY_COLUMNS),
      queryRaw: async (t, v) => (await queryOf(db)(t, v)).rows,
    }),
}

describe.each(Object.keys(stores) as (keyof typeof stores)[])('races with the %s adapter', (kind) => {
  it('50 parallel calls, each with its own retryKey: all succeed, all unique, <= 5 inserts each', async () => {
    const s = createSlugger()
    const counts: number[] = Array(50).fill(0)
    const all = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        s.createUnique('Chocolate Cake Recipe', { store: counted(stores[kind](), counts, i), retryKey: `row-${i}` }),
      ),
    )
    const ids = all.map((x) => x.result.id)
    expect(new Set(ids).size).toBe(50)
    expect(Math.max(...counts)).toBeLessThanOrEqual(5)
    expect(counts.some((n) => n > 1)).toBe(true) // races did happen
    expect((await rows()).sort()).toEqual([...ids].sort())
  }, 60_000)

  it('50 parallel calls without retryKey and maxInsertRetries 50: all unique (13.5 lockstep limit)', async () => {
    const s = createSlugger()
    const all = await Promise.all(
      Array.from({ length: 50 }, () =>
        s.createUnique('Chocolate Cake Recipe', { store: stores[kind](), maxInsertRetries: 50 }),
      ),
    )
    const ids = all.map((x) => x.result.id)
    expect(new Set(ids).size).toBe(50)
    expect(await rows()).toHaveLength(50)
  }, 60_000)

  it('without retryKey and the default 5 retries, some of 10 parallel calls give ConflictError', async () => {
    const s = createSlugger()
    const out = await Promise.allSettled(
      Array.from({ length: 10 }, () => s.createUnique('Chocolate Cake Recipe', { store: stores[kind]() })),
    )
    const rejected = out.filter((x) => x.status === 'rejected')
    expect(rejected.length).toBeGreaterThan(0)
    for (const r of rejected) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
    const won = out.filter((x) => x.status === 'fulfilled').length
    expect(await rows()).toHaveLength(won)
  }, 60_000)

  it('parallel calls in two scopes never block each other', async () => {
    const s = createSlugger()
    const all = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        s.createUnique('Spring Concert Program', {
          store: stores[kind](),
          scope: i % 2 === 0 ? 'a' : 'b',
          retryKey: `k${i}`,
        }),
      ),
    )
    const a = all.filter((_, i) => i % 2 === 0).map((x) => x.result.id)
    const b = all.filter((_, i) => i % 2 === 1).map((x) => x.result.id)
    expect(new Set(a).size).toBe(10)
    expect(new Set(b).size).toBe(10)
    expect((await rows('a')).sort()).toEqual([...a].sort())
    expect((await rows('b')).sort()).toEqual([...b].sort())
  }, 60_000)
})
