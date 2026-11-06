/**
 * In-memory store (SPEC 17.1), tier C. All methods are sync (allowed by `MaybePromise`). Used by the
 * adapter `semantic-slugger/adapters/memory` and by `slugMany()` as its internal body counter.
 *
 * Retired rows keep their ID taken: `exists`, `existsMany`, `countBody(ies)` and `findByBody` still see
 * them, so the tail index of later rows stays where it was. Document frequency (`countStem`) and
 * `total` count only rows that are not retired (rarity looks at live rows).
 */

import type { SlugRecord, SlugStore, StoreContext } from './resolve.ts'

export const MEMORY_CONFLICT: 'E_MEMORY_CONFLICT' = 'E_MEMORY_CONFLICT'

/** Thrown by `add()` when the ID is already in the scope. `isUniqueViolation` knows its code. */
export class MemoryConflictError extends Error {
  readonly code: typeof MEMORY_CONFLICT = MEMORY_CONFLICT
  constructor(id: string) {
    super(`id taken: ${id}`)
    this.name = 'MemoryConflictError'
  }
}

export type MemoryInit = string | (Partial<SlugRecord> & { id: string; scope?: string })

/** All methods of SlugStore, answered synchronously (SPEC 17.1). */
export interface MemoryStore extends Required<Omit<SlugStore, 'isConflict'>> {
  exists(id: string, ctx: StoreContext): boolean
  existsMany(ids: readonly string[], ctx: StoreContext): string[]
  countBody(body: string, ctx: StoreContext): number
  countBodies(bodies: readonly string[], ctx: StoreContext): Map<string, number>
  countStem(stem: string, ctx: StoreContext): number
  countStems(stems: readonly string[], ctx: StoreContext): Map<string, number>
  total(ctx: StoreContext): number
  findByBody(body: string, ctx: StoreContext, limit: number): { id: string; stems: readonly string[] }[]
  insert(rec: SlugRecord, ctx: StoreContext): 'inserted' | 'conflict'
  isConflict(e: unknown): boolean
  /** Add a row without the conflict answer of `insert`. `body` defaults to the id. Throws on a taken id. */
  add(rec: string | (Partial<SlugRecord> & { id: string }), scope?: string): void
  /** Mark a row retired. The id stays taken. Returns false when the id is not in the scope. */
  retire(id: string, scope?: string): boolean
  /** Rows in all scopes, retired rows included. */
  readonly size: number
  /** The rows of one scope, sorted by id (code-unit order). */
  snapshot(scope?: string): readonly SlugRecord[]
}

interface Row {
  readonly rec: SlugRecord
  retired: boolean
}

interface Scope {
  readonly byId: Map<string, Row>
  readonly byBody: Map<string, Set<string>>
  readonly df: Map<string, number>
  /** Rows that are not retired. */
  n: number
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new TypeError(`${what} must be a string`)
  return v
}

function toRecord(r: Partial<SlugRecord> & { id: string }): SlugRecord {
  const id = str(r.id, 'id')
  const stems = r.stems === undefined ? [] : [...r.stems].map((s) => str(s, 'stem'))
  return Object.freeze({
    id,
    body: r.body === undefined ? id : str(r.body, 'body'),
    stems: Object.freeze([...new Set(stems)].sort(cmp)),
    titleKey: r.titleKey === undefined ? '' : str(r.titleKey, 'titleKey'),
    algorithm: 1 as const,
  })
}

/** A tier C store held in memory (SPEC 17.1). */
export function memoryStore(init?: Iterable<MemoryInit>): MemoryStore {
  const scopes = new Map<string, Scope>()
  let size = 0

  const scopeOf = (name: string): Scope => {
    let s = scopes.get(name)
    if (s === undefined) {
      s = { byId: new Map(), byBody: new Map(), df: new Map(), n: 0 }
      scopes.set(name, s)
    }
    return s
  }
  const scopeName = (ctx: StoreContext | undefined): string => ctx?.scope ?? ''

  const countDf = (s: Scope, stems: readonly string[], d: number): void => {
    for (const st of stems) {
      s.df.set(st, (s.df.get(st) ?? 0) + d)
    }
  }

  /** Insert a row; false when the id is taken. */
  const put = (rec: SlugRecord, name: string): boolean => {
    const s = scopeOf(name)
    if (s.byId.has(rec.id)) return false
    s.byId.set(rec.id, { rec, retired: false })
    let ids = s.byBody.get(rec.body)
    if (ids === undefined) {
      ids = new Set()
      s.byBody.set(rec.body, ids)
    }
    ids.add(rec.id)
    countDf(s, rec.stems, 1)
    s.n++
    size++
    return true
  }

  const add = (rec: string | (Partial<SlugRecord> & { id: string }), scope = ''): void => {
    const r = toRecord(typeof rec === 'string' ? { id: rec } : rec)
    const name = str(scope, 'scope')
    if (!put(r, name)) throw new MemoryConflictError(r.id)
  }

  const countBody = (body: string, ctx: StoreContext): number => scopes.get(scopeName(ctx))?.byBody.get(body)?.size ?? 0
  const countStem = (stem: string, ctx: StoreContext): number => scopes.get(scopeName(ctx))?.df.get(stem) ?? 0

  const store: MemoryStore = {
    exists: (id, ctx) => scopes.get(scopeName(ctx))?.byId.has(id) === true,
    existsMany: (ids, ctx) => {
      const s = scopes.get(scopeName(ctx))
      return s === undefined ? [] : ids.filter((id) => s.byId.has(id))
    },
    countBody,
    countBodies: (bodies, ctx) => new Map(bodies.map((b) => [b, countBody(b, ctx)])),
    countStem,
    countStems: (stems, ctx) => new Map(stems.map((st) => [st, countStem(st, ctx)])),
    total: (ctx) => scopes.get(scopeName(ctx))?.n ?? 0,
    findByBody: (body, ctx, limit) => {
      const s = scopes.get(scopeName(ctx))
      const ids = s?.byBody.get(body)
      if (s === undefined || ids === undefined) return []
      return [...ids]
        .sort(cmp)
        .slice(0, limit)
        .map((id) => {
          const rec = (s.byId.get(id) as Row).rec
          return { id, stems: rec.stems }
        })
    },
    insert: (rec, ctx) => (put(toRecord(rec), scopeName(ctx)) ? 'inserted' : 'conflict'),
    isConflict: (e) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === MEMORY_CONFLICT,
    add,
    retire: (id, scope = '') => {
      const s = scopes.get(str(scope, 'scope'))
      const row = s?.byId.get(id)
      if (s === undefined || row === undefined) return false
      if (!row.retired) {
        row.retired = true
        countDf(s, row.rec.stems, -1)
        s.n--
      }
      return true
    },
    get size() {
      return size
    },
    snapshot: (scope = '') => {
      const s = scopes.get(str(scope, 'scope'))
      if (s === undefined) return Object.freeze([])
      return Object.freeze([...s.byId.values()].map((r) => r.rec).sort((a, b) => cmp(a.id, b.id)))
    },
  }

  for (const item of init ?? []) {
    if (typeof item === 'string') add(item)
    else {
      const { scope, ...rec } = item
      add(rec, scope ?? '')
    }
  }
  return store
}
