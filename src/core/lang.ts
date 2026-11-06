/**
 * Language detection (SPEC 6.1): per-call option, user hook, then pack hints (chars, onlyStop words,
 * suffixes, weak suffixes, digraphs, compound hint, lexicon hits). Then the per-token language.
 */

import type { DetectedLang, LexiconEntry } from '../config.ts'
import type { LanguagePack } from '../lang/pack.ts'
import type { Compiled } from './compile.ts'
import { splitCompound } from './compound.ts'
import type { Normalized } from './normalize.ts'
import { RE_HAS_LETTER } from './regexes.ts'
import type { Tok } from './tokenize.ts'

export type LangSource = 'option' | 'hook' | 'heuristic' | 'default'

export interface LangResult {
  readonly lang: DetectedLang
  readonly source: LangSource
  /** Score per enabled pack code (heuristic only; zeros otherwise). */
  readonly scores: Readonly<Record<string, number>>
  readonly reasons: readonly string[]
}

const VOWELS = 'aeiouy'

function consonant(ch: string | undefined): boolean {
  return ch !== undefined && ch >= 'a' && ch <= 'z' && !VOWELS.includes(ch)
}

/**
 * Digraph hint (SPEC 6.1): a token of 5+ chars with `ae`, `oe` or `ue` after a consonant other than `q`
 * and before a consonant. Skipped for tokens that end in `ues`/`ued` and for tokens that are a stop
 * word, weekday or lexicon form of another enabled pack.
 */
export function digraphHit(t: Tok, p: LanguagePack, c: Compiled): boolean {
  const a = t.ascii
  const dg = p.hints?.digraphs ?? []
  if (dg.length === 0 || a.length < 5 || a.endsWith('ues') || a.endsWith('ued')) return false
  for (const o of c.packs) {
    if (o.code === p.code) continue
    if (o.stopWords.includes(a)) return false
    if ((o.weekdays ?? []).some((row) => row.includes(a))) return false
    if (c.lexicon.exactAll(a).some((e) => e.lang === o.code)) return false
  }
  for (let i = 1; i + 2 < a.length; i++) {
    if (!dg.includes(a.slice(i, i + 2))) continue
    const prev = a[i - 1]
    if (prev !== 'q' && consonant(prev) && consonant(a[i + 2])) return true
  }
  return false
}

/** A weekday or month name of the pack (any listed form). */
function calendarWord(p: LanguagePack, a: string): boolean {
  return (p.weekdays ?? []).some((r) => r.includes(a)) || (p.months ?? []).some((r) => r.includes(a))
}

/** Lexicon lookup for detection: step 0, exact, then stem over every enabled language (SPEC 4.4). */
export function detectLookup(t: Tok, c: Compiled): LexiconEntry | undefined {
  return c.lexicon.lookup(t, undefined, c.cfg.languages)
}

function order(c: Compiled, code: string): number {
  return c.cfg.languages.indexOf(code)
}

/**
 * An abbreviation typed in capitals tells the language only when all entries that list it agree
 * (`PR`: de and en, `CRM`: `*` and en). Used by detection and by the per-token language.
 */
function sharedAbbr(t: Tok, c: Compiled): boolean {
  if (t.capsAbbr === undefined) return false
  const hits = c.lexicon.knownAbbr(t.capsAbbr)
  return hits.length > 0 && new Set(hits.map((e) => e.lang ?? '*')).size > 1
}

/** Detect the title language (SPEC 6.1). `toks` are the tokens after deny tokens are removed. */
export function detectLanguage(toks: readonly Tok[], n: Normalized, c: Compiled, option?: string): LangResult {
  const zero: Record<string, number> = {}
  for (const p of c.packs) zero[p.code] = 0
  if (option !== undefined) return { lang: option, source: 'option', scores: zero, reasons: [] }
  const hook = c.cfg.detectLanguage?.(n.surface)
  if (hook !== undefined && c.cfg.languages.includes(hook))
    return { lang: hook, source: 'hook', scores: zero, reasons: [] }
  const score = new Map<string, number>(c.packs.map((p) => [p.code, 0]))
  const reasons: string[] = []
  const add = (code: string, k: number, why: string) => {
    score.set(code, (score.get(code) ?? 0) + k)
    reasons.push(`${code}+${k} ${why}`)
  }
  const charHit = c.packs.filter((p) => [...(p.hints?.chars ?? '')].some((ch) => n.surface.includes(ch)))
  for (const p of charHit) add(p.code, 2, 'chars')
  for (const t of toks) {
    if (t.translit) continue
    // weekday and month names of one pack only (docs/DEVIATIONS.md, quality round 1)
    if (t.cls === 'weekday' || t.cls === 'month') {
      for (const p of c.packs)
        if (calendarWord(p, t.ascii) && c.packs.every((o) => o === p || !calendarWord(o, t.ascii)))
          add(p.code, 1, `date:${t.ascii}`)
      continue
    }
    if (t.cls !== 'word') continue
    const a = t.ascii
    // an upper-case token that is an `upperOnly` lexicon word is no stop word (`IT`, `US`, SPEC 6.3)
    const upperWord = t.case === 'upper' && c.lexicon.exactAll(a).some((e) => e.upperOnly === true)
    for (const p of c.packs) {
      if (!upperWord && c.onlyStop.get(p.code)?.has(a) === true) add(p.code, 2, `stop:${a}`)
      if ((p.hints?.suffixes ?? []).some((s) => a.endsWith(s))) add(p.code, 1, `suffix:${a}`)
      if (charHit.length === 0 && a.length >= 5 && (p.hints?.weakSuffixes ?? []).some((s) => a.endsWith(s)))
        add(p.code, 1, `weak-suffix:${a}`)
      if (charHit.length === 0 && digraphHit(t, p, c)) add(p.code, 1, `digraph:${a}`)
      // compound hint: only splits into known parts, not at typed hyphens (`Syllabus` is no `sylla|bus`)
      const idx = c.parts.get(p.code)
      if (idx !== undefined && t.parts === undefined && a.length >= 8) {
        const split = splitCompound(a, idx)
        if (split?.every((x) => x.known) === true) add(p.code, 1, `compound:${a}`)
      }
    }
    const lx = sharedAbbr(t, c) ? undefined : detectLookup(t, c)
    const ll = lx?.lang ?? '*'
    if (lx !== undefined && ll !== '*' && score.has(ll) && (lx.partOnly !== true || a.length >= 6))
      add(ll, 1, `lex:${a}`)
  }
  const scores: Record<string, number> = {}
  for (const [k, v] of score) scores[k] = v
  const ranked = [...score].sort((x, y) => y[1] - x[1] || order(c, x[0]) - order(c, y[0]))
  const top = ranked[0] as [string, number]
  if (top[1] === 0) return { lang: 'und', source: 'heuristic', scores, reasons }
  const second = ranked[1]
  if (second !== undefined && second[1] === top[1])
    return { lang: c.cfg.defaultLang, source: 'default', scores, reasons }
  return { lang: top[0], source: 'heuristic', scores, reasons }
}

/** Per-token language (SPEC 6.1, rules 1 to 5). */
export function tokenLanguage(t: Tok, title: LangResult, n: Normalized, c: Compiled): DetectedLang {
  if (t.translit || !RE_HAS_LETTER.test(n.canonical)) return 'und'
  const lx = t.cls === 'word' && !sharedAbbr(t, c) ? detectLookup(t, c) : undefined
  const ll = lx?.lang ?? '*'
  if (lx !== undefined && ll !== '*' && lx.partOnly !== true && c.pack(ll) !== undefined) return ll
  for (const p of c.packs) {
    const chars = p.hints?.chars ?? ''
    if ([...chars].some((ch) => t.text.includes(ch))) return p.code
    if ((p.hints?.suffixes ?? []).some((s) => t.ascii.endsWith(s))) return p.code
  }
  if (title.source !== 'default' && title.lang !== 'und') return title.lang
  return 'und'
}

/** Final lexicon lookup with the token language (SPEC 4.4). */
export function finalLookup(t: Tok, title: DetectedLang, c: Compiled): LexiconEntry | undefined {
  const pref = t.lang !== 'und' ? t.lang : title !== 'und' ? title : undefined
  const stemLangs = t.lang !== 'und' ? [t.lang] : c.cfg.languages
  return c.lexicon.lookup(t, pref, stemLangs)
}
