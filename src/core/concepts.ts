/**
 * Compounds, concepts and stems (SPEC 7.3, 8). Steps 7 and 8 of the pipeline: split topic tokens into
 * parts and turn them into concepts, merge concepts by key and group, join a topic into the marker of
 * the same word, set number bonds, and compute the lexicon-free stems for storage.
 */

import type { ConceptClass, DetectedLang, LexiconEntry, ResolvedConfig } from '../config.ts'
import { HASH_FIELD_SEP } from '../data/v1/constants.ts'
import { utf8 } from '../hash/encode.ts'
import { siphash, u64hex } from '../hash/siphash.ts'
import type { Compiled } from './compile.ts'
import {
  type CompoundPlan,
  joinParts,
  type Part,
  type PartInfo,
  type PlanContext,
  planCompound,
  rawParts,
} from './compound.ts'
import { keyFor } from './tail.ts'
import type { Tok } from './tokenize.ts'

/** Number-like token classes that become number concepts with their tokenizer key (SPEC 5.2). */
const NUMBER_TOKS: ReadonlySet<string> = new Set([
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

/** A concept (SPEC 8.1). `score` is set by rank; ladders follow in step 10. */
export interface Concept {
  /** Identity inside one call: lexicon key or group, stem(s) of the source word, or the number key. */
  readonly key: string
  readonly cls: ConceptClass
  readonly weak: boolean
  /** Ascii forms the user typed for this concept: full token and/or compound part. */
  readonly verbatim: readonly string[]
  /** Index of the first source token (among the kept tokens). */
  readonly pos: number
  /** Number of merged occurrences. */
  readonly tf: number
  readonly lex?: LexiconEntry
  /** Sorted unique lexicon-free stems of the source tokens and parts (SPEC 8.2). */
  readonly stemKeys: readonly string[]
  /** Stored forms (plain or hashed) of `stemKeys`. */
  readonly storedKeys: readonly string[]
  /** Quarter or month + year, model number + word (SPEC 11.5). */
  readonly bond?: { readonly with: string; readonly kind: 'year' | 'word' }
  /** Rank score (SPEC 10.3); 0 until ranked. */
  readonly score: number
}

/** Internal concept with the data the later steps need. */
export interface ConceptX extends Concept {
  /** Display source: the ascii form of the concept (the full word, the kept part run, the number). */
  readonly display: string
  /** Language of the source token (display of months and weekdays, phonology). */
  readonly lang: DetectedLang
  /** First source token. */
  readonly tok: Tok
  /** Parts of a compound concept (two or more strong parts), for the morph and head rungs (SPEC 7.3). */
  readonly parts?: readonly PartInfo[]
  /** Stems per source occurrence (SPEC 8.2 "in" rule). */
  readonly occurrences: readonly (readonly string[])[]
  /** Stored forms per source occurrence. */
  readonly storedOcc: readonly (readonly string[])[]
}

/** Mutable builder state of one concept. */
interface Draft {
  key: string
  cls: ConceptClass
  weak: boolean
  verbatim: string[]
  pos: number
  tf: number
  lex?: LexiconEntry
  occ: string[][]
  bond?: { with: string; kind: 'year' | 'word' }
  display: string
  lang: DetectedLang
  tok: Tok
  parts?: PartInfo[]
}

/** One row of the `compounds` explain step (SPEC 16.4). */
export interface SplitRow {
  readonly word: string
  readonly parts: readonly string[]
  readonly linkers: readonly string[]
  readonly kept: readonly string[]
}

function planContext(c: Compiled, lang: DetectedLang): PlanContext {
  return {
    idx: c.parts.get(lang),
    lexicon: c.lexicon,
    stemmer: c.stemmer(lang),
    weakHeads: c.weakHeads(lang),
    genericModifiers: c.genericModifiers(lang),
    lang,
  }
}

/** A word token that the 7.2 splitter may split (also used for stored stems). */
function splittable(t: Tok, c: Compiled): boolean {
  if (t.cls !== 'word' || t.words !== undefined) return false
  if (t.role === 'name' || t.role === 'acronym') return false
  if (t.parts !== undefined) return true // typed hyphens split in every language (SPEC 5.1 step 3)
  return !t.translit && t.lang !== 'und' && c.parts.has(t.lang)
}

/** Raw parts of a token for the splitter (SPEC 7.2), or null when it stays whole. */
function partsOf(t: Tok, c: Compiled): Part[] | null {
  const idx = c.parts.get(t.lang)
  if (t.parts === undefined && (t.translit || t.lang === 'und')) return null
  return rawParts(t.ascii, t.parts, t.translit || t.lang === 'und' ? undefined : idx)
}

/**
 * Plan the compounds of the kept topic tokens (SPEC 7.3) and mark compounds whose parts are all weak
 * as weak words, before the back-off (SPEC 6.5). Mutates `split` and `weak` on tokens.
 * Returns the newly weak words and the explain rows.
 */
export function markCompounds(toks: readonly Tok[], c: Compiled): { weak: string[]; splits: SplitRow[] } {
  const weak: string[] = []
  const splits: SplitRow[] = []
  for (const t of toks) {
    if (t.drop !== undefined || t.lex !== undefined || t.role !== 'topic' || !splittable(t, c)) continue
    const raw = partsOf(t, c)
    if (raw === null) continue
    const plan = planCompound(t.ascii, raw, t.parts !== undefined, t.case, planContext(c, t.lang))
    if (plan === null) continue
    t.split = plan
    splits.push({
      word: t.ascii,
      parts: plan.parts.map((p) => p.text),
      linkers: plan.parts.map((p) => p.linker),
      kept: plan.weak ? [] : [...plan.mods, ...plan.core].map((p) => p.text),
    })
    if (plan.weak && t.weak !== true) {
      t.weak = true
      weak.push(t.ascii)
    }
  }
  return { weak, splits }
}

/** The kept tokens of the front: not dropped, not noise, not a small number. */
export function conceptTokens(toks: readonly Tok[]): Tok[] {
  return toks.filter((t) => t.drop === undefined && t.cls !== 'noise' && t.cls !== 'smallnum')
}

function stemOf(c: Compiled, lang: DetectedLang, ascii: string): string {
  return c.stemmer(lang).stem(ascii)
}

/** Lexicon-free stems of one kept token (SPEC 8.2). */
function tokenStems(t: Tok, c: Compiled): string[] {
  if (NUMBER_TOKS.has(t.cls)) return t.key !== undefined ? [t.key] : []
  if (t.cls !== 'word') return []
  if (t.words !== undefined) return t.words.map((w) => stemOf(c, t.lang, w))
  const out = [stemOf(c, t.lang, t.ascii)]
  const raw = t.split?.raw ?? (splittable(t, c) ? partsOf(t, c) : null)
  for (const p of raw ?? []) if (p.text.length >= 2) out.push(stemOf(c, t.lang, p.text))
  return out
}

/**
 * Stored form of a stem (SPEC 8.2): identity for `plain`, 16 hex chars of SipHash for `hashed`.
 * Only `buildConcepts` calls it, so plain and hashed forms never mix.
 */
function storedStem(s: string, cfg: ResolvedConfig): string {
  if (cfg.storeStems !== 'hashed') return s
  return u64hex(siphash(keyFor(cfg), utf8(`stem${HASH_FIELD_SEP}${s}`)))
}

function uniqSorted(xs: Iterable<string>): string[] {
  return [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function lexKey(e: LexiconEntry): string {
  return e.group ?? e.key
}

/** Concepts of one word token (SPEC 7.3, 8.1). */
function wordDrafts(t: Tok, pos: number, c: Compiled): Draft[] {
  const weak = t.weak === true
  const role = (t.role ?? 'topic') as ConceptClass
  const base = { pos, tf: 1, lang: t.lang, tok: t }
  if (t.words !== undefined) {
    const e = t.lex as LexiconEntry
    const occ = [t.words.map((w) => stemOf(c, t.lang, w))]
    return [{ ...base, key: lexKey(e), cls: role, weak, verbatim: [t.ascii], lex: e, occ, display: t.ascii }]
  }
  const whole = (): Draft => {
    const occ = [tokenStems(t, c)]
    if (t.lex !== undefined)
      return { ...base, key: lexKey(t.lex), cls: role, weak, verbatim: [t.ascii], lex: t.lex, occ, display: t.ascii }
    return { ...base, key: stemOf(c, t.lang, t.ascii), cls: role, weak, verbatim: [t.ascii], occ, display: t.ascii }
  }
  const plan = t.split
  if (plan === undefined || plan.weak) return [whole()]
  const out: Draft[] = []
  for (const m of plan.mods) {
    const e = m.lex as LexiconEntry
    out.push({
      ...base,
      key: lexKey(e),
      cls: e.cls,
      weak: false,
      verbatim: [m.text],
      lex: e,
      occ: [[m.stem]],
      display: m.text,
    })
  }
  out.push(coreDraft(plan, base, weak))
  return out
}

/** The main concept of a compound (SPEC 7.3): one part, or one concept for two or more strong parts. */
function coreDraft(plan: CompoundPlan, base: Pick<Draft, 'pos' | 'tf' | 'lang' | 'tok'>, tokWeak: boolean): Draft {
  const core = plan.core
  if (core.length === 0) {
    // the rest after the modifiers is weak (`Nordbericht`): a weak concept that only gives stems
    const rest = plan.parts.slice(plan.mods.length)
    const text = joinParts(rest)
    return {
      ...base,
      key: rest.map((p) => p.stem).join('+'),
      cls: 'topic',
      weak: true,
      verbatim: [text],
      occ: [rest.map((p) => p.stem)],
      display: text,
    }
  }
  if (core.length === 1) {
    const p = core[0] as PartInfo
    if (p.lex !== undefined)
      return {
        ...base,
        key: lexKey(p.lex),
        cls: p.lex.cls === 'marker' ? 'topic' : p.lex.cls,
        weak: tokWeak,
        verbatim: [p.text],
        lex: p.lex,
        occ: [[p.stem]],
        display: p.text,
      }
    return { ...base, key: p.stem, cls: 'topic', weak: tokWeak, verbatim: [p.text], occ: [[p.stem]], display: p.text }
  }
  // one concept per compound: class and prior from the head part; key from the stems of all kept parts
  // (DEVIATIONS: the head stem alone would merge `Apfelkuchen` and `Kirschkuchen`)
  const head = core[core.length - 1] as PartInfo
  const text = joinParts(core)
  const stems = core.map((p) => p.stem)
  return {
    ...base,
    key: stems.join('+'),
    cls: 'topic',
    weak: tokWeak,
    verbatim: [text],
    ...(head.lex !== undefined ? { lex: head.lex } : {}),
    occ: [stems],
    display: text,
    parts: [...core],
  }
}

function merge(into: Draft, d: Draft): void {
  into.tf += d.tf
  if (d.pos < into.pos) into.pos = d.pos
  into.weak = into.weak && d.weak
  for (const v of d.verbatim) if (!into.verbatim.includes(v)) into.verbatim.push(v)
  into.occ.push(...d.occ)
}

export interface ConceptsResult {
  readonly concepts: ConceptX[]
  readonly storedStems: readonly string[]
}

/**
 * Build the concepts and the stored stems of the kept tokens (SPEC 8). Concepts come out in title
 * order (pos, then key); rank sorts them.
 */
export function buildConcepts(toks: readonly Tok[], c: Compiled): ConceptsResult {
  const kept = conceptTokens(toks)
  const drafts: Draft[] = []
  const byKey = new Map<string, Draft>()
  /** Token -> key of its main concept (model bonds). */
  const tokKey = new Map<Tok, string>()
  const add = (d: Draft, t: Tok) => {
    const hit = byKey.get(d.key)
    if (hit !== undefined) merge(hit, d)
    else {
      byKey.set(d.key, d)
      drafts.push(d)
    }
    tokKey.set(t, d.key)
  }
  const stems: string[] = []
  kept.forEach((t, pos) => {
    stems.push(...tokenStems(t, c))
    if (NUMBER_TOKS.has(t.cls)) {
      if (t.key === undefined) return
      add(
        {
          key: t.key,
          cls: t.cls as ConceptClass,
          weak: false,
          verbatim: [t.ascii],
          pos,
          tf: 1,
          occ: [[t.key]],
          display: t.ascii,
          lang: t.lang,
          tok: t,
        },
        t,
      )
      return
    }
    if (t.cls !== 'word') return
    for (const d of wordDrafts(t, pos, c)) add(d, t)
  })

  // topic-to-marker merge (SPEC 5.3): `Sprintplanung Sprint 22` gives one concept `sprint22`
  const alias = new Map<string, string>()
  for (const m of drafts) {
    const mw = m.cls === 'marker' ? m.tok.markerWord : undefined
    if (mw === undefined || mw === '#' || mw === '§') continue
    for (const d of drafts) {
      if (d === m || d.cls !== 'topic' || alias.has(d.key)) continue
      if (d.key !== mw && !d.verbatim.includes(mw)) continue
      merge(m, d)
      alias.set(d.key, m.key)
    }
  }
  const live = drafts.filter((d) => !alias.has(d.key))

  // number bonds (SPEC 11.5): quarter and month with the first year that has a 2-digit form;
  // a model number with its word
  const year = live.filter((d) => d.cls === 'year' && d.tok.historic !== true).sort((a, b) => a.pos - b.pos)[0]
  for (const d of live) {
    if ((d.cls === 'quarter' || d.cls === 'month') && year !== undefined) d.bond = { with: year.key, kind: 'year' }
    if (d.cls === 'model' && d.tok.modelOf !== undefined) {
      const w = toks[d.tok.modelOf]
      const k = w !== undefined ? tokKey.get(w) : undefined
      if (k !== undefined) d.bond = { with: alias.get(k) ?? k, kind: 'word' }
    }
  }

  const cfg = c.cfg
  const concepts: ConceptX[] = live
    .sort((a, b) => a.pos - b.pos || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => {
      const occurrences = d.occ.map((o) => uniqSorted(o))
      const storedOcc = occurrences.map((o) => uniqSorted(o.map((s) => storedStem(s, cfg))))
      const stemKeys = uniqSorted(occurrences.flat())
      return {
        key: d.key,
        cls: d.cls,
        weak: d.weak,
        verbatim: d.verbatim,
        pos: d.pos,
        tf: d.tf,
        ...(d.lex !== undefined ? { lex: d.lex } : {}),
        stemKeys,
        storedKeys: uniqSorted(stemKeys.map((s) => storedStem(s, cfg))),
        ...(d.bond !== undefined ? { bond: d.bond } : {}),
        score: 0,
        display: d.display,
        lang: d.lang,
        tok: d.tok,
        ...(d.parts !== undefined ? { parts: d.parts } : {}),
        occurrences,
        storedOcc,
      }
    })
  return { concepts, storedStems: uniqSorted(stems.map((s) => storedStem(s, cfg))) }
}

/**
 * Document frequency of a concept (SPEC 8.2): per occurrence the minimum df over its stored stems,
 * then the maximum over occurrences. Missing stems count 0.
 */
export function conceptDf(c: ConceptX, df: ReadonlyMap<string, number>): number {
  let best = 0
  for (const o of c.storedOcc) {
    let min = Number.POSITIVE_INFINITY
    for (const s of o) min = Math.min(min, df.get(s) ?? 0)
    if (o.length > 0 && min > best) best = min
  }
  return best
}

/** A concept is "in" a row when all stored stems of at least one occurrence are in its stems (SPEC 8.2). */
export function isIn(c: ConceptX, theirs: ReadonlySet<string>): boolean {
  return c.storedOcc.some((o) => o.length > 0 && o.every((s) => theirs.has(s)))
}
