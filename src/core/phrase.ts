/**
 * Phrase matching (SPEC 6.2): walk the tokens left to right and try lexicon phrases of 5 down to 2
 * words (ascii, exact, stop words inside the phrase count). The longest match becomes one token with
 * the entry. Hyphenated tokens also try their parts as a phrase (SPEC 5.1 step 4).
 */

import type { Compiled } from './compile.ts'
import type { Tok } from './tokenize.ts'

export interface PhraseMatch {
  readonly tokens: readonly string[]
  readonly key: string
}

export function matchPhrases(toks: readonly Tok[], c: Compiled): { toks: Tok[]; matches: PhraseMatch[] } {
  const out: Tok[] = []
  const matches: PhraseMatch[] = []
  const max = Math.min(5, c.lexicon.maxPhrase)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok
    let hit = false
    if (t.cls === 'word') {
      for (let n = Math.min(max, toks.length - i); n >= 2 && !hit; n--) {
        const span = toks.slice(i, i + n)
        if (span.some((x) => x.cls !== 'word')) continue
        const words = span.map((x) => x.ascii)
        const e = c.lexicon.phrase(words)
        if (e === undefined) continue
        const last = span[n - 1] as Tok
        out.push({
          ...t,
          text: span.map((x) => x.text).join(' '),
          ascii: words.join(''),
          words,
          end: last.end,
          next: last.next,
          lex: e,
          lang: e.lang === undefined || e.lang === '*' ? t.lang : e.lang,
          case: span.every((x) => x.case === span[0]?.case) ? t.case : 'mixed',
          innerCaps: false,
          cap: t.cap,
        })
        matches.push({ tokens: words, key: e.key })
        i += n - 1
        hit = true
      }
      if (!hit && t.parts !== undefined && t.parts.length > 1) {
        const e = c.lexicon.phrase(t.parts)
        if (e !== undefined && c.lexicon.exactAll(t.ascii).length === 0) {
          out.push({ ...t, words: [...t.parts], lex: e })
          matches.push({ tokens: [...t.parts], key: e.key })
          hit = true
        }
      }
    }
    if (!hit) out.push(t)
  }
  return { toks: out, matches }
}
