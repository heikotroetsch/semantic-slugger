import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { PrismaSlugDelegate } from '../../src/adapters/prisma.ts'

export type Db = PGlite | Transaction
export type Query = (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/** A new in-process Postgres. */
export async function newDb(): Promise<PGlite> {
  return PGlite.create()
}

/** `query(text, values)` of a PGlite db or transaction, counting statements in `log`. */
export function queryOf(db: Db, log?: string[]): Query {
  return async (text, values) => {
    log?.push(text)
    return db.query<Record<string, unknown>>(text, values)
  }
}

/** Field to column map of the default `slug_entry` layout (examples/prisma/schema.prisma). */
export const SLUG_ENTRY_COLUMNS: Readonly<Record<string, string>> = {
  id: 'id',
  scope: 'scope',
  slug: 'slug',
  body: 'body',
  stems: 'stems',
  titleKey: 'title_key',
  algorithm: 'algorithm',
  createdAt: 'created_at',
  retiredAt: 'retired_at',
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A Prisma-like unique error, with the Postgres error as `cause` (as Prisma driver adapters do). */
function p2002(e: unknown, columns: Readonly<Record<string, string>>): Error {
  const detail = isObj(e) && typeof e.detail === 'string' ? e.detail : ''
  const cols = detail.startsWith('Key (') ? detail.slice(5, detail.indexOf(')')).split(', ') : []
  const fields = cols.map((c) => Object.keys(columns).find((k) => columns[k] === c) ?? c)
  return Object.assign(new Error(`Unique constraint failed on the fields: (${fields.join(', ')})`), {
    code: 'P2002',
    meta: { target: fields },
    cause: e,
  })
}

/** The fake's methods with the arguments the adapter sends. It is assignable to `PrismaSlugDelegate`. */
export interface FakeDelegate {
  count(args: { where: Obj }): Promise<number>
  findMany(args: { where: Obj; select: Obj; take?: number; orderBy?: Record<string, 'asc' | 'desc'> }): Promise<Obj[]>
  createMany(args: { data: Obj[]; skipDuplicates?: boolean }): Promise<{ count: number }>
  groupBy(args: { by: string[]; where: Obj; _count?: Obj }): Promise<Obj[]>
  create(args: { data: Obj }): Promise<Obj>
}
const _fits = (d: FakeDelegate): Required<PrismaSlugDelegate> => d

/**
 * A small fake of a Prisma model delegate on SQL (SPEC 19.4). It knows the `where` forms the adapter
 * sends: equality, `null`, `{ in }` and `{ has }`. `hide` drops rows from reads (a stale read).
 */
export function fakeDelegate(
  query: Query,
  table: string,
  columns: Readonly<Record<string, string>>,
  opts: { hide?: (row: Obj) => boolean } = {},
): FakeDelegate {
  const col = (f: string): string => {
    const c = columns[f]
    if (c === undefined) throw new Error(`Unknown argument \`${f}\``)
    return `"${c}"`
  }
  const where = (w: Obj, vals: unknown[]): string => {
    const parts: string[] = []
    for (const [k, v] of Object.entries(w)) {
      if (v === null) parts.push(`${col(k)} is null`)
      else if (isObj(v) && 'in' in v) {
        vals.push(v.in)
        parts.push(`${col(k)} = any($${vals.length})`)
      } else if (isObj(v) && 'has' in v) {
        vals.push(v.has)
        parts.push(`$${vals.length} = any(${col(k)})`)
      } else {
        vals.push(v)
        parts.push(`${col(k)} = $${vals.length}`)
      }
    }
    return parts.length > 0 ? ` where ${parts.join(' and ')}` : ''
  }
  const fieldsOf = (sel: Obj): string[] => Object.keys(sel).filter((k) => sel[k] === true)
  const all = Object.keys(columns)
  const read = async (w: Obj, extra = ''): Promise<Obj[]> => {
    const vals: unknown[] = []
    const sel = all.map((f) => `${col(f)} as "${f}"`).join(', ')
    const { rows } = await query(`select ${sel} from "${table}"${where(w, vals)}${extra}`, vals)
    return opts.hide ? rows.filter((r) => !opts.hide?.(r)) : rows
  }
  const insert = async (data: Obj, onConflict: string): Promise<Obj[]> => {
    const keys = Object.keys(data)
    const vals = keys.map((k) => data[k])
    const text =
      `insert into "${table}" (${keys.map(col).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})` +
      `${onConflict} returning ${all.map((f) => `${col(f)} as "${f}"`).join(', ')}`
    return (await query(text, vals)).rows
  }
  return {
    async count({ where: w }) {
      return (await read(w)).length
    },
    async findMany({ where: w, select, take, orderBy }) {
      const ord = orderBy
        ? ` order by ${Object.entries(orderBy)
            .map(([k, d]) => `${col(k)} collate "C" ${d}`)
            .join(', ')}`
        : ''
      const rows = await read(w, ord)
      const out = (take === undefined ? rows : rows.slice(0, take)).map((r) =>
        Object.fromEntries(fieldsOf(select).map((f) => [f, r[f]])),
      )
      return out
    },
    async groupBy({ by, where: w }) {
      const rows = await read(w)
      const m = new Map<string, Obj>()
      for (const r of rows) {
        const key = JSON.stringify(by.map((b) => r[b]))
        const g = m.get(key) ?? { ...Object.fromEntries(by.map((b) => [b, r[b]])), _count: { _all: 0 } }
        ;(g._count as { _all: number })._all++
        m.set(key, g)
      }
      return [...m.values()]
    },
    async createMany({ data, skipDuplicates }) {
      let count = 0
      for (const row of data) {
        try {
          count += (await insert(row, skipDuplicates === true ? ' on conflict do nothing' : '')).length
        } catch (e) {
          if (isObj(e) && e.code === '23505') throw p2002(e, columns)
          throw e
        }
      }
      return { count }
    },
    async create({ data }) {
      try {
        return (await insert(data, ''))[0] as Obj
      } catch (e) {
        if (isObj(e) && e.code === '23505') throw p2002(e, columns)
        throw e
      }
    },
  }
}
