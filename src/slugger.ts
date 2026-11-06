/**
 * createSlugger and the Slugger instance (SPEC 16.1): config validation, the ID pattern, the config
 * fingerprint, `isValid`, `analyze`, `suggest`, `slug`, `slugMany`, `generate` and `createUnique`.
 */

import { fingerprint, type Lang, type ResolvedConfig, resolveConfig, type SluggerConfig } from './config.ts'
import { type Analysis, analyzeDoc, analyzeTitle, type Doc } from './core/analyze.ts'
import { compile } from './core/compile.ts'
import { driveStore, driveSync, driveWith, storeCaps, syncStoreAnswer, type Taken } from './core/drivers.ts'
import { buildSteps, makeExplanation, type ReqLog, recorded } from './core/explain.ts'
import { fitBody } from './core/fit.ts'
import { isValidSlugResolved, patternFor } from './core/invariants.ts'
import { memoryStore } from './core/memory.ts'
import {
  type AbortSignalLike,
  type AnyAnswer,
  publicSegments,
  type Req,
  type ResolveOut,
  rankPool,
  resolveDoc,
  type SlugRecord,
  type SlugStore,
  type StoreContext,
} from './core/resolve.ts'
import { retryStart } from './core/tail.ts'
import { isUniqueViolation } from './core/unique.ts'
import { ConfigError, ConflictError, StoreError } from './errors.ts'
import type { Explanation, Segment, SlugResult, SlugWarning, StoreTier } from './result.ts'

/** Options of `analyze()`. */
export interface AnalyzeOptions {
  /** Per-call language; must be an enabled code. */
  readonly lang?: Lang
}

/** Options of `suggest()` and `slug()` (SPEC 16.2). */
export interface SuggestOptions {
  /** IDs already in use (tier A, SPEC 13.3). Without it the ID is not checked (`checked: false`). */
  readonly taken?: ReadonlySet<string> | ((id: string) => boolean)
  /** Per-call language; must be an enabled code. */
  readonly lang?: Lang
  /** IDs that must not be returned (they are never asked from `taken`). */
  readonly exclude?: Iterable<string>
}

/** Options of `generate()` (SPEC 16.2). */
export interface GenerateOptions {
  /** The store that holds the IDs of this scope. `exists` is required; more methods give tier B or C. */
  readonly store: SlugStore
  /** Default `''`. Counts and IDs never cross scopes. */
  readonly scope?: string
  /** Per-call language; must be an enabled code. */
  readonly lang?: Lang
  /** IDs that must not be returned (they are never asked from the store). */
  readonly exclude?: Iterable<string>
  /** Checked before every store request; its reason is rethrown as is. */
  readonly signal?: AbortSignalLike
  /** Attach the full `explain()` trace to the result as `trace` (SPEC 16.4). */
  readonly trace?: boolean
}

/** Options of `candidates()`. */
export interface CandidatesOptions {
  /** Per-call language; must be an enabled code. */
  readonly lang?: Lang
  /** Number of candidates, 1 to 16 (default 5). */
  readonly limit?: number
}

/** One body the fit search found (SPEC 12), best first. No store is asked. */
export interface BodyCandidate {
  /** The body (the ID without its tail). */
  readonly body: string
  /** Tail length this body needs (0: the body is the whole ID). */
  readonly tailLength: number
  /** Fit cost (SPEC 12); lower is better. */
  readonly cost: number
  /** Body segments (no tail segment). */
  readonly segments: readonly Segment[]
}

/** Options of `createUnique()` (SPEC 16.2, 13.5). */
export interface CreateUniqueOptions<T> extends GenerateOptions {
  /** Insert the row yourself; a unique violation (see `isConflict`) makes `createUnique` try again. */
  readonly insert?: (result: SlugResult) => Promise<T>
  /** Default: `store.isConflict`, else `isUniqueViolation`. */
  readonly isConflict?: (error: unknown) => boolean
  /**
   * Default 5. Without `retryKey`, n parallel calls for the same title can need up to n rounds: they all
   * compute the same next ID and one wins per round.
   */
  readonly maxInsertRetries?: number
  /**
   * A value unique to this call, for example the primary key of the new row. After a lost race the
   * retry scans a tail index range that depends on this key, so parallel calls for the same title try
   * different IDs (SPEC 13.5). It is not stored and not part of the ID.
   */
  readonly retryKey?: string
}

/** Result of `createUnique()`: `record` is what `insert` returned (undefined with `store.insert`). */
export interface CreateUniqueResult<T> {
  readonly result: SlugResult
  readonly record: T | undefined
}

export interface Slugger {
  readonly config: ResolvedConfig
  /** Pattern every ID of this config matches (I2). */
  readonly pattern: RegExp
  /** 16 hex chars over the resolved config (SPEC 14.2 item 9). */
  readonly fingerprint: string
  /** Same as isValidSlug(id, config). */
  isValid(id: string): boolean
  /**
   * Normalized title, language, tokens, concepts and stored stems (SPEC 16.1). Use `storedStems` to
   * backfill the `stems` of old rows. Throws InputError when the title is not a string.
   */
  analyze(title: string, opts?: AnalyzeOptions): Analysis
  /** Sync result without a store; `taken` gives tier A (SPEC 13.3). Throws InputError, ExhaustedError. */
  suggest(title: string, opts?: SuggestOptions): SlugResult
  /** The ID of `suggest()`. */
  slug(title: string, opts?: SuggestOptions): string
  /**
   * Sync batch: every title in order, unique within the batch (an internal memory store, tier C rules)
   * and against `taken`. Throws InputError, ExhaustedError.
   */
  slugMany(titles: Iterable<string>, opts?: SuggestOptions): SlugResult[]
  /** Store-backed result (SPEC 13.4). Rejects with InputError, ExhaustedError, StoreError, ConfigError. */
  generate(title: string, opts: GenerateOptions): Promise<SlugResult>
  /** generate + insert + retry on a lost race (SPEC 13.5). Rejects with ConflictError after the retries. */
  createUnique<T = undefined>(title: string, opts: CreateUniqueOptions<T>): Promise<CreateUniqueResult<T>>
  /** `suggest()` with the full trace of every step (SPEC 16.4). `toString()` gives a text table. */
  explain(title: string, opts?: SuggestOptions): Explanation
  /** The best bodies of the fit search, best first, without a store (SPEC 12). */
  candidates(title: string, opts?: CandidatesOptions): readonly BodyCandidate[]
}

/** Internal: the resolve output and the result of one sync call (corpus report, explain). */
export interface SuggestTrace {
  readonly result: SlugResult
  readonly out: ResolveOut
  readonly tier: StoreTier
  readonly doc: Doc
}

/** A sync store for tools and tests: answers every request kind (tier B or C). */
export interface SyncDriver {
  readonly answer: (req: Req) => AnyAnswer
  readonly tier: StoreTier
}

/**
 * Run the pipeline for one title with the sync driver (SPEC 13.4 drivers): tier `none`, tier A with
 * `taken`, or a custom sync store.
 */
export function suggestTrace(
  cfg: ResolvedConfig,
  fp: string,
  title: string,
  opts: SuggestOptions = {},
  driver?: SyncDriver,
  log?: ReqLog[],
): SuggestTrace {
  const doc = analyzeDoc(title, cfg, opts.lang === undefined ? {} : { lang: opts.lang })
  const exclude = new Set<string>(opts.exclude ?? [])
  const taken: Taken | undefined = opts.taken
  const plain = resolveDoc(doc, cfg, compile(cfg), exclude)
  const gen = log === undefined ? plain : recorded(plain, log)
  const { out, tier } =
    driver === undefined ? driveSync(gen, taken) : { out: driveWith(gen, driver.answer), tier: driver.tier }
  return { result: buildResult(doc, out, tier, fp), out, tier, doc }
}

/** `suggest()` with the trace (SPEC 16.4). */
export function explainWith(cfg: ResolvedConfig, fp: string, title: string, opts: SuggestOptions = {}): Explanation {
  const log: ReqLog[] = []
  const tr = suggestTrace(cfg, fp, title, opts, undefined, log)
  return makeExplanation(title, cfg, buildSteps(tr.doc, tr.out, log, tr.result), tr.result)
}

function limitOf(v: unknown): number {
  if (v === undefined) return 5
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 16)
    throw new ConfigError('limit must be an integer from 1 to 16', { field: 'limit', value: v, reason: 'out-of-range' })
  return v
}

/** The best bodies of the first fit, without a store (no df, nothing taken). */
export function candidatesWith(
  cfg: ResolvedConfig,
  title: string,
  opts: CandidatesOptions = {},
): readonly BodyCandidate[] {
  const limit = limitOf(opts.limit)
  const doc = analyzeDoc(title, cfg, opts.lang === undefined ? {} : { lang: opts.lang })
  if (cfg.leak === 'opaque' || doc.empty) return Object.freeze([])
  const { pool } = rankPool(doc, null, cfg, compile(cfg))
  let cands = fitBody(pool, cfg)
  if (cands.length === 0 && cfg.maxSegments > 1) cands = fitBody(pool, cfg, { maxSegments: 1 })
  return Object.freeze(
    cands.slice(0, limit).map((c) =>
      Object.freeze({
        body: c.body,
        tailLength: c.tailLen,
        cost: c.cost,
        segments: Object.freeze(publicSegments(c.segs).map((x) => Object.freeze(x))),
      }),
    ),
  )
}

/** The frozen public result (SPEC 16.3). */
export function buildResult(doc: Doc, out: ResolveOut, tier: StoreTier, fp: string): SlugResult {
  const warnings: SlugWarning[] = [...doc.front.warnings]
  if (out.tailGrown === true) warnings.push('tail-grown')
  return Object.freeze({
    id: out.id,
    body: out.body,
    tail: out.tail,
    segments: Object.freeze(out.segments.map((s) => Object.freeze({ ...s }))),
    stems: Object.freeze([...doc.storedStems]),
    titleKey: doc.titleKey,
    lang: doc.front.lang,
    reason: out.reason,
    tailIndex: out.tailIndex,
    storeTier: tier,
    checked: tier !== 'none',
    algorithm: 1 as const,
    configFingerprint: fp,
    warnings: Object.freeze(warnings),
  })
}

/** The record `store.insert` gets for a result (SPEC 13.3). */
export function toRecord(r: SlugResult): SlugRecord {
  return { id: r.id, body: r.body, stems: r.stems, titleKey: r.titleKey, algorithm: 1 }
}

function scopeOf(scope: unknown): string {
  if (scope === undefined) return ''
  if (typeof scope !== 'string')
    throw new ConfigError('scope must be a string', { field: 'scope', value: scope, reason: 'not-string' })
  return scope
}

function contextOf(o: GenerateOptions): StoreContext {
  const scope = scopeOf(o.scope)
  return o.signal === undefined ? { scope } : { scope, signal: o.signal }
}

/** Store-backed resolve (SPEC 13.4): one title, the async store driver. */
export async function generateTrace(
  cfg: ResolvedConfig,
  fp: string,
  title: string,
  o: GenerateOptions,
  spread = 0,
): Promise<SuggestTrace> {
  if (typeof o !== 'object' || o === null)
    throw new ConfigError('generate options with a store are required', {
      field: 'store',
      value: o,
      reason: 'invalid-store',
    })
  storeCaps(o.store)
  const ctx = contextOf(o)
  const doc = analyzeDoc(title, cfg, o.lang === undefined ? {} : { lang: o.lang })
  const plain = resolveDoc(doc, cfg, compile(cfg), new Set<string>(o.exclude ?? []), spread)
  const log: ReqLog[] | undefined = o.trace === true ? [] : undefined
  const gen = log === undefined ? plain : recorded(plain, log)
  const { out, tier } = await driveStore(gen, o.store, ctx, cfg)
  const result = buildResult(doc, out, tier, fp)
  if (log === undefined) return { result, out, tier, doc }
  const trace = makeExplanation(title, cfg, buildSteps(doc, out, log, result), result)
  return { result: Object.freeze({ ...result, trace }), out, tier, doc }
}

function retriesOf(v: unknown): number {
  if (v === undefined) return 5
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100)
    throw new ConfigError('maxInsertRetries must be an integer from 1 to 100', {
      field: 'maxInsertRetries',
      value: v,
      reason: 'out-of-range',
    })
  return v
}

/** generate + insert + retry (SPEC 13.5). */
export async function createUniqueWith<T>(
  cfg: ResolvedConfig,
  fp: string,
  title: string,
  o: CreateUniqueOptions<T>,
): Promise<CreateUniqueResult<T>> {
  if (typeof o !== 'object' || o === null)
    throw new ConfigError('createUnique options with a store are required', {
      field: 'store',
      value: o,
      reason: 'invalid-store',
    })
  storeCaps(o.store)
  const max = retriesOf(o.maxInsertRetries)
  const insert = o.insert
  if (insert === undefined && typeof o.store.insert !== 'function')
    throw new ConfigError('store.insert or insert callback required', {
      field: 'insert',
      value: undefined,
      reason: 'no-insert',
    })
  const retryKey = o.retryKey
  if (retryKey !== undefined && typeof retryKey !== 'string')
    throw new ConfigError('retryKey must be a string', { field: 'retryKey', value: retryKey, reason: 'not-string' })
  const ctx = contextOf(o)
  const storeConflict = o.store.isConflict
  const isConflict =
    o.isConflict ??
    (typeof storeConflict === 'function' ? (e: unknown) => storeConflict.call(o.store, e) : isUniqueViolation)
  const tried = new Set<string>(o.exclude ?? [])
  for (let r = 0; r < max; r++) {
    const spread = r > 0 && retryKey !== undefined ? retryStart(cfg, retryKey, r) : 0
    const { result } = await generateTrace(cfg, fp, title, { ...o, exclude: tried }, spread)
    if (insert !== undefined) {
      try {
        return { result, record: await insert(result) }
      } catch (e) {
        if (!isConflict(e)) throw e
      }
    } else {
      let got: 'inserted' | 'conflict'
      try {
        got = await (o.store.insert as NonNullable<SlugStore['insert']>)(toRecord(result), ctx)
      } catch (e) {
        if (ctx.signal?.aborted === true) throw ctx.signal.reason ?? e
        throw e instanceof StoreError ? e : new StoreError(e, 'store.insert failed')
      }
      if (got === 'inserted') return { result, record: undefined }
      if (got !== 'conflict') throw new StoreError(got, 'store.insert must return "inserted" or "conflict"')
    }
    tried.add(result.id) // stale read or lost race
  }
  throw new ConflictError({ tried: [...tried] })
}

/** Sync batch (SPEC 16.1): unique within the batch through an internal memory store, and against `taken`. */
export function slugManyWith(
  cfg: ResolvedConfig,
  fp: string,
  titles: Iterable<string>,
  opts: SuggestOptions = {},
): SlugResult[] {
  const mem = memoryStore()
  const ctx: StoreContext = { scope: '' }
  const inner = syncStoreAnswer(mem, ctx, cfg)
  const taken = opts.taken
  const isTaken: ((id: string) => boolean) | undefined =
    taken === undefined ? undefined : typeof taken === 'function' ? taken : (id) => taken.has(id)
  const answer = (req: Req): AnyAnswer => {
    const a = inner.answer(req)
    if (req.op !== 'exists' || isTaken === undefined) return a
    const out = new Set(a as ReadonlySet<string>)
    for (const id of req.ids) if (isTaken(id)) out.add(id)
    return out
  }
  const exclude = opts.exclude === undefined ? undefined : [...opts.exclude]
  const out: SlugResult[] = []
  for (const title of titles) {
    const tr = suggestTrace(
      cfg,
      fp,
      title,
      { ...(opts.lang !== undefined ? { lang: opts.lang } : {}), ...(exclude !== undefined ? { exclude } : {}) },
      { answer, tier: 'C' },
    )
    // the internal store only spans the batch: the IDs are checked against the outside only with `taken`
    const r = Object.freeze({ ...tr.result, checked: taken !== undefined })
    mem.add({ id: r.id, body: r.body, stems: r.stems, titleKey: r.titleKey })
    out.push(r)
  }
  return out
}

/** Validate the config, compile it and freeze the result. Throws ConfigError. */
export function createSlugger(config?: SluggerConfig): Slugger {
  const cfg = resolveConfig(config)
  const fp = fingerprint(cfg)
  return Object.freeze({
    config: cfg,
    pattern: patternFor(cfg.separator),
    fingerprint: fp,
    isValid: (id: string) => isValidSlugResolved(id, cfg),
    analyze: (title: string, opts?: AnalyzeOptions) =>
      analyzeTitle(title, cfg, opts?.lang === undefined ? {} : { lang: opts.lang }),
    suggest: (title: string, opts?: SuggestOptions) => suggestTrace(cfg, fp, title, opts).result,
    slug: (title: string, opts?: SuggestOptions) => suggestTrace(cfg, fp, title, opts).result.id,
    slugMany: (titles: Iterable<string>, opts?: SuggestOptions) => slugManyWith(cfg, fp, titles, opts),
    generate: async (title: string, opts: GenerateOptions) => (await generateTrace(cfg, fp, title, opts)).result,
    createUnique: <T = undefined>(title: string, opts: CreateUniqueOptions<T>) =>
      createUniqueWith<T>(cfg, fp, title, opts),
    explain: (title: string, opts?: SuggestOptions) => explainWith(cfg, fp, title, opts),
    candidates: (title: string, opts?: CandidatesOptions) => candidatesWith(cfg, title, opts),
  })
}

let defaultSlugger: Slugger | undefined
const sluggers = new WeakMap<object, Slugger>()

/** The default slugger, built on first use (nothing runs at module top level). */
export function getDefaultSlugger(): Slugger {
  if (!defaultSlugger) defaultSlugger = createSlugger()
  return defaultSlugger
}

function sluggerFor(config: SluggerConfig | undefined): Slugger {
  if (config === undefined) return getDefaultSlugger()
  let s = sluggers.get(config)
  if (!s) {
    s = createSlugger(config)
    sluggers.set(config, s)
  }
  return s
}

/**
 * Route and form check: length (I1), pattern (I2), first char (I3), not all digits (I4), ascii (I9)
 * and the blocklist. The tail position is unknown, so the tail alphabet (I5) is not checked.
 * Throws ConfigError for an invalid config.
 */
export function isValidSlug(id: string, config?: SluggerConfig): boolean {
  return sluggerFor(config).isValid(id)
}

/** Analyze a title with the default slugger (SPEC 16.1). */
export function analyze(title: string, opts?: AnalyzeOptions): Analysis {
  return getDefaultSlugger().analyze(title, opts)
}

/** Suggest an ID with the default slugger (SPEC 16.1). */
export function suggest(title: string, opts?: SuggestOptions): SlugResult {
  return getDefaultSlugger().suggest(title, opts)
}

/** The ID of `suggest()` with the default slugger (SPEC 16.1). */
export function slug(title: string, opts?: SuggestOptions): string {
  return getDefaultSlugger().slug(title, opts)
}

/** Sync batch with the default slugger (SPEC 16.1). */
export function slugMany(titles: Iterable<string>, opts?: SuggestOptions): SlugResult[] {
  return getDefaultSlugger().slugMany(titles, opts)
}

/** Store-backed result with the default slugger (SPEC 16.1). */
export function generate(title: string, opts: GenerateOptions): Promise<SlugResult> {
  return getDefaultSlugger().generate(title, opts)
}

/** `suggest()` with the full trace, default slugger (SPEC 16.4). */
export function explain(title: string, opts?: SuggestOptions): Explanation {
  return getDefaultSlugger().explain(title, opts)
}

/** generate + insert + retry with the default slugger (SPEC 13.5). */
export function createUnique<T = undefined>(
  title: string,
  opts: CreateUniqueOptions<T>,
): Promise<CreateUniqueResult<T>> {
  return getDefaultSlugger().createUnique(title, opts)
}
