/*!
 * CISTEM stemmer for German, vendored for semantic-slugger (SPEC 8.2).
 * Port of the official `Cistem.js` (https://github.com/LeonieWeissweiler/CISTEM).
 * Based on: Leonie Weißweiler, Alexander Fraser (2017). Developing a Stemmer for German Based on a
 * Comparative Analysis of Publicly Available Stemmers. In Proceedings of the German Society for
 * Computational Linguistics and Language Technology (GSCL).
 *
 * Changes: TypeScript; the implicit global `upper` is a local variable; `upper` is computed with a
 * `\p{Ll}` test instead of `toUpperCase()` (same result: a first char that is not a lower-case letter
 * counts as upper); only `stem()` is ported (`segment()` is not used). The library always calls it with
 * `caseInsensitive = true` on keyFold(surface) of a part.
 *
 * MIT License
 *
 * Copyright (c) 2017 Leonie Weißweiler
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const stripge = /^ge(.{4,})/
const replxx = /(.)\1/g
const replxxback = /(.)\*/g
const replue = /ü/g
const reploe = /ö/g
const replae = /ä/g
const replss = /ß/g
const replsch = /sch/g
const replei = /ei/g
const replie = /ie/g
const replschback = /\$/g
const repleiback = /%/g
const replieback = /&/g
const stripemr = /e[mr]$/
const stripnd = /nd$/
const stript = /t$/
const stripesn = /[esn]$/
const lowerFirst = /^\p{Ll}/u

/** Every regex of this file, for the ReDoS harness (SPEC 4.3). */
export const CISTEM_REGEXES: readonly RegExp[] = [
  stripge,
  replxx,
  replxxback,
  replue,
  reploe,
  replae,
  replss,
  replsch,
  replei,
  replie,
  replschback,
  repleiback,
  replieback,
  stripemr,
  stripnd,
  stript,
  stripesn,
  lowerFirst,
]

/** CISTEM stem. `caseInsensitive = true` also strips a final `t` from capitalized words. */
export function cistem(word: string, caseInsensitive = false): string {
  if (word.length === 0) return word

  const upper = !lowerFirst.test(word)
  word = word.toLowerCase()

  word = word.replace(replue, 'u')
  word = word.replace(reploe, 'o')
  word = word.replace(replae, 'a')
  word = word.replace(replss, 'ss')

  word = word.replace(stripge, '$1')
  word = word.replace(replsch, '$')
  word = word.replace(replei, '%')
  word = word.replace(replie, '&')
  word = word.replace(replxx, '$1*')

  while (word.length > 3) {
    let result: string

    if (word.length > 5) {
      result = word.replace(stripemr, '')
      if (result !== word) {
        word = result
        continue
      }

      result = word.replace(stripnd, '')
      if (result !== word) {
        word = result
        continue
      }
    }

    if (!upper || caseInsensitive) {
      result = word.replace(stript, '')
      if (result !== word) {
        word = result
        continue
      }
    }

    result = word.replace(stripesn, '')
    if (result !== word) {
      word = result
    } else {
      break
    }
  }

  word = word.replace(replxxback, '$1$1')
  word = word.replace(repleiback, 'ei')
  word = word.replace(replieback, 'ie')
  word = word.replace(replschback, 'sch')

  return word
}
