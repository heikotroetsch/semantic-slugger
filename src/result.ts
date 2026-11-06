/**
 * Result types (SPEC 16.3). The result builder and Explanation follow with the full pipeline.
 */

import type { ConceptClass, DetectedLang } from './config.ts'

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
}
