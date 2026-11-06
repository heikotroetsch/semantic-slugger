import type { SluggerConfig } from '../../src/config.ts'
import { analyzeDoc, type Doc } from '../../src/core/analyze.ts'
import type { ConceptX } from '../../src/core/concepts.ts'
import { type Ranked, type RankOptions, rankConcepts } from '../../src/core/rank.ts'
import { cfgOf } from './front.ts'

/** Steps 1 to 8 for one title. */
export function doc(title: string, config?: SluggerConfig, lang?: string): Doc {
  return analyzeDoc(title, cfgOf(config), lang === undefined ? {} : { lang })
}

/** Concepts in title order (not ranked). */
export function concepts(title: string, config?: SluggerConfig, lang?: string): ConceptX[] {
  return [...doc(title, config, lang).concepts]
}

/** The concept with this key, or undefined. */
export function concept(title: string, key: string, config?: SluggerConfig, lang?: string): ConceptX | undefined {
  return concepts(title, config, lang).find((c) => c.key === key)
}

/** Concepts as `key:cls` (weak ones with `~weak`), in title order. */
export function shapes(title: string, config?: SluggerConfig, lang?: string): string[] {
  return concepts(title, config, lang).map((c) => `${c.key}:${c.cls}${c.weak ? '~weak' : ''}`)
}

/** Rank a title. */
export function ranked(title: string, config?: SluggerConfig, opts?: RankOptions, lang?: string): Ranked {
  return rankConcepts(doc(title, config, lang).concepts, cfgOf(config), opts)
}
