/**
 * Compound splitting (SPEC 7.2): a DP over known parts with linkers, and the rules that turn parts into
 * concepts (SPEC 7.3). The split is also used by the language hint (6.1) and the attr rule (6.4).
 * Integer scores and a fixed loop order make the result deterministic.
 */

import type { LexiconEntry } from '../config.ts'
import { type CaseFlag, caseOk, type Lexicon } from './lexicon.ts'
import { RE_VOWEL } from './regexes.ts'
import type { Stemmer } from './stem.ts'

export interface Part {
  readonly text: string
  readonly known: boolean
  readonly linker: string
  readonly start: number
}

/** Part data of one pack with compound data (SPEC 7.1). */
export interface PartIndex {
  readonly parts: ReadonlySet<string>
  readonly linkers: readonly string[]
  readonly genericModifiers: ReadonlySet<string>
  /**
   * Noun suffixes (the pack's `hints.suffixes`): in pass 2 an unknown modifier that ends in one of
   * them takes a linker when one fits (`buchungssystem` -> `buchung` + `s` + `system`).
   */
  readonly linkSuffixes: readonly string[]
  /** True when the whole word is a lexicon key or form (known compounds stay whole). */
  hasExact(w: string): boolean
  /** Allowed word onsets (single consonants and the pack's clusters), for pass 3. */
  readonly onsets?: ReadonlySet<string>
  /** Direction, region and qualifier words of the pack, the modifiers of pass 3. */
  readonly mods?: ReadonlySet<string>
}

/** The head starts like a word: a vowel other than `e`, or a consonant run that is an onset. */
function startsLikeWord(head: string, onsets: ReadonlySet<string> | undefined): boolean {
  let i = 0
  while (i < head.length && !'aeiouy'.includes(head[i] as string)) i++
  if (i === 0) return head[0] !== 'e'
  return onsets === undefined || onsets.has(head.slice(0, i))
}

const ENDINGS = ['e', 'n', 'en', 'er', 's', 'es'] as const

/** A known part; at the end of the word also a known part plus a plural or case ending (SPEC 7.2). */
export function hasPart(idx: PartIndex, text: string, atEnd: boolean): boolean {
  if (idx.parts.has(text)) return true
  if (!atEnd) return false
  for (const e of ENDINGS)
    if (text.length > e.length + 2 && text.endsWith(e) && idx.parts.has(text.slice(0, -e.length))) return true
  return false
}

/** A known part that is not a generic modifier (SPEC 7.1). */
function isHeadPart(idx: PartIndex, p: string): boolean {
  return hasPart(idx, p, true) && !idx.genericModifiers.has(p)
}

/** Pass 1: only known parts; fewer parts and fewer linkers win, then the longer last part. */
function splitKnown(w: string, idx: PartIndex): Part[] | null {
  interface Seg {
    parts: Part[]
    score: number
  }
  const best: (Seg | null)[] = Array<Seg | null>(w.length + 1).fill(null)
  best[0] = { parts: [], score: 0 }
  for (let i = 3; i <= w.length; i++) {
    for (let j = 0; j <= i - 3; j++) {
      const text = w.slice(j, i)
      if (!hasPart(idx, text, i === w.length)) continue
      for (const l of idx.linkers) {
        const k = j - l.length
        if (k < 0) continue
        const prev = best[k]
        if (prev === null || prev === undefined || w.slice(k, j) !== l) continue
        if (l !== '' && k === 0) continue // no linker before the first part
        const s = prev.score - 100 - (l ? 50 : 0)
        const cur = best[i]
        const lastLen = cur ? (cur.parts[cur.parts.length - 1]?.text.length ?? 0) : 0
        if (cur === null || cur === undefined || s > cur.score || (s === cur.score && text.length > lastLen)) {
          best[i] = { parts: [...prev.parts, { text, known: true, linker: l, start: j }], score: s }
        }
      }
    }
  }
  return best[w.length]?.parts ?? null
}

/**
 * Split an ascii word into parts, or null to keep it whole (SPEC 7.2). Pass 2 allows exactly one
 * unknown modifier (5+ chars, with a vowel) before one known head.
 */
export function splitCompound(word: string, idx: PartIndex): Part[] | null {
  const w = word.length > 64 ? word.slice(0, 64) : word
  if (w.length < 7 || idx.hasExact(word)) return null
  const all = splitKnown(w, idx)
  if (all !== null && all.length > 1) return all
  for (let j = 5; j <= w.length - 3; j++) {
    const head = w.slice(j)
    // the head must be a known part of 4+ chars before any ending (`stand|orte` is no split;
    // docs/DEVIATIONS.md, quality round 1)
    if (!isHeadPart(idx, head) || baseOf(idx, head).length < 4) continue
    let pick: { mod: string; l: string } | undefined
    for (const l of idx.linkers) {
      const m = j - l.length
      if (m < 5 || w.slice(m, j) !== l) continue
      const mod = w.slice(0, m)
      if (!RE_VOWEL.test(mod)) continue
      // a modifier with a noun suffix takes the linker (`buchung` + `s`, not `buchungs`; DEVIATIONS)
      if (pick === undefined || (l !== '' && pick.l === '' && idx.linkSuffixes.some((x) => mod.endsWith(x))))
        pick = { mod, l }
    }
    if (pick !== undefined)
      return [
        { text: pick.mod, known: false, linker: '', start: 0 },
        { text: head, known: true, linker: pick.l, start: j },
      ]
  }
  // pass 3 (docs/DEVIATIONS.md, quality round 1): one direction, region or qualifier word of 3+
  // chars, then one unknown head of 4+ chars with a vowel (`nord|deutschland`, `sued|tirol`). No
  // linker when the head then starts like a word, else the first linker that makes it so. The longest
  // modifier wins.
  for (let j = w.length - 4; j >= 3; j--) {
    const mod = w.slice(0, j)
    if (idx.mods?.has(mod) !== true) continue
    const opts = [...idx.linkers].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : b.length - a.length))
    for (const l of opts) {
      const h = j + l.length
      const head = w.slice(h)
      if (w.slice(j, h) !== l || head.length < (l === '' ? 5 : 4) || !RE_VOWEL.test(head)) continue
      if (!startsLikeWord(head, idx.onsets)) continue
      return [
        { text: mod, known: true, linker: '', start: 0 },
        { text: head, known: false, linker: l, start: h },
      ]
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Parts to concepts (SPEC 7.3)
// ---------------------------------------------------------------------------------------------

/** Role of one compound part (SPEC 7.3). `mod` is a direction, region or qualifier entry. */
export type PartKind = 'weak' | 'generic' | 'mod' | 'strong'

export interface PartInfo {
  /** Ascii text of the part as typed, without its linker. */
  readonly text: string
  /** Linker before the part ('' for the first part and for typed hyphens). */
  readonly linker: string
  /** A known part (DP index or lexicon word). */
  readonly known: boolean
  readonly lex?: LexiconEntry
  readonly kind: PartKind
  /** Lexicon-free stem of the part (SPEC 8.2). */
  readonly stem: string
}

export interface CompoundPlan {
  /** Ascii of the whole token. */
  readonly word: string
  /** Parts from the splitter (7.2) or the typed hyphens, before the re-join; one-letter parts left out. */
  readonly raw: readonly Part[]
  /** Parts after adjacent parts that form a lexicon word are joined again. */
  readonly parts: readonly PartInfo[]
  /** Leading direction, region and qualifier modifiers: each becomes its own concept. */
  readonly mods: readonly PartInfo[]
  /** Parts of the main concept, first to last kept part. Empty when the rest of the token is weak. */
  readonly core: readonly PartInfo[]
  /** Every part is a weak head, weak word, noise word or generic modifier: the token is a weak word. */
  readonly weak: boolean
}

/** What the planner needs from the compiled config. */
export interface PlanContext {
  readonly idx: PartIndex | undefined
  readonly lexicon: Lexicon
  readonly stemmer: Stemmer
  /** Weak heads of the token language: the pack list, all weak words and all noise words (SPEC 7.1). */
  readonly weakHeads: ReadonlySet<string>
  readonly genericModifiers: ReadonlySet<string>
  readonly lang: string
}

const MOD_CLASSES: ReadonlySet<string> = new Set(['direction', 'region', 'qualifier'])

/** The part without a plural or case ending when only that form is a known part (`berichte` -> `bericht`). */
function baseOf(idx: PartIndex | undefined, text: string): string {
  if (idx === undefined || idx.parts.has(text)) return text
  for (const e of ENDINGS)
    if (text.length > e.length + 2 && text.endsWith(e) && idx.parts.has(text.slice(0, -e.length)))
      return text.slice(0, -e.length)
  return text
}

/** Lexicon lookup for one part (SPEC 4.4): exact, exact on the base form, then stem (5+ chars). */
function partLex(ctx: PlanContext, text: string, base: string, cf: CaseFlag): LexiconEntry | undefined {
  const pick = (w: string) => ctx.lexicon.exactAll(w).find((e) => e.cls !== 'marker' && caseOk(e, cf))
  const hit = pick(text) ?? (base !== text ? pick(base) : undefined)
  if (hit !== undefined) return hit
  if (text.length < 5) return undefined
  const s = ctx.lexicon.stemHit(text, ctx.lang)
  return s !== undefined && s.cls !== 'marker' && caseOk(s, cf) ? s : undefined
}

/** Raw parts of a token: typed hyphen parts (split further with compound data), or the DP split. */
export function rawParts(
  ascii: string,
  hyphenParts: readonly string[] | undefined,
  idx: PartIndex | undefined,
): Part[] | null {
  if (hyphenParts !== undefined) {
    const out: Part[] = []
    let at = 0
    for (const p of hyphenParts) {
      const start = ascii.indexOf(p, at)
      const s = start < 0 ? at : start
      at = s + p.length
      if (p.length < 2 && hyphenParts.length > 1) {
        // one-letter parts stay for the re-join (`e` + `mail`), they are no part of their own
        out.push({ text: p, known: false, linker: '', start: s })
        continue
      }
      const sub = idx !== undefined && p.length >= 7 && !idx.hasExact(p) ? splitCompound(p, idx) : null
      if (sub !== null && sub.length > 1) for (const q of sub) out.push({ ...q, start: s + q.start })
      else out.push({ text: p, known: idx !== undefined && hasPart(idx, p, true), linker: '', start: s })
    }
    return out.length > 1 ? out : null
  }
  if (idx === undefined) return null
  const sp = splitCompound(ascii, idx)
  return sp !== null && sp.length > 1 ? sp : null
}

/**
 * Apply the rules of SPEC 7.3 to the parts of one token. `cf` is the case flag of the token: it is
 * used for the first part (and for every typed hyphen part), other parts are lower case.
 * Returns null when the token has fewer than two parts after the re-join.
 */
export function planCompound(
  ascii: string,
  raw: readonly Part[],
  hyphen: boolean,
  cf: CaseFlag,
  ctx: PlanContext,
): CompoundPlan | null {
  // re-join adjacent parts that form a lexicon word (`e` + `mail` -> `email`), longest first
  const joined: { text: string; linker: string; known: boolean }[] = []
  for (let i = 0; i < raw.length; ) {
    const first = raw[i] as Part
    let text = first.text
    let end = i
    let acc = first.text
    for (let j = i + 1; j < raw.length; j++) {
      const p = raw[j] as Part
      acc += p.linker + p.text
      if (ctx.lexicon.hasExact(acc)) {
        text = acc
        end = j
      }
    }
    const known = end > i || first.known || ctx.lexicon.hasExact(first.text)
    joined.push({ text, linker: first.linker, known })
    i = end + 1
  }
  const kept = joined.filter((p) => p.text.length >= 2)
  if (kept.length < 2) return null
  const parts: PartInfo[] = kept.map((p, i) => {
    const base = baseOf(ctx.idx, p.text)
    const lex = partLex(ctx, p.text, base, hyphen || i === 0 ? cf : 'lower')
    let kind: PartKind = 'strong'
    if (ctx.weakHeads.has(p.text) || ctx.weakHeads.has(base) || lex?.weak === true) kind = 'weak'
    else if (ctx.genericModifiers.has(p.text) || ctx.genericModifiers.has(base)) kind = 'generic'
    else if (lex !== undefined && MOD_CLASSES.has(lex.cls)) kind = 'mod'
    return {
      text: p.text,
      linker: i === 0 ? '' : p.linker,
      known: p.known || lex !== undefined,
      ...(lex !== undefined ? { lex } : {}),
      kind,
      stem: ctx.stemmer.stem(p.text),
    }
  })
  const lowly = (p: PartInfo) => p.kind === 'weak' || p.kind === 'generic'
  const weak = parts.every(lowly)
  const mods: PartInfo[] = []
  let i = 0
  if (!weak) {
    // leading modifiers: directions, regions and qualifiers become own concepts; weak ones are dropped
    for (; i < parts.length - 1; i++) {
      const p = parts[i] as PartInfo
      if (p.kind === 'mod') mods.push(p)
      else if (!lowly(p)) break
    }
  }
  let end = parts.length
  while (end > i && lowly(parts[end - 1] as PartInfo)) end--
  const core = weak ? [] : parts.slice(i, end)
  return { word: ascii, raw, parts, mods, core, weak }
}

/** Display text of a run of parts: the first part without its linker, then linker + text. */
export function joinParts(parts: readonly PartInfo[]): string {
  let s = ''
  parts.forEach((p, i) => {
    s += (i === 0 ? '' : p.linker) + p.text
  })
  return s
}
