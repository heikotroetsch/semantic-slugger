/**
 * Result types (SPEC 16.3) and the `explain()` trace types (SPEC 16.4).
 */

import type { ConceptClass, DetectedLang, ResolvedConfig } from './config.ts'

export interface Segment {
  text: string
  kind: 'word' | 'number' | 'code' | 'fallback' | 'tail'
  cls?: ConceptClass
  /** Ascii source word, for example 'vertrieb'. */
  source?: string
  rung?: 'lexicon' | 'full' | 'morph' | 'coda' | 'syll' | 'skeleton' | 'number'
  verbatim: boolean
}

export type SlugReason = 'base' | 'repick' | 'shared-body' | 'opaque' | 'empty'
export type StoreTier = 'none' | 'A' | 'B' | 'C'
export type SlugWarning = 'truncated' | 'script-dropped' | 'empty' | 'stopwords-relaxed' | 'tail-grown'

export interface SlugResult {
  id: string
  body: string
  tail: string
  segments: readonly Segment[]
  /** Store these for df and re-pick. */
  stems: readonly string[]
  titleKey: string
  lang: DetectedLang
  reason: SlugReason
  /** k of SPEC 13.1; 0 when there is no tail. */
  tailIndex: number
  storeTier: StoreTier
  /** false for suggest() without taken. */
  checked: boolean
  algorithm: 1
  configFingerprint: string
  warnings: readonly SlugWarning[]
  /** Set by `generate(title, { trace: true })` (SPEC 16.4). */
  trace?: Explanation
}

/** Why a word was removed (SPEC 16.4). `blocked`: a blocklist word (SPEC 9.2 B4). */
export type RemovedList = 'function' | 'conflict' | 'noise' | 'legal' | 'custom' | 'deny' | 'blocked'
export type NameSignalName = 'inner-caps' | 'acronym' | 'legal-form' | 'sentence-case' | 'lexicon'
export type RankExcludeWhy = 'weak' | 'below-100' | 'no-rung' | 'leak' | 'pool-full'
export type ResolveStatus = 'ok' | 'taken' | 'body-taken' | 'reserved' | 'blocked' | 'excluded'

/** One stage of the pipeline as `explain()` shows it (SPEC 16.4). */
export type Step =
  | { stage: 'normalize'; input: string; surface: string; canonical: string; removed: string[] }
  | {
      stage: 'language'
      lang: DetectedLang
      source: 'option' | 'hook' | 'heuristic' | 'default'
      scores: Readonly<Record<string, number>>
      reasons: string[]
    }
  | { stage: 'tokens'; tokens: { text: string; cls: string; lang: DetectedLang }[] }
  | { stage: 'phrases'; matches: { tokens: string[]; key: string }[] }
  | { stage: 'stopwords'; removed: { word: string; list: RemovedList }[]; weak: string[]; backoff?: string }
  | { stage: 'names'; names: { word: string; signal: NameSignalName }[] }
  | { stage: 'compounds'; splits: { word: string; parts: string[]; linkers: string[]; kept: string[] }[] }
  | { stage: 'concepts'; rows: { key: string; cls: ConceptClass; stems: string[]; tf: number; pos: number }[] }
  | {
      stage: 'rank'
      df: 'store' | 'static'
      N?: number
      rows: {
        key: string
        cls: string
        base: number
        rarity: number
        pos: number
        tf: number
        lex: number
        diff: number
        score: number
      }[]
      excluded: { key: string; why: RankExcludeWhy }[]
    }
  | {
      stage: 'ladders'
      rows: {
        key: string
        rungs: { text: string; kind: string; cost: number; plain: boolean }[]
        rejected: { text: string; rule: string }[]
      }[]
    }
  | {
      stage: 'fit'
      best: {
        id: string
        cost: number
        parts: { rungs: number; cryptic: number; lost: number; chunks: number; tail: number }
      }[]
    }
  | { stage: 'resolve'; tried: { id: string; status: ResolveStatus; detail?: string }[] }

/** Full trace of one call (SPEC 16.4). `toString()` gives a text table; `toJSON()` a plain object. */
export interface Explanation {
  readonly input: string
  readonly config: ResolvedConfig
  readonly steps: readonly Step[]
  readonly result: SlugResult
  toString(): string
  toJSON(): object
}
