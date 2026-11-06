/**
 * createSlugger and the Slugger instance (SPEC 16.1). M1 ships config validation, the ID pattern,
 * the config fingerprint and `isValid`. The generating methods follow with the pipeline (M4, M5).
 */

import { fingerprint, type ResolvedConfig, resolveConfig, type SluggerConfig } from './config.ts'
import { isValidSlugResolved, patternFor } from './core/invariants.ts'

export interface Slugger {
  readonly config: ResolvedConfig
  /** Pattern every ID of this config matches (I2). */
  readonly pattern: RegExp
  /** 16 hex chars over the resolved config (SPEC 14.2 item 9). */
  readonly fingerprint: string
  /** Same as isValidSlug(id, config). */
  isValid(id: string): boolean
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
