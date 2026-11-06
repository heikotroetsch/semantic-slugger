/**
 * DB adapters without a database (SPEC 17.2, 17.3): the statements they send, driver value forms
 * (numeric strings, bigint, missing rows) and the Prisma `isConflict`.
 */
import { describe, expect, it } from 'vitest'
import { prismaStore } from '../../src/adapters/prisma.ts'
import { sqlSchema, sqlStore } from '../../src/adapters/sql.ts'

const ctx = { scope: 's1' }

describe('sqlStore statements', () => {
  it('quotes identifiers, passes values as parameters, and maps the columns', async () => {
    const sent: { text: string; values: unknown[] }[] = []
    const s = sqlStore({
      query: async (text, values) => {
        sent.push({ text, values })
        return { rows: [] }
      },
      table: 'app.Docs',
      columns: { scope: 'tenantId', stems: 'slugStems' },
    })
    await s.countStems(["it's"], ctx)
    expect(sent[0]?.text).toBe(
      'select s, count(*)::int n from "app"."Docs" e, unnest(e."slugStems") s where e."tenantId" = $1 and ' +
        'e."slugStems" && $2::text[] and s = any($2::text[]) and e."retired_at" is null group by s',
    )
    expect(sent[0]?.values).toEqual(['s1', ["it's"]])
    await s.insert({ id: 'a-b', body: 'a', stems: ['y', 'x'], titleKey: 'k', algorithm: 1 }, ctx)
    expect(sent[1]?.text).toContain('on conflict ("tenantId", "slug") do nothing')
    expect(sent[1]?.values).toEqual(['s1', 'a-b', 'a', ['x', 'y'], 'k', 1])
  })

  it('reads driver values in any common form', async () => {
    const answers: unknown[] = [
      [{ n: '7' }], // total as a numeric string
      { rows: [{ s: 'a', n: 3n }, { s: 'b', n: -1 }, { s: 9, n: 1 }, null] },
      { rows: [{ slug: 'x', stems: null }] },
      null, // a driver that returns nothing
      [{ slug: 'x' }, { slug: 5 }],
    ]
    const s = sqlStore({ query: async () => answers.shift() as never, table: 't' })
    expect(await s.total(ctx)).toBe(7)
    expect(await s.countStems(['a', 'b'], ctx)).toEqual(
      new Map([
        ['a', 3],
        ['b', 0],
      ]),
    )
    expect(await s.findByBody('x', ctx, 5)).toEqual([{ id: 'x', stems: [] }])
    expect(await s.total(ctx)).toBe(0)
    expect(await s.existsMany(['x'], ctx)).toEqual(['x'])
  })

  it('sqlSchema names indexes after the table name without its schema', () => {
    const ddl = sqlSchema({ separator: '' }, { table: 'app.ids' })
    expect(ddl).toContain('create index "ids_scope_body_ix" on "app"."ids" (scope, body);')
    expect(ddl).toContain("check (slug ~ '^[a-z][a-z0-9]*$'")
  })
})

describe('prismaStore without a database', () => {
  it('isConflict knows P2002; a count from groupBy may be missing', async () => {
    const s = prismaStore({
      delegate: {
        count: async () => 0,
        findMany: async () => [],
        groupBy: async () => [{ body: 'a' }, { body: 'b', _count: { _all: 2 } }],
      },
    })
    expect(s.isConflict({ code: 'P2002' })).toBe(true)
    expect(s.isConflict(new Error('x'))).toBe(false)
    expect(await s.countBodies(['a', 'b'], ctx)).toEqual(
      new Map([
        ['a', 0],
        ['b', 2],
      ]),
    )
  })

  it('scopeWhere and extraData shape the inserted row', async () => {
    const data: unknown[] = []
    const s = prismaStore({
      delegate: {
        count: async () => 0,
        findMany: async () => [],
        createMany: async (a) => {
          data.push(...a.data)
          return { count: 1 }
        },
      },
      scopeWhere: (t) => ({ tenantId: t }),
      extraData: (r) => ({ title: `T ${r.id}` }),
    })
    expect(await s.insert?.({ id: 'a-b', body: 'a', stems: ['b', 'a', 'b'], titleKey: 'k', algorithm: 1 }, ctx)).toBe(
      'inserted',
    )
    expect(data).toEqual([
      { tenantId: 's1', slug: 'a-b', body: 'a', stems: ['a', 'b'], titleKey: 'k', algorithm: 1, title: 'T a-b' },
    ])
  })
})
