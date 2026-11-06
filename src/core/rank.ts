/**
 * Ranking (SPEC 10): integer scores in "centi" units. Class weight, rarity (prior blended with the
 * store df), position bonus, term frequency, lexicon weight and the re-pick boost. Then the pool.
 * No floats reach a decision: every value is an integer, so all engines give the same order.
 */

import type { ConceptClass, ResolvedConfig } from '../config.ts'
import { WEAK_NO_SHOW } from '../data/v1/weak.ts'
import { type ConceptX, conceptDf } from './concepts.ts'

/** Class weights (SPEC 10.1). `topic` is split into lexicon and unknown topics. */
export const CLASS_WEIGHT: Readonly<Record<ConceptClass, number>> = Object.freeze({
  topic: 280,
  name: 260,
  acronym: 240,
  place: 200,
  marker: 240,
  year: 220,
  range: 160,
  direction: 200,
  region: 140,
  qualifier: 140,
  quarter: 200,
  month: 140,
  week: 200,
  attr: 120,
  version: 200,
  model: 120,
  longnum: 120,
  code: 100,
  weekday: 100,
  quantity: 50,
})

/** Class weight of an unknown topic (no lexicon entry). */
export const UNKNOWN_TOPIC_WEIGHT = 240

export const PRIOR: Readonly<Record<'common' | 'medium' | 'rare' | 'unknown' | 'proper', number>> = Object.freeze({
  common: 20,
  medium: 50,
  rare: 70,
  unknown: 40,
  proper: 80,
})

/** Classes with a fixed rarity and no store lookup (SPEC 10.2). */
export const NUMBER_CLASSES: ReadonlySet<ConceptClass> = new Set<ConceptClass>([
  'year',
  'range',
  'quarter',
  'month',
  'week',
  'weekday',
  'version',
  'marker',
  'model',
  'longnum',
  'code',
  'quantity',
])

export const RARITY_NUMBER = 50
export const BLEND_K = 200
/** Position bonus of the T concepts in title order (SPEC 10.3, rev 3.1). */
export const POSITION_BONUS: readonly number[] = [90, 45, 20, 10, 5]
export const TF_BONUS = 40
export const DIFF_BOOST = 300
export const POOL_MIN_SCORE = 100
export const POOL_SIZE = 6
/**
 * Score of a weak concept that fills a free pool slot (docs/DEVIATIONS.md, quality round 1): low, so
 * it is cheap to drop, but the fit may show it instead of a long padding tail.
 */
export const WEAK_POOL_SCORE = 50
/** Weak concepts join the pool only when it holds at most this many other concepts. */
export const WEAK_POOL_MAX = 1

/**
 * Lexicon weight of a concept (SPEC 10.3). A compound concept takes the entry of its head, but a
 * negative weight (a doc-kind head: `Onboarding-Checkliste`) does not count: the modifier names the
 * topic (docs/DEVIATIONS.md, quality round 3).
 */
export function lexWeight(c: Pick<ConceptX, 'lex' | 'parts'>): number {
  const w = c.lex?.weight ?? 0
  return w < 0 && c.parts !== undefined && c.parts.length > 1 ? 0 : w
}

/** Classes of slot T that get the position bonus (not attr). */
const T_BONUS: ReadonlySet<ConceptClass> = new Set<ConceptClass>(['topic', 'name', 'acronym'])

/** Classes `leak: 'minimal'` drops (SPEC 10.4). */
export const MINIMAL_DROP: ReadonlySet<ConceptClass> = new Set<ConceptClass>([
  'name',
  'attr',
  'code',
  'marker',
  'model',
  'version',
  'longnum',
  'quantity',
])

const LOG2_FRAC_Q8 = [0, 22, 44, 63, 82, 100, 118, 134, 150, 165, 179, 193, 207, 220, 232, 244] as const

/** About 256 * log2(x) for an integer x >= 1, in integers only (SPEC 10.2). */
export function ilog2q8(x: number): number {
  const v = Math.min(Math.max(1, Math.floor(x)), 0x7fffffff)
  const e = 31 - Math.clz32(v)
  const m = ((v << (31 - e)) >>> 27) & 15
  return e * 256 + (LOG2_FRAC_Q8[m] as number)
}

/** Prior of a concept (SPEC 10.2): lexicon prior, `proper` for names, else `unknown`. */
export function prior(c: Pick<ConceptX, 'lex' | 'cls'>): number {
  if (c.lex !== undefined) return PRIOR[c.lex.prior ?? 'medium']
  if (c.cls === 'name') return PRIOR.proper
  return PRIOR.unknown
}

/** Rarity 0..100 (SPEC 10.2): fixed for number classes, else the prior blended with the store df. */
export function rarity(
  c: Pick<ConceptX, 'lex' | 'cls'>,
  df: number | undefined,
  n: number | undefined,
  cfg: Pick<ResolvedConfig, 'rarity'>,
): number {
  if (NUMBER_CLASSES.has(c.cls)) return RARITY_NUMBER
  const p = prior(c)
  if (df === undefined || n === undefined || n < 1 || cfg.rarity !== 'store') return p
  const top = ilog2q8(n + 1)
  const rs = Math.max(0, Math.min(100, Math.floor((100 * (top - ilog2q8(Math.min(df, n) + 1))) / top)))
  return Math.floor((p * BLEND_K + rs * n) / (BLEND_K + n))
}

/** Class weight (SPEC 10.1): a topic without a lexicon entry is an unknown topic. */
export function classWeight(c: Pick<ConceptX, 'lex' | 'cls'>): number {
  if (c.cls === 'topic' && c.lex === undefined) return UNKNOWN_TOPIC_WEIGHT
  return CLASS_WEIGHT[c.cls]
}

/** Store answers for rarity: df per stored stem and the corpus size N. */
export interface Stats {
  readonly df: ReadonlyMap<string, number>
  /** `store.total()`; when missing, `cfg.corpusSize` is used (SPEC 10.2). */
  readonly N?: number
}

/** One row of the `rank` explain step (SPEC 16.4). */
export interface RankRow {
  readonly key: string
  readonly cls: ConceptClass
  readonly base: number
  readonly rarity: number
  readonly pos: number
  readonly tf: number
  readonly lex: number
  readonly diff: number
  readonly score: number
}

export type ExcludeWhy = 'weak' | 'below-100' | 'no-rung' | 'leak' | 'pool-full'

export interface Ranked {
  /** All concepts with their scores, in rank order. */
  readonly concepts: readonly ConceptX[]
  /** Rank rows of the non-weak concepts, in rank order. */
  readonly rows: readonly RankRow[]
  /** The pool: at most 6 concepts, in rank order (SPEC 10.4). */
  readonly pool: readonly ConceptX[]
  readonly excluded: readonly { key: string; why: ExcludeWhy }[]
  readonly df: 'store' | 'static'
  readonly N?: number
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Rank order (SPEC 10.3): score desc, pos asc, key asc (code units, never localeCompare). */
export function rankOrder(
  a: Pick<ConceptX, 'score' | 'pos' | 'key'>,
  b: Pick<ConceptX, 'score' | 'pos' | 'key'>,
): number {
  return b.score - a.score || a.pos - b.pos || cmpStr(a.key, b.key)
}

export interface RankOptions {
  /** Store answers; null or undefined: priors only. */
  readonly stats?: Stats | null
  /** Concept keys that get the re-pick boost (SPEC 13.4). */
  readonly diff?: ReadonlySet<string>
  /** True when the concept has a display rung (SPEC 10.4); default: every concept has one. */
  readonly hasRung?: (c: ConceptX) => boolean
}

/**
 * Score the concepts and build the pool (SPEC 10.3, 10.4). Pure: returns new concept objects with
 * `score` set and leaves the input untouched.
 */
export function rankConcepts(concepts: readonly ConceptX[], cfg: ResolvedConfig, opts: RankOptions = {}): Ranked {
  const stats = cfg.rarity === 'store' ? (opts.stats ?? undefined) : undefined
  const n = stats === undefined ? undefined : (stats.N ?? cfg.corpusSize)
  // position bonus: non-weak T concepts in title order
  const bonus = new Map<ConceptX, number>()
  // doc-kind words (negative lexicon weight) take no position bonus (docs/DEVIATIONS.md, quality round 1)
  concepts
    .filter((c) => !c.weak && T_BONUS.has(c.cls) && lexWeight(c) >= 0)
    .sort((a, b) => a.pos - b.pos || cmpStr(a.key, b.key))
    .forEach((c, i) => {
      bonus.set(c, POSITION_BONUS[i] ?? 0)
    })
  // direction cancel: three or more different direction concepts give all of them score 0
  const cancel = concepts.filter((c) => c.cls === 'direction').length >= 3
  const rowOf = new Map<ConceptX, RankRow>()
  const scored = concepts.map((c) => {
    const base = classWeight(c)
    const r = rarity(c, stats === undefined ? undefined : conceptDf(c, stats.df), n, cfg)
    const pos = bonus.get(c) ?? 0
    const lex = lexWeight(c)
    const diff = opts.diff?.has(c.key) === true ? DIFF_BOOST : 0
    let score = base + Math.floor((r * 3) / 2) + pos + TF_BONUS * (c.tf - 1) + lex + diff
    if (cancel && c.cls === 'direction') score = 0
    const out: ConceptX = { ...c, score }
    rowOf.set(out, { key: c.key, cls: c.cls, base, rarity: r, pos, tf: c.tf, lex, diff, score })
    return out
  })
  scored.sort(rankOrder)
  const excluded: { key: string; why: ExcludeWhy }[] = []
  const pool: ConceptX[] = []
  const hasRung = opts.hasRung ?? (() => true)
  const weakOnes: ConceptX[] = []
  for (const c of scored) {
    let why: ExcludeWhy | undefined
    if (c.weak) {
      if (cfg.leak === 'normal' && !WEAK_NO_SHOW.has(c.lex?.key ?? '') && hasRung(c)) {
        weakOnes.push(c)
        continue
      }
      why = 'weak'
    } else if (cfg.leak === 'opaque' || (cfg.leak === 'minimal' && MINIMAL_DROP.has(c.cls))) why = 'leak'
    else if (c.score < POOL_MIN_SCORE) why = 'below-100'
    else if (!hasRung(c)) why = 'no-rung'
    else if (pool.length >= POOL_SIZE) why = 'pool-full'
    if (why === undefined) pool.push(c)
    else excluded.push({ key: c.key, why })
  }
  // with one concept or less in the pool, weak concepts take the free slots with a low score
  // (docs/DEVIATIONS.md, quality round 1)
  const room = pool.length <= WEAK_POOL_MAX ? POOL_SIZE : 0
  for (const c of weakOnes) {
    if (pool.length >= room) excluded.push({ key: c.key, why: 'weak' })
    else pool.push({ ...c, score: Math.min(c.score, WEAK_POOL_SCORE) })
  }
  return {
    concepts: scored,
    rows: scored.filter((c) => !c.weak).map((c) => rowOf.get(c) as RankRow),
    pool,
    excluded,
    df: stats === undefined ? 'static' : 'store',
    ...(n !== undefined ? { N: n } : {}),
  }
}
