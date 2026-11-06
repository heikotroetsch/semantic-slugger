/**
 * Stems (SPEC 8.2). Stems are keys only, never displayed. The stemmer of a token is the pack stemmer
 * of its language, applied to `keyFold(ascii)`; `und` tokens use the plain plural fold.
 */

import type { LanguagePack } from '../lang/pack.ts'
import { RE_LIST_ENTRY } from './regexes.ts'

/**
 * Plural fold for `und` tokens (SPEC 8.2): remove one final `s` when the word has 4+ chars and does
 * not end in `ss`, `us`, `is` or `os` (`recipes` -> `recipe`; `bus`, `status`, `analysis` stay).
 */
export function pluralFold(w: string): string {
  if (w.length < 4 || !w.endsWith('s')) return w
  if (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is') || w.endsWith('os')) return w
  return w.slice(0, -1)
}

/** Memoized stemmer of one pack. Output that is not `[a-z0-9]+` falls back to the ascii input (SPEC 6.7). */
export interface Stemmer {
  readonly code: string
  stem(ascii: string): string
  keyFold(ascii: string): string
}

export function makeStemmer(pack: LanguagePack): Stemmer {
  const memo = new Map<string, string>()
  const fold = pack.keyFold ?? ((s: string) => s)
  return {
    code: pack.code,
    keyFold: (ascii) => {
      const f = fold(ascii)
      return typeof f === 'string' && RE_LIST_ENTRY.test(f) ? f : ascii
    },
    stem(ascii) {
      let s = memo.get(ascii)
      if (s === undefined) {
        const f = fold(ascii)
        const input = typeof f === 'string' && RE_LIST_ENTRY.test(f) ? f : ascii
        const out = pack.stem(input)
        s = typeof out === 'string' && RE_LIST_ENTRY.test(out) ? out : ascii
        memo.set(ascii, s)
      }
      return s
    },
  }
}

/** The `und` stemmer: plural fold, no key fold. */
export const UND_STEMMER: Stemmer = {
  code: 'und',
  stem: pluralFold,
  keyFold: (s) => s,
}
