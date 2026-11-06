/**
 * Store contract and the sans-IO request protocol of the resolver (SPEC 13.3, 13.4).
 * The full resolve generator follows in M5; M1 uses the protocol for the empty and opaque path.
 */

import type { Segment, SlugReason } from '../result.ts'

export type MaybePromise<T> = T | Promise<T>
export interface AbortSignalLike {
  readonly aborted: boolean
  readonly reason?: unknown
}
export interface StoreContext {
  readonly scope: string
  readonly signal?: AbortSignalLike
}

export interface SlugRecord {
  id: string
  /** '' for opaque, the fallback word for empty titles. */
  body: string
  /** Stored stems (SPEC 8.2): lexicon-free, plain or hashed. */
  stems: readonly string[]
  /** Hex SipHash(keyFor(cfg), canonical title), 16 hex chars. */
  titleKey: string
  algorithm: 1
}

export interface SlugStore {
  /** Required. true if the id is taken in this scope (including retired rows). */
  exists(id: string, ctx: StoreContext): MaybePromise<boolean>
  /** Returns the taken ids. */
  existsMany?(ids: readonly string[], ctx: StoreContext): MaybePromise<Iterable<string>>
  /** Rows in this scope with this exact body. Enables tier B. */
  countBody?(body: string, ctx: StoreContext): MaybePromise<number>
  countBodies?(
    bodies: readonly string[],
    ctx: StoreContext,
  ): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>
  /** Document frequency of a stored stem in this scope. Enables rarity ranking. */
  countStem?(stem: string, ctx: StoreContext): MaybePromise<number>
  countStems?(
    stems: readonly string[],
    ctx: StoreContext,
  ): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>
  total?(ctx: StoreContext): MaybePromise<number>
  /** Rows sharing a body, with their stored stems. Enables tier C (smart re-pick). Sorted by id asc. */
  findByBody?(
    body: string,
    ctx: StoreContext,
    limit: number,
  ): MaybePromise<readonly { id: string; stems: readonly string[] }[]>
  /** Write path for createUnique without an insert callback. */
  insert?(rec: SlugRecord, ctx: StoreContext): MaybePromise<'inserted' | 'conflict'>
  isConflict?(error: unknown): boolean
}

/** Requests the resolver yields to its driver (SPEC 13.4). */
export type Req =
  | { op: 'stats'; stems: string[] }
  | { op: 'countBodies'; bodies: string[] }
  | { op: 'findByBody'; body: string; limit: number }
  | { op: 'exists'; ids: string[] }

export interface Stats {
  df: ReadonlyMap<string, number>
  N?: number
}

/** Answers per request kind. `null` means the store cannot answer (lower tier). */
export interface ReqAnswer {
  stats: Stats | null
  countBodies: ReadonlyMap<string, number> | null
  findByBody: readonly { id: string; stems: readonly string[] }[] | null
  exists: ReadonlySet<string>
}

export interface ResolveOut {
  id: string
  body: string
  tail: string
  tailIndex: number
  reason: SlugReason
  segments: readonly Segment[]
}

/** The answer type for any request; drivers return the field that matches `req.op`. */
export type AnyAnswer = ReqAnswer[keyof ReqAnswer]
