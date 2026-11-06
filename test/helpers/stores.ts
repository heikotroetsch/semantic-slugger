import type { MemoryStore } from '../../src/adapters/memory.ts'
import type { SlugStore } from '../../src/index.ts'

/** Tier A view of a memory store: only `exists` and `insert`. */
export function existsOnly(m: MemoryStore): SlugStore {
  return { exists: (id, ctx) => m.exists(id, ctx), insert: (r, ctx) => m.insert(r, ctx) }
}

/** Tier B view: counts and df, no `findByBody`. */
export function noFind(m: MemoryStore): SlugStore {
  return {
    exists: (id, ctx) => m.exists(id, ctx),
    existsMany: (ids, ctx) => m.existsMany(ids, ctx),
    countBodies: (b, ctx) => m.countBodies(b, ctx),
    countStems: (s, ctx) => m.countStems(s, ctx),
    total: (ctx) => m.total(ctx),
    insert: (r, ctx) => m.insert(r, ctx),
  }
}

/** Tier C with single-key methods only and plain-record answers, all async. */
export function asyncSingles(m: MemoryStore): SlugStore & { calls: string[] } {
  const calls: string[] = []
  const later = <T>(op: string, v: T): Promise<T> => {
    calls.push(op)
    return Promise.resolve(v)
  }
  return {
    calls,
    exists: (id, ctx) => later('exists', m.exists(id, ctx)),
    countBody: (b, ctx) => later('countBody', m.countBody(b, ctx)),
    countStem: (s, ctx) => later('countStem', m.countStem(s, ctx)),
    total: (ctx) => later('total', m.total(ctx)),
    findByBody: (b, ctx, limit) => later('findByBody', m.findByBody(b, ctx, limit)),
    insert: (r, ctx) => later('insert', m.insert(r, ctx)),
  }
}

/** Tier C with batch methods that answer plain records (not Maps). */
export function recordAnswers(m: MemoryStore): SlugStore {
  return {
    exists: (id, ctx) => m.exists(id, ctx),
    existsMany: (ids, ctx) => new Set(m.existsMany(ids, ctx)),
    countBodies: (b, ctx) => Object.fromEntries(m.countBodies(b, ctx)),
    countStems: (s, ctx) => Object.fromEntries(m.countStems(s, ctx)),
    total: (ctx) => m.total(ctx),
    findByBody: (b, ctx, limit) => [...m.findByBody(b, ctx, limit)].reverse(),
    insert: (r, ctx) => m.insert(r, ctx),
  }
}
