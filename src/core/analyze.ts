/**
 * Steps 1 to 9 of the pipeline (SPEC 3). The language front (steps 1 to 6): normalize, tokenize,
 * deny tokens, language, phrases, stop words, names, compound weak words, back-off. Then concepts and
 * stems (steps 7, 8) and the rank without store answers (step 9). Pure and sync.
 */

import type { ConceptClass, DetectedLang, LexiconEntry, ResolvedConfig } from '../config.ts'
import { ConfigError, InputError } from '../errors.ts'
import type { SlugWarning } from '../result.ts'
import { type Compiled, compile } from './compile.ts'
import { buildConcepts, type Concept, type ConceptX, conceptTokens, markCompounds, type SplitRow } from './concepts.ts'
import { detectLanguage, finalLookup, type LangResult, tokenLanguage } from './lang.ts'
import { applyNames } from './names.ts'
import { type Normalized, normalize } from './normalize.ts'
import { matchPhrases, type PhraseMatch } from './phrase.ts'
import type { RankRow } from './rank.ts'
import { rankPool } from './resolve.ts'
import { isListWord } from './safety.ts'
import { applyStopWords, backoff } from './stopwords.ts'
import { titleKeyOf } from './tail.ts'
import { type DropReason, dropDeny, type NameSignal, type Tok, tokenize } from './tokenize.ts'

export interface FrontOptions {
  /** Per-call language override (must be an enabled code). */
  readonly lang?: string
}

export interface Front {
  readonly normalized: Normalized
  readonly language: LangResult
  readonly lang: DetectedLang
  /** Tokens after deny removal and phrase merging, with drop, weak and role marks. */
  readonly tokens: readonly Tok[]
  /** Deny tokens removed right after tokenizing (SPEC 6.6). */
  readonly denied: readonly Tok[]
  readonly phrases: readonly PhraseMatch[]
  readonly removed: readonly { word: string; list: DropReason }[]
  readonly weak: readonly string[]
  readonly names: readonly { word: string; signal: NameSignal }[]
  /** Compound splits of the topic tokens (SPEC 7, explain step `compounds`). */
  readonly splits: readonly SplitRow[]
  readonly backoff?: 'noise' | 'weak'
  /** No usable content: the empty path applies (SPEC 6.5, 13.6). */
  readonly empty: boolean
  readonly warnings: readonly SlugWarning[]
}

/** Run steps 1 to 6 of the pipeline for one title. Throws InputError for a non-string title. */
export function analyzeFront(raw: unknown, cfg: ResolvedConfig, opts: FrontOptions = {}): Front {
  if (typeof raw !== 'string') throw new InputError('title must be a string')
  const c: Compiled = compile(cfg)
  if (opts.lang !== undefined && !cfg.languages.includes(opts.lang))
    throw new ConfigError(`invalid option "lang": ${opts.lang} is not enabled`, {
      field: 'lang',
      value: opts.lang,
      reason: 'unknown-language',
    })
  const n = normalize(raw, cfg, c.noiseCtx, c.translit)
  const all = tokenize(n, c)
  const deny = dropDeny(all, c)
  // B4 (SPEC 9.2): a word or code token that equals a blocklist word is dropped before concepts
  const blocked: Tok[] = []
  const kept: Tok[] = []
  for (const t of deny.kept) {
    if ((t.cls === 'word' || t.cls === 'code') && isListWord(t.ascii, cfg)) blocked.push(t)
    else kept.push(t)
  }
  const denied = deny.denied
  const language = detectLanguage(kept, n, c, opts.lang)
  for (const t of kept) t.lang = tokenLanguage(t, language, n, c)
  const ph = matchPhrases(kept, c)
  const toks = ph.toks
  for (const t of toks) {
    if (t.cls !== 'word' || t.words !== undefined) continue
    const lx = finalLookup(t, language.lang, c)
    if (lx !== undefined) t.lex = lx
  }
  const stop = applyStopWords(toks, language.lang, c)
  const nm = applyNames(toks, language.lang, c, n)
  // compounds whose parts are all weak are weak words, so the back-off can restore them (SPEC 7.3)
  const cp = markCompounds(toks, c)
  const bo = backoff(toks)
  const warnings: SlugWarning[] = [...n.warnings]
  if (bo.empty) warnings.push('empty')
  if (bo.backoff !== undefined) warnings.push('stopwords-relaxed')
  return {
    normalized: n,
    language,
    lang: language.lang,
    tokens: toks,
    denied,
    phrases: ph.matches,
    removed: [...stop.removed, ...blocked.map((t) => ({ word: t.ascii, list: 'blocked' as const }))],
    weak: [...stop.weak, ...cp.weak],
    names: nm.names,
    splits: cp.splits,
    ...(bo.backoff !== undefined ? { backoff: bo.backoff } : {}),
    empty: bo.empty,
    warnings,
  }
}

/** Shorthand used by tests and tools: the kept tokens with their classes and roles. */
export function keptTokens(f: Front): Tok[] {
  return conceptTokens(f.tokens)
}

/** Internal result of steps 1 to 8: the front, the concepts in title order and the stored stems. */
export interface Doc {
  readonly cfg: ResolvedConfig
  readonly front: Front
  readonly canonical: string
  /** Concepts in title order, not ranked (score 0). Empty when `empty`. */
  readonly concepts: readonly ConceptX[]
  /** Sorted unique stored stems (SPEC 8.2): plain or hashed. Empty when `empty`. */
  readonly storedStems: readonly string[]
  readonly titleKey: string
  /** No usable content: the empty path applies (SPEC 6.5, 13.6). */
  readonly empty: boolean
}

/** Run steps 1 to 8 for one title (SPEC 3). Throws InputError for a non-string title. */
export function analyzeDoc(raw: unknown, cfg: ResolvedConfig, opts: FrontOptions = {}): Doc {
  const front = analyzeFront(raw, cfg, opts)
  const c = compile(cfg)
  const built = front.empty ? { concepts: [], storedStems: [] } : buildConcepts(front.tokens, c)
  return {
    cfg,
    front,
    canonical: front.normalized.canonical,
    concepts: built.concepts,
    storedStems: built.storedStems,
    titleKey: titleKeyOf(front.normalized.canonical, cfg),
    empty: front.empty,
  }
}

/** A kept token as `analyze()` shows it. */
export interface AnalysisToken {
  readonly text: string
  readonly ascii: string
  /** Token class (SPEC 5.2); word tokens: `word`. */
  readonly cls: string
  /** Role of a word token: its concept class (SPEC 6.4, 6.6, 15.1). */
  readonly role?: ConceptClass
  /** Number, time, marker and code key (SPEC 5.2). */
  readonly key?: string
  readonly lang: DetectedLang
  readonly weak: boolean
}

/** A concept as `analyze()` shows it (SPEC 8.1). */
export type AnalysisConcept = Concept

/** Result of `analyze()`: normalized title, language, tokens, concepts and stems (SPEC 16.1). */
export interface Analysis {
  readonly input: string
  /** Lower case, umlauts kept, noise removed (SPEC 4.1). */
  readonly surface: string
  /** Hash input and titleKey (SPEC 4.1). */
  readonly canonical: string
  readonly lang: DetectedLang
  readonly langSource: 'option' | 'hook' | 'heuristic' | 'default'
  /** Kept tokens in title order. */
  readonly tokens: readonly AnalysisToken[]
  /** Removed stop words, legal forms and deny tokens. */
  readonly removed: readonly { readonly word: string; readonly list: DropReason }[]
  readonly compounds: readonly SplitRow[]
  /** Concepts in rank order, scored without store answers (SPEC 10, `rarity` from the priors). */
  readonly concepts: readonly AnalysisConcept[]
  /** Rank rows of the non-weak concepts (SPEC 16.4 `rank` step). */
  readonly rank: readonly RankRow[]
  /** Keys of the pool concepts without store answers, in rank order (SPEC 10.4). */
  readonly pool: readonly string[]
  /** Stems to store for df and re-pick (SPEC 8.2): plain or hashed. Use them to backfill old rows. */
  readonly storedStems: readonly string[]
  /** 16 hex chars of SipHash over the canonical title (SPEC 13.3). */
  readonly titleKey: string
  readonly empty: boolean
  readonly warnings: readonly SlugWarning[]
}

function publicConcept(c: ConceptX): AnalysisConcept {
  const lex: LexiconEntry | undefined = c.lex
  return Object.freeze({
    key: c.key,
    cls: c.cls,
    weak: c.weak,
    verbatim: Object.freeze([...c.verbatim]),
    pos: c.pos,
    tf: c.tf,
    ...(lex !== undefined ? { lex } : {}),
    stemKeys: Object.freeze([...c.stemKeys]),
    storedKeys: Object.freeze([...c.storedKeys]),
    ...(c.bond !== undefined ? { bond: Object.freeze({ ...c.bond }) } : {}),
    score: c.score,
  })
}

function publicToken(t: Tok): AnalysisToken {
  return Object.freeze({
    text: t.text,
    ascii: t.ascii,
    cls: t.cls,
    ...(t.cls === 'word' ? { role: (t.role ?? 'topic') as ConceptClass } : {}),
    ...(t.key !== undefined ? { key: t.key } : {}),
    lang: t.lang,
    weak: t.weak === true,
  })
}

/** Public `analyze()` (SPEC 16.1): steps 1 to 9 without a store. */
export function analyzeTitle(raw: unknown, cfg: ResolvedConfig, opts: FrontOptions = {}): Analysis {
  const doc = analyzeDoc(raw, cfg, opts)
  const f = doc.front
  // the pool needs the ladders: a concept without a rung is not in it (SPEC 10.4)
  const { ranked } = rankPool(doc, null, cfg, compile(cfg))
  return Object.freeze({
    input: f.normalized.input,
    surface: f.normalized.surface,
    canonical: doc.canonical,
    lang: f.lang,
    langSource: f.language.source,
    tokens: Object.freeze(keptTokens(f).map(publicToken)),
    removed: Object.freeze(f.removed.map((r) => Object.freeze({ ...r }))),
    compounds: Object.freeze(f.splits.map((s) => Object.freeze({ ...s }))),
    concepts: Object.freeze(ranked.concepts.map(publicConcept)),
    rank: Object.freeze(ranked.rows.map((r) => Object.freeze({ ...r }))),
    pool: Object.freeze(ranked.pool.map((c) => c.key)),
    storedStems: Object.freeze([...doc.storedStems]),
    titleKey: doc.titleKey,
    empty: doc.empty,
    warnings: Object.freeze([...f.warnings]),
  })
}
