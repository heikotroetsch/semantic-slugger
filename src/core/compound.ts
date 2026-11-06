/**
 * Compound splitting (SPEC 7.2): a DP over known parts with linkers. M2 uses it for the language
 * hint (6.1) and the attr rule (6.4); the concept rules of 7.3 build on it in M3.
 * Integer scores and a fixed loop order make the result deterministic.
 */

import { RE_VOWEL } from './regexes.ts'

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
  /** True when the whole word is a lexicon key or form (known compounds stay whole). */
  hasExact(w: string): boolean
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
    if (!isHeadPart(idx, head)) continue
    for (const l of idx.linkers) {
      const m = j - l.length
      if (m < 5 || w.slice(m, j) !== l) continue
      const mod = w.slice(0, m)
      if (!RE_VOWEL.test(mod)) continue
      return [
        { text: mod, known: false, linker: '', start: 0 },
        { text: head, known: true, linker: l, start: j },
      ]
    }
  }
  return null
}
