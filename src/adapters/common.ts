/**
 * Helpers shared by the SQL and Prisma adapters (SPEC 17.2, 17.3). Not a public entry point.
 * Identifiers are checked against a strict pattern and double-quoted; values are always `$n` parameters.
 */

import { RE_SQL_IDENT, RE_SQL_TABLE } from '../core/regexes.ts'
import type { SlugRecord, SlugStore, StoreContext } from '../core/resolve.ts'
import { ConfigError } from '../errors.ts'

export type Row = Record<string, unknown>

/** A tier C store with async methods, as the SQL and Prisma adapters return it. */
export interface DbSlugStore extends SlugStore {
  exists(id: string, ctx: StoreContext): Promise<boolean>
  existsMany(ids: readonly string[], ctx: StoreContext): Promise<string[]>
  countBodies(bodies: readonly string[], ctx: StoreContext): Promise<Map<string, number>>
  countStems(stems: readonly string[], ctx: StoreContext): Promise<Map<string, number>>
  total(ctx: StoreContext): Promise<number>
  findByBody(body: string, ctx: StoreContext, limit: number): Promise<{ id: string; stems: string[] }[]>
  insert?(rec: SlugRecord, ctx: StoreContext): Promise<'inserted' | 'conflict'>
}

/** `name` or `schema.name`, checked and quoted: `"schema"."name"`. */
export function quoteTable(table: unknown, field: string): string {
  if (typeof table !== 'string' || !RE_SQL_TABLE.test(table))
    throw new ConfigError(`${field} must be a table name like "slug_entry" or "app.slug_entry"`, {
      field,
      value: table,
      reason: 'invalid-identifier',
    })
  return table
    .split('.')
    .map((p) => `"${p}"`)
    .join('.')
}

/** One column name, checked and quoted. */
export function quoteIdent(name: unknown, field: string): string {
  if (typeof name !== 'string' || !RE_SQL_IDENT.test(name))
    throw new ConfigError(`${field} must be a column name like "slug"`, {
      field,
      value: name,
      reason: 'invalid-identifier',
    })
  return `"${name}"`
}

/**
 * Defaults merged with the user's names. An `undefined` entry keeps the default (a plain JS caller or a
 * TS project without `exactOptionalPropertyTypes` can pass one).
 */
export function withDefaults<T extends object>(defaults: T, given: Partial<T> | undefined): T {
  const out = { ...defaults }
  if (typeof given === 'object' && given !== null)
    for (const [k, v] of Object.entries(given)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

/** `{ rows }` (pg, PGlite) or a plain array (postgres.js, Prisma `$queryRawUnsafe`). */
export function rowsOf(r: unknown): Row[] {
  const rows = Array.isArray(r) ? r : (r as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows.filter((x) => typeof x === 'object' && x !== null) as Row[]) : []
}

/** A count from a driver: number, bigint or numeric string. Invalid values count 0. */
export function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' || typeof v === 'bigint' ? Number(v) : 0
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** String array from a driver value (`text[]`). Other values give []. */
export function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
}

/** Stems as stored: unique and sorted by code unit, as the memory store keeps them (SPEC 17.1). */
export function storedStems(stems: readonly string[]): string[] {
  return [...new Set(stems)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Map `{ [key]: k, [count]: n }` rows to a Map. */
export function countMap(rows: readonly Row[], key: string, count: (r: Row) => unknown): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = r[key]
    if (typeof k === 'string') m.set(k, toCount(count(r)))
  }
  return m
}

/**
 * Document frequency of stems in one statement (SPEC 17.3). `$1` scope, `$2` stems. Identifiers must be
 * quoted already. `retired` is the quoted retired column, or null when the table has none.
 */
export function dfSql(table: string, scope: string, stems: string, retired: string | null): string {
  return (
    `select s, count(*)::int n from ${table} e, unnest(e.${stems}) s ` +
    `where e.${scope} = $1 and e.${stems} && $2::text[] and s = any($2::text[])` +
    (retired === null ? '' : ` and e.${retired} is null`) +
    ' group by s'
  )
}
