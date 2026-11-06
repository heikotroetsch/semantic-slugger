/**
 * SQL adapter on PGlite (SPEC 17.3, 19.4): every store method, the DDL of `sqlSchema()`, scopes,
 * retired rows, column mapping, identifier checks, and ID parity with the memory store (tier C).
 */
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadFixtures } from '../../scripts/lib/corpus.ts'
import { memoryStore } from '../../src/adapters/memory.ts'
import { sqlSchema, sqlStore } from '../../src/adapters/sql.ts'
import { ConfigError, createSlugger, isSluggerError, type SlugRecord, StoreError } from '../../src/index.ts'
import { newDb, queryOf } from '../helpers/pglite.ts'

const ctx = { scope: '' }
const rec = (id: string, body: string, stems: string[] = []): SlugRecord => ({
  id,
  body,
  stems,
  titleKey: '0123456789abcdef',
  algorithm: 1,
})

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

describe('sqlSchema (SPEC 17.3)', () => {
  it('examples/sql/schema.sql is the output of sqlSchema()', () => {
    const file = readFileSync(new URL('../../examples/sql/schema.sql', import.meta.url), 'utf8')
    expect(file).toBe(sqlSchema())
  })

  it('the check matches I2 for each separator', async () => {
    const cases = [
      { sep: '-', ok: ['ab-cd', 'a1-2b', 'abc'], bad: ['ab_cd', 'ab--cd', 'ab-', '1ab', 'Ab', 'ab-_c'] },
      { sep: '_', ok: ['ab_cd', 'a1_2b', 'abc'], bad: ['ab-cd', 'ab__cd', 'ab_', '_ab'] },
      { sep: '', ok: ['abcd', 'a12'], bad: ['ab-cd', 'ab_cd', '1ab'] },
    ] as const
    for (const [i, c] of cases.entries()) {
      const table = `sep_${i}`
      await db.exec(sqlSchema({ separator: c.sep }, { table }))
      const ins = (slug: string) =>
        db.query(`insert into "${table}" (scope, slug, body, title_key, algorithm) values ('', $1, '', '', 1)`, [slug])
      for (const s of c.ok) await expect(ins(s), `${c.sep} ${s}`).resolves.toBeDefined()
      for (const s of c.bad) await expect(ins(s), `${c.sep} ${s}`).rejects.toMatchObject({ code: '23514' })
      await expect(ins(`a${'b'.repeat(64)}`)).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('schema-qualified tables, and bad input', async () => {
    await db.exec('create schema app')
    await db.exec(sqlSchema({}, { table: 'app.slug_entry' }))
    const s = sqlStore({ query: queryOf(db), table: 'app.slug_entry' })
    expect(await s.insert(rec('alpha', 'alpha'), ctx)).toBe('inserted')
    expect(await s.exists('alpha', ctx)).toBe(true)
    expect(sqlSchema({}, { table: 'app.slug_entry' })).toContain('create table "app"."slug_entry"')
    expect(() => sqlSchema({ separator: '.' as never })).toThrow(ConfigError)
    expect(() => sqlSchema({}, { table: 'x; drop table y' })).toThrow(ConfigError)
    // a slugger config can be passed as is
    expect(sqlSchema(createSlugger({ separator: '_' }).config)).toContain('(_[a-z0-9]+)*$')
  })
})

describe('sqlStore (SPEC 17.3)', () => {
  it('answers every method from the table', async () => {
    const s = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    expect(await s.insert(rec('kuchen-rezept', 'kuchen-rezept', ['rezept', 'kuchen']), ctx)).toBe('inserted')
    expect(await s.insert(rec('kuchen-rezept-ab', 'kuchen-rezept', ['kuchen', 'rezept', 'schoko']), ctx)).toBe(
      'inserted',
    )
    expect(await s.insert(rec('kuchen-rezept-cd', 'kuchen-rezept', ['kuchen']), ctx)).toBe('inserted')
    expect(await s.insert(rec('kuchen-rezept', 'other'), ctx)).toBe('conflict')

    expect(await s.exists('kuchen-rezept', ctx)).toBe(true)
    expect(await s.exists('nope', ctx)).toBe(false)
    expect([...(await s.existsMany(['kuchen-rezept-ab', 'nope', 'kuchen-rezept'], ctx))].sort()).toEqual([
      'kuchen-rezept',
      'kuchen-rezept-ab',
    ])
    expect(await s.existsMany([], ctx)).toEqual([])
    expect(await s.countBodies(['kuchen-rezept', 'other'], ctx)).toEqual(new Map([['kuchen-rezept', 3]]))
    expect(await s.countBodies([], ctx)).toEqual(new Map())
    expect(await s.countStems(['kuchen', 'rezept', 'schoko', 'brot'], ctx)).toEqual(
      new Map([
        ['kuchen', 3],
        ['rezept', 2],
        ['schoko', 1],
      ]),
    )
    expect(await s.countStems([], ctx)).toEqual(new Map())
    expect(await s.total(ctx)).toBe(3)
    expect(await s.findByBody('kuchen-rezept', ctx, 2)).toEqual([
      { id: 'kuchen-rezept', stems: ['kuchen', 'rezept'] },
      { id: 'kuchen-rezept-ab', stems: ['kuchen', 'rezept', 'schoko'] },
    ])
    expect(await s.findByBody('none', ctx, 20)).toEqual([])
  })

  it('stems are stored unique and sorted', async () => {
    const s = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    await s.insert(rec('abc', 'abc', ['z', 'a', 'z']), ctx)
    expect((await db.query('select stems from slug_entry')).rows).toEqual([{ stems: ['a', 'z'] }])
  })

  it('scopes never mix (13.3)', async () => {
    const s = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    const a = { scope: 'tenant-a' }
    const b = { scope: 'tenant-b' }
    expect(await s.insert(rec('shared', 'shared', ['x']), a)).toBe('inserted')
    expect(await s.insert(rec('shared', 'shared', ['x']), b)).toBe('inserted')
    expect(await s.insert(rec('only-a', 'only-a', ['x']), a)).toBe('inserted')
    expect(await s.total(a)).toBe(2)
    expect(await s.total(b)).toBe(1)
    expect(await s.total(ctx)).toBe(0)
    expect(await s.countStems(['x'], b)).toEqual(new Map([['x', 1]]))
    expect(await s.exists('only-a', b)).toBe(false)
    expect(await s.findByBody('shared', b, 20)).toHaveLength(1)
  })

  it('retired rows stay taken but leave df and total, as in the memory store', async () => {
    const s = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    const m = memoryStore()
    for (const r of [rec('alpha', 'alpha', ['a']), rec('alpha-xy', 'alpha', ['a', 'b'])]) {
      await s.insert(r, ctx)
      m.insert(r, ctx)
    }
    await db.query(`update slug_entry set retired_at = now() where slug = 'alpha'`)
    m.retire('alpha')
    for (const store of [s, m]) {
      expect(await store.exists('alpha', ctx)).toBe(true)
      expect(await store.countBodies(['alpha'], ctx)).toEqual(new Map([['alpha', 2]]))
      expect(await store.findByBody('alpha', ctx, 20)).toHaveLength(2)
      expect(await store.total(ctx)).toBe(1)
      expect(await store.countStems(['a', 'b'], ctx)).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
        ]),
      )
    }
  })

  it('column mapping on an entity table without a retired column, with an insert callback', async () => {
    await db.exec(`create table if not exists document (
      id serial primary key, tenant_id text not null, title text not null,
      slug text not null, slug_body text not null, slug_stems text[] not null default '{}',
      unique (tenant_id, slug))`)
    await db.exec('truncate document')
    const store = sqlStore({
      query: queryOf(db),
      table: 'document',
      columns: { scope: 'tenant_id', body: 'slug_body', stems: 'slug_stems', retiredAt: null },
    })
    const s = createSlugger()
    const make = (title: string) =>
      s.createUnique(title, {
        store,
        scope: 't1',
        insert: async (r) =>
          (
            await db.query<{ id: number }>(
              'insert into document (tenant_id, title, slug, slug_body, slug_stems) values ($1, $2, $3, $4, $5) returning id',
              ['t1', title, r.id, r.body, [...r.stems]],
            )
          ).rows[0]?.id,
      })
    const one = await make('Quarterly Sales Review')
    const two = await make('Quarterly Sales Review')
    expect(one.record).toBe(1)
    expect(two.record).toBe(2)
    expect(two.result.id).not.toBe(one.result.id)
    expect(two.result.body).toBe(one.result.body)
    expect(two.result.storeTier).toBe('C')
    expect(await store.total({ scope: 't1' })).toBe(2)
  })

  it('accepts drivers that return the rows as an array (postgres.js, $queryRawUnsafe)', async () => {
    const q = queryOf(db)
    const s = sqlStore({ query: async (t, v) => (await q(t, v)).rows, table: 'slug_entry' })
    expect(await s.insert(rec('beta', 'beta', ['b']), ctx)).toBe('inserted')
    expect(await s.countStems(['b'], ctx)).toEqual(new Map([['b', 1]]))
    expect(await s.total(ctx)).toBe(1)
  })

  it('checks options; driver errors become StoreError in generate', async () => {
    expect(() => sqlStore({ query: queryOf(db), table: 'slug entry' })).toThrow(ConfigError)
    expect(() => sqlStore({ query: queryOf(db), table: 'a.b.c' })).toThrow(ConfigError)
    expect(() => sqlStore({ query: queryOf(db), table: 'ok', columns: { slug: 'sl"ug' } })).toThrow(ConfigError)
    expect(() => sqlStore({ query: queryOf(db), table: 'ok', columns: { retiredAt: '' } })).toThrow(ConfigError)
    expect(() => sqlStore({ table: 'ok' } as never)).toThrow(ConfigError)
    try {
      sqlStore({ query: queryOf(db), table: '1x' })
    } catch (e) {
      expect((e as ConfigError).details?.reason).toBe('invalid-identifier')
    }
    const missing = sqlStore({ query: queryOf(db), table: 'no_such_table' })
    const e = await createSlugger()
      .generate('Garden Party Invitation', { store: missing })
      .catch((x: unknown) => x)
    expect(e).toBeInstanceOf(StoreError)
    expect(isSluggerError(e, 'E_STORE')).toBe(true)
    expect((e as StoreError).cause).toMatchObject({ code: '42P01' })
  })

  it('a unique violation other than (scope, slug) is a StoreError, not a lost race', async () => {
    await db.exec(`create table if not exists strict_entry (
      scope text not null, slug text not null, body text not null, stems text[] not null default '{}',
      title_key text not null unique, algorithm smallint not null, retired_at timestamptz,
      unique (scope, slug))`)
    const s = sqlStore({ query: queryOf(db), table: 'strict_entry' })
    expect(await s.insert(rec('one', 'one'), ctx)).toBe('inserted')
    const e = await createSlugger()
      .createUnique('Two', {
        store: { ...s, insert: (r, c) => s.insert({ ...r, titleKey: '0123456789abcdef' }, c) },
      })
      .catch((x: unknown) => x)
    expect(e).toBeInstanceOf(StoreError)
    expect((e as StoreError).cause).toMatchObject({ code: '23505' })
  })
})

describe('ID parity with the memory store (tier C)', () => {
  it('the whole fixture corpus in order gives the same IDs as the memory store', async () => {
    const s = createSlugger()
    const sql = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    const mem = memoryStore()
    const titles = loadFixtures().map((f) => f.title)
    const a: string[] = []
    const b: string[] = []
    for (const t of titles) {
      const x = await s.createUnique(t, { store: sql })
      const y = await s.createUnique(t, { store: mem })
      expect(x.result.storeTier).toBe('C')
      a.push(x.result.id)
      b.push(y.result.id)
    }
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(titles.length)
    expect(await sql.total(ctx)).toBe(titles.length)
  }, 120_000)

  it('the same title 40 times: same IDs, the tail index walks 0, 1, 2, ...', async () => {
    const s = createSlugger()
    const sql = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    const mem = memoryStore()
    const a: string[] = []
    const b: string[] = []
    const k: number[] = []
    for (let i = 0; i < 40; i++) {
      const x = (await s.createUnique('Weekly Team Sync', { store: sql, scope: 'w' })).result
      a.push(x.id)
      k.push(x.tailIndex)
      b.push((await s.createUnique('Weekly Team Sync', { store: mem, scope: 'w' })).result.id)
    }
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(40)
    expect(k).toEqual(Array.from({ length: 40 }, (_, i) => i))
  })

  it('a sibling that differs re-picks (tier C) as with the memory store', async () => {
    const s = createSlugger()
    const sql = sqlStore({ query: queryOf(db), table: 'slug_entry' })
    const mem = memoryStore()
    for (const t of ['Jahresbericht Vertrieb Nord 2026', 'Jahresbericht Vertrieb Süd 2026']) {
      const x = await s.createUnique(t, { store: sql })
      const y = await s.createUnique(t, { store: mem })
      expect(x.result.id).toBe(y.result.id)
      expect(x.result.reason).toBe(y.result.reason)
    }
  })
})
