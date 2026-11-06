/**
 * Prisma adapter against a Prisma-shaped delegate on PGlite (SPEC 17.2, 19.4): every store method,
 * fallbacks without `groupBy` and `queryRaw`, field mapping, `insert-blocked`, conflicts inside a
 * transaction (no `25P02`), the entity-column recipe of SPEC 13.5, and ID parity with the memory store.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadFixtures } from '../../scripts/lib/corpus.ts'
import { memoryStore } from '../../src/adapters/memory.ts'
import { isPrismaUniqueViolation, type PrismaSlugDelegate, prismaStore } from '../../src/adapters/prisma.ts'
import { sqlSchema } from '../../src/adapters/sql.ts'
import {
  ConfigError,
  createSlugger,
  isUniqueViolation,
  type SlugRecord,
  type SlugStore,
  StoreError,
} from '../../src/index.ts'
import { type Db, fakeDelegate, newDb, queryOf, SLUG_ENTRY_COLUMNS } from '../helpers/pglite.ts'

const ctx = { scope: '' }
const rec = (id: string, body: string, stems: string[] = []): SlugRecord => ({
  id,
  body,
  stems,
  titleKey: '0123456789abcdef',
  algorithm: 1,
})

const DOCUMENT_COLUMNS = {
  id: 'id',
  tenantId: 'tenant_id',
  title: 'title',
  slug: 'slug',
  slugBody: 'slug_body',
  slugStems: 'slug_stems',
}

let db: PGlite

const entries = (on: Db = db, log?: string[]) => fakeDelegate(queryOf(on, log), 'slug_entry', SLUG_ENTRY_COLUMNS)
const rawOf =
  (on: Db = db, log?: string[]) =>
  async (sql: string, v: unknown[]) =>
    (await queryOf(on, log)(sql, v)).rows

beforeAll(async () => {
  db = await newDb()
  await db.exec(sqlSchema())
  await db.exec(`create table document (
    id serial primary key, tenant_id text not null, title text not null,
    slug text not null, slug_body text not null, slug_stems text[] not null default '{}',
    constraint document_tenant_slug_uq unique (tenant_id, slug))`)
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('truncate slug_entry; truncate document')
})

describe('prismaStore (SPEC 17.2)', () => {
  for (const variant of ['groupBy + queryRaw', 'count fallbacks'] as const) {
    it(`answers every method (${variant})`, async () => {
      const full = entries()
      const delegate: PrismaSlugDelegate =
        variant === 'count fallbacks'
          ? { count: full.count, findMany: full.findMany, createMany: full.createMany }
          : full
      const s = prismaStore(variant === 'count fallbacks' ? { delegate } : { delegate, queryRaw: rawOf() })
      expect(await s.insert?.(rec('kuchen-rezept', 'kuchen-rezept', ['rezept', 'kuchen']), ctx)).toBe('inserted')
      expect(await s.insert?.(rec('kuchen-rezept-ab', 'kuchen-rezept', ['kuchen', 'schoko']), ctx)).toBe('inserted')
      expect(await s.insert?.(rec('kuchen-rezept', 'x'), ctx)).toBe('conflict')
      expect(await s.exists('kuchen-rezept', ctx)).toBe(true)
      expect(await s.exists('nope', ctx)).toBe(false)
      expect([...(await s.existsMany(['nope', 'kuchen-rezept-ab'], ctx))]).toEqual(['kuchen-rezept-ab'])
      expect(await s.existsMany([], ctx)).toEqual([])
      expect(await s.countBodies(['kuchen-rezept', 'x'], ctx)).toEqual(
        variant === 'count fallbacks'
          ? new Map([
              ['kuchen-rezept', 2],
              ['x', 0],
            ])
          : new Map([['kuchen-rezept', 2]]),
      )
      expect(await s.countBodies([], ctx)).toEqual(new Map())
      const df = await s.countStems(['kuchen', 'rezept', 'schoko', 'brot'], ctx)
      expect([...df].filter(([, n]) => n > 0)).toEqual([
        ['kuchen', 2],
        ['rezept', 1],
        ['schoko', 1],
      ])
      expect(await s.countStems([], ctx)).toEqual(new Map())
      expect(await s.total(ctx)).toBe(2)
      expect(await s.findByBody('kuchen-rezept', ctx, 1)).toEqual([
        { id: 'kuchen-rezept', stems: ['kuchen', 'rezept'] },
      ])
    })
  }

  it('retired rows stay taken but leave df and total (default retiredAt field and retired_at column)', async () => {
    for (const s of [prismaStore({ delegate: entries() }), prismaStore({ delegate: entries(), queryRaw: rawOf() })]) {
      await db.exec('truncate slug_entry')
      await s.insert?.(rec('alpha', 'alpha', ['a']), ctx)
      await s.insert?.(rec('alpha-xy', 'alpha', ['a']), ctx)
      await db.query(`update slug_entry set retired_at = now() where slug = 'alpha'`)
      expect(await s.exists('alpha', ctx)).toBe(true)
      expect(await s.countBodies(['alpha'], ctx)).toEqual(new Map([['alpha', 2]]))
      expect(await s.total(ctx)).toBe(1)
      expect(await s.countStems(['a'], ctx)).toEqual(new Map([['a', 1]]))
    }
  })

  it('without createMany there is no insert; createUnique then needs an insert callback', async () => {
    const full = entries()
    const s = prismaStore({ delegate: { count: full.count, findMany: full.findMany } })
    expect(s.insert).toBeUndefined()
    const e = await createSlugger()
      .createUnique('Summer Reading List', { store: s })
      .catch((x: unknown) => x)
    expect((e as ConfigError).details?.reason).toBe('no-insert')
  })

  it('a row skipped by another unique constraint is StoreError insert-blocked', async () => {
    await db.exec('create unique index slug_entry_title_key_uq on slug_entry (title_key)')
    try {
      const s = prismaStore({ delegate: entries() })
      expect(await s.insert?.(rec('one', 'one'), ctx)).toBe('inserted')
      const e = await createSlugger()
        .createUnique('Two Words', {
          store: {
            ...s,
            insert: (r, c) =>
              (s.insert as NonNullable<SlugStore['insert']>)({ ...r, titleKey: rec('', '').titleKey }, c),
          },
        })
        .catch((x: unknown) => x)
      expect(e).toBeInstanceOf(StoreError)
      expect((e as StoreError).details?.reason).toBe('insert-blocked')
    } finally {
      await db.exec('drop index slug_entry_title_key_uq')
    }
  })

  it('checks options', () => {
    expect(() => prismaStore({} as never)).toThrow(ConfigError)
    expect(() => prismaStore({ delegate: { count: async () => 0 } } as never)).toThrow(ConfigError)
    expect(() => prismaStore({ delegate: entries(), fields: { slug: '' } })).toThrow(ConfigError)
    expect(() => prismaStore({ delegate: entries(), queryRaw: rawOf(), table: 'bad name' })).toThrow(ConfigError)
    expect(() => prismaStore({ delegate: entries(), queryRaw: rawOf(), fields: { stems: 'a"b' } })).toThrow(ConfigError)
  })

  it('a generate call without a collision makes about 5 queries (groupBy + queryRaw)', async () => {
    const log: string[] = []
    const s = prismaStore({ delegate: entries(db, log), queryRaw: rawOf(db, log) })
    await createSlugger().generate('Neighborhood Cleanup Day', { store: s })
    expect(log.length).toBeLessThanOrEqual(5)
  })
})

describe('isPrismaUniqueViolation', () => {
  it('P2002 with or without a field, and Postgres 23505 in the cause chain', () => {
    const e = Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['tenantId', 'slug'] } })
    expect(isPrismaUniqueViolation(e)).toBe(true)
    expect(isPrismaUniqueViolation(e, 'slug')).toBe(true)
    expect(isPrismaUniqueViolation(e, 'email')).toBe(false)
    expect(isPrismaUniqueViolation({ code: 'P2010', cause: { code: '23505' } })).toBe(true)
    expect(isPrismaUniqueViolation(new Error('other'))).toBe(false)
  })
})

describe('transactions (SPEC 13.5)', () => {
  it('a plain insert that fails inside a transaction aborts it (25P02): why the adapter uses skipDuplicates', async () => {
    await db.query(
      `insert into slug_entry (scope, slug, body, title_key, algorithm) values ('', 'taken', 'taken', '', 1)`,
    )
    const e = await db
      .transaction(async (tx) => {
        await entries(tx)
          .create({ data: { scope: '', slug: 'taken', body: 'taken', titleKey: '', algorithm: 1 } })
          .catch(() => undefined)
        await tx.query('select 1')
      })
      .catch((x: unknown) => x)
    expect(e).toMatchObject({ code: '25P02' })
  })

  it('a lost race inside an interactive transaction is retried, with no 25P02', async () => {
    const s = createSlugger()
    const first = await s.createUnique('Garden Party Invitation', { store: prismaStore({ delegate: entries() }) })
    const out = await db.transaction(async (tx) => {
      // stale reads until the first insert: round 1 does not see the row of `first`, picks its ID and loses
      let stale = true
      const delegate = fakeDelegate(queryOf(tx), 'slug_entry', SLUG_ENTRY_COLUMNS, {
        hide: (row) => stale && row.slug === first.result.id,
      })
      let inserts = 0
      const store = prismaStore({ delegate, queryRaw: rawOf(tx) })
      const insert = store.insert as NonNullable<SlugStore['insert']>
      const res = await s.createUnique('Garden Party Invitation', {
        store: {
          ...store,
          insert: (r, c) => {
            stale = false
            inserts++
            return insert(r, c)
          },
        },
      })
      const n = (await tx.query<{ n: number }>('select count(*)::int n from slug_entry')).rows[0]?.n
      return { res, inserts, n }
    })
    expect(out.inserts).toBe(2)
    expect(out.res.result.id).not.toBe(first.result.id)
    expect(out.n).toBe(2)
    expect((await db.query('select slug from slug_entry')).rows).toHaveLength(2)
  })

  it('slug as columns on the entity table: retry the whole transaction (README recipe)', async () => {
    const s = createSlugger()
    let stale = true
    let rounds = 0
    const create = async (title: string, scope: string) => {
      const tried = new Set<string>()
      for (let r = 0; r < 5; r++) {
        let last = ''
        rounds++
        try {
          return await db.transaction(async (tx) => {
            const hideFirst = stale
            const document = fakeDelegate(queryOf(tx), 'document', DOCUMENT_COLUMNS, {
              hide: () => hideFirst,
            })
            const res = await s.generate(title, {
              store: prismaStore({
                delegate: document,
                fields: { slug: 'slug', body: 'slugBody', stems: 'slugStems', retiredAt: null },
                scopeWhere: (t) => ({ tenantId: t }),
              }),
              scope,
              exclude: tried,
            })
            last = res.id
            return document.create({
              data: { tenantId: scope, title, slug: res.id, slugBody: res.body, slugStems: [...res.stems] },
            })
          })
        } catch (e) {
          if (isUniqueViolation(e, 'slug')) {
            tried.add(last)
            stale = false
            continue
          }
          throw e
        }
      }
      throw new Error('no slug after 5 rounds')
    }
    stale = false
    const a = await create('Team Offsite Planning', 'tenant-1')
    stale = true
    const b = await create('Team Offsite Planning', 'tenant-1')
    expect(rounds).toBe(3)
    expect(b.slug).not.toBe(a.slug)
    // the first copy may be body-only with a fill segment (quality round 1); the copy keeps its content
    expect(String(a.slugBody).startsWith(String(b.slugBody))).toBe(true)
    const c = await create('Team Offsite Planning', 'tenant-2')
    expect(c.slug).toBe(a.slug)
  })
})

describe('ID parity with the memory store (tier C)', () => {
  it('the whole fixture corpus in order gives the same IDs as the memory store', async () => {
    const s = createSlugger()
    const store = prismaStore({ delegate: entries(), queryRaw: rawOf() })
    const mem = memoryStore()
    const titles = loadFixtures().map((f) => f.title)
    for (const t of titles) {
      const x = await s.createUnique(t, { store })
      const y = await s.createUnique(t, { store: mem })
      expect(x.result.id, t).toBe(y.result.id)
      expect(x.result.storeTier).toBe('C')
    }
  }, 120_000)
})
