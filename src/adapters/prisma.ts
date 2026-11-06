/**
 * "semantic-slugger/adapters/prisma" (SPEC 17.2): a tier C store on a Prisma model delegate
 * (`prisma.slugEntry` or `tx.slugEntry` inside an interactive `$transaction`). No import of
 * `@prisma/client`: the delegate is typed by structure only. Needs Postgres (`String[]` with `has`).
 *
 * Inserts use `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`), so a lost race never
 * aborts the transaction (`25P02`).
 */

import type { SlugRecord, StoreContext } from '../core/resolve.ts'
import { isUniqueViolation } from '../core/unique.ts'
import { ConfigError, StoreError } from '../errors.ts'
import {
  countMap,
  type DbSlugStore,
  dfSql,
  quoteIdent,
  quoteTable,
  type Row,
  rowsOf,
  storedStems,
  strings,
  toCount,
} from './common.ts'

export type { DbSlugStore }

type Where = Record<string, unknown>

/** The model delegate methods the adapter calls (a structural subset of a Prisma model delegate). */
export interface PrismaSlugDelegate {
  count(args: { where: Where }): Promise<number>
  findMany(args: {
    where: Where
    select: Record<string, true>
    take?: number
    orderBy?: Record<string, 'asc' | 'desc'>
  }): Promise<Record<string, unknown>[]>
  createMany?(args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }): Promise<{ count: number }>
  groupBy?(args: { by: string[]; where: Where; _count: Record<string, true> }): Promise<Record<string, unknown>[]>
}

/** Prisma field names. `retiredAt: null` means the model has no retired field. */
export interface PrismaFields {
  scope: string
  slug: string
  body: string
  stems: string
  titleKey: string
  algorithm: string
  /** Rows with a value here are retired: they stay taken but leave df and total (as in the memory store). */
  retiredAt: string | null
}

export interface PrismaStoreOptions {
  readonly delegate: PrismaSlugDelegate
  /**
   * Optional raw query for df in one statement, for example `(sql, v) => tx.$queryRawUnsafe(sql, ...v)`.
   * It uses `table` and the column names `fields.scope`, `fields.stems` and the retired column
   * (`retired_at` by default, else `fields.retiredAt`). Fields with a different `@map` name need `fields`
   * set to the column name.
   */
  readonly queryRaw?: (sql: string, values: unknown[]) => Promise<unknown[]>
  /** Table for `queryRaw`; default `slug_entry`, checked as in SPEC 17.3. */
  readonly table?: string
  /** Defaults: `scope`, `slug`, `body`, `stems`, `titleKey`, `algorithm`, `retiredAt`. */
  readonly fields?: Partial<PrismaFields>
  /** Overrides `fields.scope`, for example `(s) => ({ tenantId: s })`. Also spread into inserted rows. */
  readonly scopeWhere?: (scope: string) => Record<string, unknown>
  /** More data for each inserted row (required columns of your model). */
  readonly extraData?: (rec: SlugRecord, scope: string) => Record<string, unknown>
}

/** The store `prismaStore()` returns. `insert` is there only when the delegate has `createMany`. */
export interface PrismaStore extends DbSlugStore {
  isConflict(error: unknown): boolean
}

const DEFAULT_FIELDS: PrismaFields = {
  scope: 'scope',
  slug: 'slug',
  body: 'body',
  stems: 'stems',
  titleKey: 'titleKey',
  algorithm: 'algorithm',
  retiredAt: 'retiredAt',
}

/**
 * true for a Prisma unique violation (`P2002`, optionally on `field`). Also accepts Postgres `23505`
 * in the error or its `cause` chain, which driver adapters and `$queryRaw` errors carry.
 */
export function isPrismaUniqueViolation(e: unknown, field?: string): boolean {
  return isUniqueViolation(e, field)
}

/** A tier C `SlugStore` on a Prisma model delegate (SPEC 17.2). */
export function prismaStore(o: PrismaStoreOptions): PrismaStore {
  const d = o?.delegate
  if (typeof d !== 'object' || d === null || typeof d.count !== 'function' || typeof d.findMany !== 'function')
    throw new ConfigError('prismaStore needs a delegate with count() and findMany()', {
      field: 'delegate',
      value: d,
      reason: 'invalid-store',
    })
  const f: PrismaFields = { ...DEFAULT_FIELDS, ...o.fields }
  for (const k of ['scope', 'slug', 'body', 'stems', 'titleKey', 'algorithm'] as const)
    if (typeof f[k] !== 'string' || f[k] === '')
      throw new ConfigError(`fields.${k} must be a field name`, {
        field: `fields.${k}`,
        value: f[k],
        reason: 'invalid-identifier',
      })
  const scopeWhere = o.scopeWhere ?? ((s: string): Where => ({ [f.scope]: s }))
  const live: Where = f.retiredAt === null ? {} : { [f.retiredAt]: null }

  let raw: ((stems: readonly string[], scope: string) => Promise<Row[]>) | undefined
  const queryRaw = o.queryRaw
  if (queryRaw !== undefined) {
    const retiredColumn = o.fields?.retiredAt === undefined ? 'retired_at' : f.retiredAt
    const text = dfSql(
      quoteTable(o.table ?? 'slug_entry', 'table'),
      quoteIdent(f.scope, 'fields.scope'),
      quoteIdent(f.stems, 'fields.stems'),
      retiredColumn === null ? null : quoteIdent(retiredColumn, 'fields.retiredAt'),
    )
    raw = async (stems, scope) => rowsOf(await queryRaw(text, [scope, [...stems]]))
  }

  const exists = async (id: string, ctx: StoreContext): Promise<boolean> =>
    (await d.count({ where: { ...scopeWhere(ctx.scope), [f.slug]: id } })) > 0

  const store: PrismaStore = {
    exists,
    async existsMany(ids: readonly string[], ctx: StoreContext) {
      if (ids.length === 0) return []
      const rows = await d.findMany({
        where: { ...scopeWhere(ctx.scope), [f.slug]: { in: [...ids] } },
        select: { [f.slug]: true },
      })
      return rows.map((r) => r[f.slug]).filter((s): s is string => typeof s === 'string')
    },
    async countBodies(bodies: readonly string[], ctx: StoreContext) {
      if (bodies.length === 0) return new Map<string, number>()
      if (typeof d.groupBy === 'function') {
        const rows = await d.groupBy({
          by: [f.body],
          where: { ...scopeWhere(ctx.scope), [f.body]: { in: [...bodies] } },
          _count: { _all: true },
        })
        return countMap(rows, f.body, (r) => (r._count as { _all?: unknown } | undefined)?._all)
      }
      const ns = await Promise.all(bodies.map((b) => d.count({ where: { ...scopeWhere(ctx.scope), [f.body]: b } })))
      return new Map(bodies.map((b, i) => [b, toCount(ns[i])]))
    },
    async countStems(stems: readonly string[], ctx: StoreContext) {
      if (stems.length === 0) return new Map<string, number>()
      if (raw !== undefined) return countMap(await raw(stems, ctx.scope), 's', (r) => r.n)
      const ns = await Promise.all(
        stems.map((s) => d.count({ where: { ...scopeWhere(ctx.scope), ...live, [f.stems]: { has: s } } })),
      )
      return new Map(stems.map((s, i) => [s, toCount(ns[i])]))
    },
    async total(ctx: StoreContext) {
      return toCount(await d.count({ where: { ...scopeWhere(ctx.scope), ...live } }))
    },
    async findByBody(body: string, ctx: StoreContext, limit: number) {
      const rows = await d.findMany({
        where: { ...scopeWhere(ctx.scope), [f.body]: body },
        select: { [f.slug]: true, [f.stems]: true },
        take: limit,
        orderBy: { [f.slug]: 'asc' },
      })
      return rows.map((r) => ({ id: String(r[f.slug]), stems: strings(r[f.stems]) }))
    },
    isConflict: (e: unknown) => isPrismaUniqueViolation(e),
  }

  const createMany = d.createMany
  if (typeof createMany === 'function') {
    store.insert = async (rec: SlugRecord, ctx: StoreContext) => {
      const row = {
        ...scopeWhere(ctx.scope),
        [f.slug]: rec.id,
        [f.body]: rec.body,
        [f.stems]: storedStems(rec.stems),
        [f.titleKey]: rec.titleKey,
        [f.algorithm]: rec.algorithm,
        ...o.extraData?.(rec, ctx.scope),
      }
      const { count } = await createMany.call(d, { data: [row], skipDuplicates: true })
      if (count > 0) return 'inserted'
      if (await exists(rec.id, ctx)) return 'conflict'
      // Another unique constraint skipped the row: never report that as a slug race.
      throw new StoreError(undefined, `insert of "${rec.id}" was skipped by a unique constraint other than the slug`, {
        reason: 'insert-blocked',
      })
    }
  }
  return store
}
