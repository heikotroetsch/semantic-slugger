/**
 * createSlugger and the Slugger instance (SPEC 16.1): config validation, the ID pattern, the config
 * fingerprint, `isValid`, `analyze`, `suggest` and `slug`. The store-backed methods follow in M5.
 */

import { fingerprint, type Lang, type ResolvedConfig, resolveConfig, type SluggerConfig } from './config.ts'
import { type Analysis, analyzeDoc, analyzeTitle } from './core/analyze.ts'
import { compile } from './core/compile.ts'
import { driveSync, driveWith, type Taken } from './core/drivers.ts'
import { isValidSlugResolved, patternFor } from './core/invariants.ts'
import { type AnyAnswer, type Req, type ResolveOut, resolveDoc } from './core/resolve.ts'
import type { SlugResult, SlugWarning, StoreTier } from './result.ts'

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
}

/** Internal: the resolve output and the result of one sync call (corpus report, explain). */
export interface SuggestTrace {
  readonly result: SlugResult
  readonly out: ResolveOut
  readonly tier: StoreTier
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
): SuggestTrace {
  const doc = analyzeDoc(title, cfg, opts.lang === undefined ? {} : { lang: opts.lang })
  const exclude = new Set<string>(opts.exclude ?? [])
  const taken: Taken | undefined = opts.taken
  const gen = resolveDoc(doc, cfg, compile(cfg), exclude)
  const { out, tier } =
    driver === undefined ? driveSync(gen, taken) : { out: driveWith(gen, driver.answer), tier: driver.tier }
  const warnings: SlugWarning[] = [...doc.front.warnings]
  if (out.tailGrown === true) warnings.push('tail-grown')
  const result: SlugResult = Object.freeze({
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
  return { result, out, tier }
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
