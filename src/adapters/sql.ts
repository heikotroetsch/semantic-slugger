/**
 * "semantic-slugger/adapters/sql" (SPEC 17.3): a tier C store on Postgres through any `query(text,
 * values)` function: `pg` (`pool.query`), PGlite (`db.query`), postgres.js (`sql.unsafe`) or Prisma
 * (`(t, v) => prisma.$queryRawUnsafe(t, ...v)`). No driver is imported.
 *
 * Values are always `$n` parameters. The table and column names are checked and double-quoted.
 * `sqlSchema()` gives the DDL of the default table layout. `isConflict` accepts a Postgres `23505` on
 * the slug column only (or one that names no column), so an insert callback that hits another unique
 * column (a title, an external key) does not look like a lost race.
 */

import type { SlugRecord, StoreContext } from '../core/resolve.ts'
import { isUniqueViolation } from '../core/unique.ts'
import { ConfigError } from '../errors.ts'
import {
  countMap,
  type DbSlugStore,
  dfSql,
  quoteIdent,
  quoteTable,
  rowsOf,
  storedStems,
  strings,
  toCount,
  withDefaults,
} from './common.ts'

export type { DbSlugStore }

/** Column names of the slug table. `retiredAt: null` means the table has no retired column. */
export interface SqlColumns {
  scope: string
  slug: string
  body: string
  stems: string
  titleKey: string
  algorithm: string
  /** Rows with a value here are retired: they stay taken but leave df and total (as in the memory store). */
  retiredAt: string | null
}

export interface SqlStoreOptions {
  /** Runs one statement with `$n` parameters. Returns `{ rows }` or the rows. */
  readonly query: (text: string, values: unknown[]) => Promise<{ rows: unknown[] } | unknown[]>
  /** `name` or `schema.name`. Checked against `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$`. */
  readonly table: string
  /** Defaults: `scope`, `slug`, `body`, `stems`, `title_key`, `algorithm`, `retired_at`. */
  readonly columns?: Partial<SqlColumns>
}

/** The store `sqlStore()` returns: every method of tier C plus `insert` and `isConflict`. */
export interface SqlStore extends DbSlugStore {
  insert(rec: SlugRecord, ctx: StoreContext): Promise<'inserted' | 'conflict'>
  /** `isUniqueViolation(error, columns.slug)`: only a violation on the slug column is a lost race. */
  isConflict(error: unknown): boolean
}

const DEFAULT_COLUMNS: SqlColumns = {
  scope: 'scope',
  slug: 'slug',
  body: 'body',
  stems: 'stems',
  titleKey: 'title_key',
  algorithm: 'algorithm',
  retiredAt: 'retired_at',
}

/** A tier C `SlugStore` on one Postgres table (SPEC 17.3). */
export function sqlStore(o: SqlStoreOptions): SqlStore {
  if (typeof o !== 'object' || o === null || typeof o.query !== 'function')
    throw new ConfigError('sqlStore needs a query(text, values) function', {
      field: 'query',
      value: o,
      reason: 'invalid-store',
    })
  const query = o.query
  const t = quoteTable(o.table, 'table')
  const c = withDefaults(DEFAULT_COLUMNS, o.columns)
  const scope = quoteIdent(c.scope, 'columns.scope')
  const slug = quoteIdent(c.slug, 'columns.slug')
  const body = quoteIdent(c.body, 'columns.body')
  const stems = quoteIdent(c.stems, 'columns.stems')
  const titleKey = quoteIdent(c.titleKey, 'columns.titleKey')
  const algorithm = quoteIdent(c.algorithm, 'columns.algorithm')
  const retired = c.retiredAt === null ? null : quoteIdent(c.retiredAt, 'columns.retiredAt')
  const live = retired === null ? '' : ` and ${retired} is null`

  const q = async (text: string, values: unknown[]) => rowsOf(await query(text, values))

  const sql = {
    exists: `select 1 from ${t} where ${scope} = $1 and ${slug} = $2 limit 1`,
    existsMany: `select ${slug} as slug from ${t} where ${scope} = $1 and ${slug} = any($2::text[])`,
    countBodies:
      `select ${body} as body, count(*)::int n from ${t} ` +
      `where ${scope} = $1 and ${body} = any($2::text[]) group by ${body}`,
    countStems: dfSql(t, scope, stems, retired),
    total: `select count(*)::int n from ${t} where ${scope} = $1${live}`,
    findByBody:
      `select ${slug} as slug, ${stems} as stems from ${t} ` +
      `where ${scope} = $1 and ${body} = $2 order by ${slug} collate "C" limit $3`,
    insert:
      `insert into ${t} (${scope}, ${slug}, ${body}, ${stems}, ${titleKey}, ${algorithm}) ` +
      `values ($1, $2, $3, $4, $5, $6) on conflict (${scope}, ${slug}) do nothing returning ${slug} as slug`,
  }

  return {
    isConflict: (e: unknown) => isUniqueViolation(e, c.slug),
    async exists(id: string, ctx: StoreContext) {
      return (await q(sql.exists, [ctx.scope, id])).length > 0
    },
    async existsMany(ids: readonly string[], ctx: StoreContext) {
      if (ids.length === 0) return []
      return (await q(sql.existsMany, [ctx.scope, [...ids]])).map((r) => r.slug).filter((s) => typeof s === 'string')
    },
    async countBodies(bodies: readonly string[], ctx: StoreContext) {
      if (bodies.length === 0) return new Map<string, number>()
      return countMap(await q(sql.countBodies, [ctx.scope, [...bodies]]), 'body', (r) => r.n)
    },
    async countStems(list: readonly string[], ctx: StoreContext) {
      if (list.length === 0) return new Map<string, number>()
      return countMap(await q(sql.countStems, [ctx.scope, [...list]]), 's', (r) => r.n)
    },
    async total(ctx: StoreContext) {
      return toCount((await q(sql.total, [ctx.scope]))[0]?.n)
    },
    async findByBody(b: string, ctx: StoreContext, limit: number) {
      return (await q(sql.findByBody, [ctx.scope, b, limit])).map((r) => ({
        id: String(r.slug),
        stems: strings(r.stems),
      }))
    },
    async insert(rec: SlugRecord, ctx: StoreContext) {
      const rows = await q(sql.insert, [
        ctx.scope,
        rec.id,
        rec.body,
        storedStems(rec.stems),
        rec.titleKey,
        rec.algorithm,
      ])
      // `on conflict (scope, slug)` only skips a slug conflict; any other unique violation throws.
      return rows.length > 0 ? 'inserted' : 'conflict'
    },
  }
}

/** The I2 pattern for a separator as a Postgres regex (SPEC 17.3). */
function slugCheck(separator: '-' | '_' | ''): string {
  return separator === '' ? '^[a-z][a-z0-9]*$' : `^[a-z][a-z0-9]*(${separator}[a-z0-9]+)*$`
}

/**
 * DDL of the default slug table (SPEC 17.3). The `check` matches the ID pattern of the configured
 * separator. `cfg` is a slugger config (or `slugger.config`); only `separator` is read.
 */
export function sqlSchema(
  cfg: { readonly separator?: '-' | '_' | '' } = {},
  o: { readonly table?: string } = {},
): string {
  const sep = cfg.separator ?? '-'
  if (sep !== '-' && sep !== '_' && sep !== '')
    throw new ConfigError('separator must be "-", "_" or ""', {
      field: 'separator',
      value: sep,
      reason: 'invalid-enum',
    })
  const name = o.table ?? 'slug_entry'
  const t = quoteTable(name, 'table')
  const base = name.slice(name.lastIndexOf('.') + 1)
  const ix = (suffix: string) => quoteIdent(`${base.slice(0, 63 - suffix.length)}${suffix}`, 'table')
  return [
    `-- semantic-slugger v1 slug table (separator ${JSON.stringify(sep)}). Generated by sqlSchema().`,
    `create table ${t} (`,
    '  id          uuid primary key default gen_random_uuid(),',
    '  scope       text not null,',
    `  slug        text not null check (slug ~ '${slugCheck(sep)}' and char_length(slug) <= 64),`,
    '  body        text not null,',
    "  stems       text[] not null default '{}',",
    '  title_key   text not null,',
    '  algorithm   smallint not null,',
    '  created_at  timestamptz not null default now(),',
    '  retired_at  timestamptz,',
    `  constraint ${ix('_scope_slug_uq')} unique (scope, slug)`,
    ');',
    `create index ${ix('_scope_body_ix')} on ${t} (scope, body);`,
    `create index ${ix('_stems_gin')} on ${t} using gin (stems);`,
    '',
  ].join('\n')
}
