/**
 * Drivers run the sans-IO resolver generators (SPEC 13.4).
 *
 * - `driveSync`: tier `none` without `taken`, tier `A` with `taken`.
 * - `driveWith`: any sync answer function (tests and tools).
 * - `driveStore`: a `SlugStore` (async or sync methods), tier A, B or C by the methods it has.
 * - `syncStoreAnswer`: an answer function for a store whose methods return plain values (the memory
 *   store); used by `slugMany` and the corpus tools with `driveWith`.
 *
 * Store mapping: `exists` -> `existsMany ?? exists x n`; `countBodies` -> `countBodies ?? countBody x n
 * ?? null`; `stats` -> `countStems ?? countStem x n ?? null` plus `total`; `findByBody` -> `findByBody
 * ?? null`. Calls for one request run in parallel, results are looked up by key. The signal is checked
 * before every request. Store errors become `StoreError { cause }`; an abort reason is rethrown as is.
 */

import type { ResolvedConfig } from '../config.ts'
import { ConfigError, InternalError, StoreError } from '../errors.ts'
import type { StoreTier } from '../result.ts'
import type { AnyAnswer, MaybePromise, Req, SlugStore, Stats, StoreContext } from './resolve.ts'

export type Taken = ReadonlySet<string> | ((id: string) => boolean)

function answerSync(req: Req, taken: Taken | undefined): AnyAnswer {
  if (req.op !== 'exists') return null
  if (!taken) return new Set<string>()
  const isTaken = typeof taken === 'function' ? taken : (id: string) => taken.has(id)
  return new Set(req.ids.filter((id) => isTaken(id)))
}

export function driveSync<T>(gen: Generator<Req, T, AnyAnswer>, taken?: Taken): { out: T; tier: StoreTier } {
  let step = gen.next()
  while (!step.done) step = gen.next(answerSync(step.value, taken))
  return { out: step.value, tier: taken ? 'A' : 'none' }
}

/** Run a resolver generator with an answer function (tests, tools and the sync store of the report). */
export function driveWith<T>(gen: Generator<Req, T, AnyAnswer>, answer: (req: Req) => AnyAnswer): T {
  let step = gen.next()
  while (!step.done) step = gen.next(answer(step.value))
  return step.value
}

// ---------------------------------------------------------------------------------------------
// Store driver
// ---------------------------------------------------------------------------------------------

/** The methods of a store, read once per store object (SPEC 13.4: the tier is fixed at the first call). */
interface Caps {
  readonly tier: StoreTier
  readonly existsMany: boolean
  readonly countBodies: boolean
  readonly countBody: boolean
  readonly countStems: boolean
  readonly countStem: boolean
  readonly total: boolean
  readonly findByBody: boolean
}

const capsCache = new WeakMap<object, Caps>()

const isFn = (v: unknown): boolean => typeof v === 'function'

/** Store methods present, and the tier they give (SPEC 13.3). Throws ConfigError for a store without `exists`. */
export function storeCaps(store: SlugStore): Caps {
  if (typeof store !== 'object' || store === null || !isFn((store as Partial<SlugStore>).exists))
    throw new ConfigError('store must be an object with an exists() method', {
      field: 'store',
      value: store,
      reason: 'invalid-store',
    })
  let caps = capsCache.get(store)
  if (caps === undefined) {
    const counts = isFn(store.countBodies) || isFn(store.countBody)
    const find = isFn(store.findByBody)
    caps = Object.freeze({
      tier: counts ? (find ? 'C' : 'B') : 'A',
      existsMany: isFn(store.existsMany),
      countBodies: isFn(store.countBodies),
      countBody: isFn(store.countBody),
      countStems: isFn(store.countStems),
      countStem: isFn(store.countStem),
      total: isFn(store.total),
      findByBody: find,
    })
    capsCache.set(store, caps)
  }
  return caps
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (typeof v === 'object' || typeof v === 'function') && v !== null && isFn((v as { then?: unknown }).then)
}

/** Apply f now when v is a plain value, else after it resolves. */
function then<T, U>(v: MaybePromise<T>, f: (t: T) => U): MaybePromise<U> {
  return isThenable(v) ? Promise.resolve(v).then(f) : f(v as T)
}

function isIterable(v: unknown): v is Iterable<unknown> {
  return typeof v === 'object' && v !== null && isFn((v as Iterable<unknown>)[Symbol.iterator])
}

function all<T>(vs: readonly MaybePromise<T>[]): MaybePromise<T[]> {
  return vs.some(isThenable) ? Promise.all(vs) : (vs as T[])
}

/** Look up a count from a Map or a plain record by key; missing or invalid values count 0. */
function countOf(m: ReadonlyMap<string, number> | Readonly<Record<string, number>> | null | undefined, k: string) {
  if (m === null || m === undefined) return 0
  const v = m instanceof Map ? m.get(k) : Object.hasOwn(m, k) ? (m as Readonly<Record<string, number>>)[k] : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function counts(
  keys: readonly string[],
  got: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): Map<string, number> {
  return new Map(keys.map((k) => [k, countOf(got, k)]))
}

/** Answer one request from the store (sync or async). */
function answerStore(
  req: Req,
  store: SlugStore,
  caps: Caps,
  ctx: StoreContext,
  cfg: Pick<ResolvedConfig, 'rarity'>,
): MaybePromise<AnyAnswer> {
  switch (req.op) {
    case 'exists': {
      if (req.ids.length === 0) return new Set<string>()
      if (caps.existsMany) {
        const ids = req.ids
        return then(store.existsMany?.(ids, ctx) as MaybePromise<Iterable<string>>, (got) => {
          if (!isIterable(got)) throw new StoreError(got, 'store.existsMany must return an iterable of ids')
          const asked = new Set(ids)
          const taken = new Set<string>()
          for (const id of got) if (asked.has(id)) taken.add(id)
          return taken
        })
      }
      // any truthy answer counts as taken (a row object, 1): never return an unchecked ID (13.3)
      return then(
        all(req.ids.map((id) => store.exists(id, ctx))),
        (bs) => new Set(req.ids.filter((_, i) => Boolean(bs[i]))),
      )
    }
    case 'countBodies': {
      if (caps.countBodies)
        return then(store.countBodies?.(req.bodies, ctx) as MaybePromise<ReadonlyMap<string, number>>, (got) =>
          counts(req.bodies, got),
        )
      if (caps.countBody)
        return then(all(req.bodies.map((b) => store.countBody?.(b, ctx) as MaybePromise<number>)), (ns) =>
          counts(req.bodies, new Map(req.bodies.map((b, i) => [b, ns[i] as number]))),
        )
      return null
    }
    case 'findByBody': {
      if (!caps.findByBody) return null
      return then(store.findByBody?.(req.body, ctx, req.limit) as MaybePromise<readonly unknown[]>, (rows) =>
        [...(rows ?? [])]
          .map((r) => {
            const o = r as { id?: unknown; stems?: unknown }
            const stems = Array.isArray(o.stems) ? o.stems.filter((s): s is string => typeof s === 'string') : []
            return { id: String(o.id), stems }
          })
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, req.limit),
      )
    }
    case 'stats': {
      if (cfg.rarity !== 'store' || !(caps.countStems || caps.countStem)) return null
      const stems = req.stems
      const df: MaybePromise<Map<string, number>> = caps.countStems
        ? then(store.countStems?.(stems, ctx) as MaybePromise<ReadonlyMap<string, number>>, (got) => counts(stems, got))
        : then(all(stems.map((s) => store.countStem?.(s, ctx) as MaybePromise<number>)), (ns) =>
            counts(stems, new Map(stems.map((s, i) => [s, ns[i] as number]))),
          )
      const total: MaybePromise<number | undefined> = caps.total
        ? (store.total?.(ctx) as MaybePromise<number>)
        : undefined
      return then(all<unknown>([df, total]), ([d, n]): Stats => {
        const N = typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
        return N === undefined ? { df: d as Map<string, number> } : { df: d as Map<string, number>, N }
      })
    }
  }
}

function abortReason(signal: StoreContext['signal']): unknown {
  if (signal?.reason !== undefined) return signal.reason
  const e = new Error('The operation was aborted')
  e.name = 'AbortError'
  return e
}

function checkSignal(ctx: StoreContext): void {
  if (ctx.signal?.aborted === true) throw abortReason(ctx.signal)
}

/** A store error becomes StoreError; when the signal was aborted, its reason is rethrown as is. */
function wrap(e: unknown, ctx: StoreContext): unknown {
  if (ctx.signal?.aborted === true) return abortReason(ctx.signal)
  return e instanceof StoreError ? e : new StoreError(e)
}

/** Run a resolver generator against a store (SPEC 13.4 `generate`). */
export async function driveStore<T>(
  gen: Generator<Req, T, AnyAnswer>,
  store: SlugStore,
  ctx: StoreContext,
  cfg: ResolvedConfig,
): Promise<{ out: T; tier: StoreTier }> {
  const caps = storeCaps(store)
  let step = gen.next()
  while (!step.done) {
    checkSignal(ctx)
    let ans: AnyAnswer
    try {
      ans = await answerStore(step.value, store, caps, ctx, cfg)
    } catch (e) {
      throw wrap(e, ctx)
    }
    checkSignal(ctx)
    step = gen.next(ans)
  }
  return { out: step.value, tier: caps.tier }
}

/** A sync answer function over a sync store (tools and tests: `suggestTrace` with a custom driver). */
export function syncStoreAnswer(
  store: SlugStore,
  ctx: StoreContext,
  cfg: Pick<ResolvedConfig, 'rarity'>,
): { answer: (req: Req) => AnyAnswer; tier: StoreTier } {
  const caps = storeCaps(store)
  return {
    tier: caps.tier,
    answer: (req) => {
      let ans: MaybePromise<AnyAnswer>
      try {
        ans = answerStore(req, store, caps, ctx, cfg)
      } catch (e) {
        throw wrap(e, ctx)
      }
      if (isThenable(ans)) throw new InternalError('sync driver got a promise from the store')
      return ans
    },
  }
}
