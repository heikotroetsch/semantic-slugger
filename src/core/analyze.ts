/**
 * The language front of the pipeline (SPEC 3, steps 1 to 6): normalize, tokenize, deny tokens,
 * language, phrases, stop words, names, back-off. Pure and sync. Compounds, concepts and ranking
 * (steps 7 to 9) build on its result.
 */

import type { DetectedLang, ResolvedConfig } from '../config.ts'
import { ConfigError, InputError } from '../errors.ts'
import type { SlugWarning } from '../result.ts'
import { type Compiled, compile } from './compile.ts'
import { detectLanguage, finalLookup, type LangResult, tokenLanguage } from './lang.ts'
import { applyNames } from './names.ts'
import { type Normalized, normalize } from './normalize.ts'
import { matchPhrases, type PhraseMatch } from './phrase.ts'
import { applyStopWords, backoff } from './stopwords.ts'
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
  const { kept, denied } = dropDeny(all, c)
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
    removed: stop.removed,
    weak: stop.weak,
    names: nm.names,
    ...(bo.backoff !== undefined ? { backoff: bo.backoff } : {}),
    empty: bo.empty,
    warnings,
  }
}

/** Shorthand used by tests and tools: the kept tokens with their classes and roles. */
export function keptTokens(f: Front): Tok[] {
  return f.tokens.filter((t) => t.drop === undefined && t.cls !== 'noise' && t.cls !== 'smallnum')
}
