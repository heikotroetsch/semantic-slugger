/**
 * Normalization (SPEC 4.1, 4.3): NFKC, markup, entities, zero-width chars, emoji, case flags,
 * lowercase, special tokens, ordered noise removal with protected number spans, transliteration.
 *
 * The working text is lower case. A parallel mask `up` records which chars were upper case in the
 * raw title (SPEC 4.1 "cased"), so the tokenizer can give each token a case flag without a second
 * split. When lowercasing changes the length (rare NFKC effects), the mask is null and every case flag
 * is `unknown`. A second mask `tr` records chars that came from transliteration.
 */

import type { ResolvedConfig } from '../config.ts'
import { hexBytes, utf8 } from '../hash/encode.ts'
import type { SlugWarning } from '../result.ts'
import {
  RE_ASCII_DIGIT,
  RE_CAPITAL_SHARP_S,
  RE_CPP,
  RE_CSHARP,
  RE_DATE,
  RE_DIGIT_GROUP,
  RE_DOTNET,
  RE_EMAIL,
  RE_EMOJI,
  RE_ENTITY,
  RE_FOLD_CHARS,
  RE_FY,
  RE_HISTORIC_YEAR,
  RE_IBAN,
  RE_IBAN_GROUP,
  RE_LATIN_LETTER,
  RE_LETTER,
  RE_LONGNUM,
  RE_MARKS,
  RE_MARKUP,
  RE_MONEY,
  RE_MONEY_REVERSE,
  RE_NON_ALNUM_RUN,
  RE_NUMBER_CHAR,
  RE_PERCENT,
  RE_PHONE,
  RE_RANGE,
  RE_SOFT_HYPHEN,
  RE_SPACE_CHAR,
  RE_SPACES,
  RE_URL,
  RE_VERSION_V,
  RE_VERSION_WORD,
  RE_WEEK,
  RE_YEAR,
  RE_YEAR_ONLY,
  RE_ZERO_WIDTH,
} from './regexes.ts'

const FOLD: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  ł: 'l',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

/** Ascii fold for display, rungs and the canonical title (SPEC 4.1). */
export function asciiFold(w: string): string {
  return w
    .replace(RE_FOLD_CHARS, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(RE_MARKS, '')
}

/** Canonical title: ascii fold, every run of other chars becomes one space (SPEC 4.1). */
export function toCanonical(surface: string): string {
  return asciiFold(surface).replace(RE_NON_ALNUM_RUN, ' ').trim()
}

/**
 * Normalize one list entry (stop words, reserved words, blocklist, deny tokens, pack data) "like a
 * title": NFKC, capital sharp s to ß, lowercase, ascii fold, trim. Inner whitespace runs become one
 * space. The caller checks the shape.
 */
export function normalizeListEntry(raw: string): string {
  return asciiFold(raw.normalize('NFKC').replace(RE_CAPITAL_SHARP_S, 'ß').toLowerCase())
    .trim()
    .split(RE_SPACES)
    .join(' ')
}

/** Text with a per-char upper-case mask and a per-char transliteration mask. */
interface Masked {
  s: string
  up: boolean[] | null
  tr: boolean[]
}

/** Output of normalize (SPEC 4.1). */
export interface Normalized {
  readonly input: string
  /** Lower case, umlauts kept, noise removed, transliterated, non-Latin scripts dropped. */
  readonly surface: string
  /** Per char of `surface`: was upper case in the raw title. null: unknown (all case flags unknown). */
  readonly up: readonly boolean[] | null
  /** Per char of `surface`: came from a transliteration table or the user hook. */
  readonly tr: readonly boolean[]
  /** Hash input and titleKey (SPEC 4.1). */
  readonly canonical: string
  /** Texts removed by noise removal (SPEC 4.3), for explain(). */
  readonly removed: readonly string[]
  readonly warnings: readonly SlugWarning[]
}

/** Replace every match; the replacement chars get `up = false` and `tr = false`. */
function edit(t: Masked, re: RegExp, fn: (m: RegExpExecArray) => string | null): Masked {
  re.lastIndex = 0
  let s = ''
  const up: boolean[] | null = t.up ? [] : null
  const tr: boolean[] = []
  let last = 0
  let changed = false
  for (let m = re.exec(t.s); m !== null; m = re.exec(t.s)) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    const rep = fn(m)
    if (rep === null) continue
    changed = true
    s += t.s.slice(last, m.index) + rep
    if (up && t.up) up.push(...t.up.slice(last, m.index), ...Array<boolean>(rep.length).fill(false))
    tr.push(...t.tr.slice(last, m.index), ...Array<boolean>(rep.length).fill(false))
    last = m.index + m[0].length
  }
  if (!changed) return t
  s += t.s.slice(last)
  if (up && t.up) up.push(...t.up.slice(last))
  tr.push(...t.tr.slice(last))
  return { s, up, tr }
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntity(e: string): string {
  const body = e.slice(1, -1).toLowerCase()
  if (body[0] !== '#') return ENTITIES[body] ?? ' '
  const cp = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ' '
  return String.fromCodePoint(cp)
}

/** Replace lone surrogates with a space (the result is the same as `toWellFormed`, see 4.1). */
function wellFormed(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s[i] + (s[i + 1] as string)
        i++
        continue
      }
      out += ' '
    } else if (c >= 0xdc00 && c <= 0xdfff) out += ' '
    else out += s[i]
  }
  return out
}

/** Pre-lowercase text processing shared by every title (SPEC 4.1, before "cased"). */
function prepare(raw: string, cfg: ResolvedConfig, warnings: SlugWarning[]): string {
  let s = raw
  if (s.length > cfg.maxInputLength) {
    s = s.slice(0, cfg.maxInputLength)
    warnings.push('truncated')
  }
  s = wellFormed(s).normalize('NFKC')
  s = s.replace(RE_MARKUP, ' ')
  s = s.replace(RE_ENTITY, decodeEntity)
  s = s.replace(RE_SOFT_HYPHEN, '')
  s = s.replace(RE_ZERO_WIDTH, ' ')
  s = s.replace(RE_EMOJI, ' ')
  return s
}

/** Lowercase with an upper-case mask (SPEC 4.1: `ẞ -> ß`, then lowercase, never toLocale*). */
function lowerMasked(cased: string): Masked {
  const pre = cased.replace(RE_CAPITAL_SHARP_S, 'ß')
  const s = pre.toLowerCase()
  const tr = Array<boolean>(s.length).fill(false)
  if (s.length !== cased.length) return { s, up: null, tr }
  const up: boolean[] = []
  for (let i = 0; i < s.length; i++) up.push(cased[i] !== s[i])
  return { s, up, tr }
}

/** Same-length blanking: positions stay stable, so protected span masks can be restored. */
function blank(len: number): string {
  return ' '.repeat(len)
}

const MASK_CHAR = ''

/** Context the noise removal needs from the language data. */
export interface NoiseContext {
  /** Version words of the enabled packs (SPEC 5.4). */
  readonly versionWords: ReadonlySet<string>
}

/**
 * Ordered noise removal (SPEC 4.3). Steps 1 to 3 and 5, 7, 8 remove text (replaced by spaces of the
 * same length); steps 4 and 6 mask the protected number spans so that money and percent patterns
 * cannot touch them. Masks are restored at the end.
 */
export function removeNoise(t: Masked, ctx: NoiseContext, removed: string[]): Masked {
  const drop = (m: RegExpExecArray): string => {
    removed.push(m[0].trim())
    return blank(m[0].length)
  }
  t = edit(t, RE_EMAIL, drop)
  t = edit(t, RE_URL, drop)
  t = edit(t, RE_IBAN, (m) => {
    const groups = m[0].slice(4).match(RE_IBAN_GROUP) ?? []
    if (groups.length > 0 && groups.every((g) => RE_YEAR_ONLY.test(g))) return null
    return drop(m)
  })
  // step 4 and 6: protected spans
  const saved: { at: number; text: string }[] = []
  const mask = (m: RegExpExecArray): string => {
    saved.push({ at: m.index, text: m[0] })
    return MASK_CHAR.repeat(m[0].length)
  }
  t = edit(t, RE_DATE, mask)
  t = edit(t, RE_PHONE, (m) => {
    const groups = m[0].match(RE_DIGIT_GROUP) ?? []
    const digits = groups.join('').length
    if (digits < 7 || digits > 15) return null
    if (!m[0].startsWith('+') && groups.some((g) => RE_YEAR_ONLY.test(g))) return null
    return drop(m)
  })
  for (const re of [RE_RANGE, RE_FY, RE_WEEK, RE_YEAR, RE_HISTORIC_YEAR, RE_VERSION_V, RE_LONGNUM])
    t = edit(t, re, mask)
  t = edit(t, RE_VERSION_WORD, (m) => (ctx.versionWords.has(m[1] as string) ? mask(m) : null))
  t = edit(t, RE_MONEY, drop)
  t = edit(t, RE_MONEY_REVERSE, drop)
  t = edit(t, RE_PERCENT, drop)
  if (saved.length === 0) return t
  // every edit above kept the length, so the saved positions are still valid
  let s = t.s
  for (const { at, text } of saved) s = s.slice(0, at) + text + s.slice(at + text.length)
  return { s, up: t.up, tr: t.tr }
}

/** Translit context: user hook, pack tables, built-in tables (SPEC 4.2). */
export interface TranslitContext {
  readonly hook?: (input: string) => string
  readonly tables: readonly Readonly<Record<string, string>>[]
}

function mapChar(c: string, tables: TranslitContext['tables']): string | undefined {
  for (const tbl of tables) {
    const r = tbl[c]
    if (r !== undefined) return r
  }
  const base = c.normalize('NFD').replace(RE_MARKS, '')
  if (base !== c && base.length === 1) {
    for (const tbl of tables) {
      const r = tbl[base]
      if (r !== undefined) return r
    }
  }
  return undefined
}

/**
 * Transliteration (SPEC 4.2). The user hook runs first, on each whitespace-separated chunk (a changed
 * chunk is marked as transliterated); then pack tables and the built-in tables, char by char.
 */
export function transliterate(t: Masked, ctx: TranslitContext): Masked {
  if (ctx.hook) {
    let s = ''
    const up: boolean[] | null = t.up ? [] : null
    const tr: boolean[] = []
    let i = 0
    while (i < t.s.length) {
      let j = i
      const space = RE_SPACE_CHAR.test(t.s[i] as string)
      while (j < t.s.length && RE_SPACE_CHAR.test(t.s[j] as string) === space) j++
      const chunk = t.s.slice(i, j)
      const out = space ? chunk : String(ctx.hook(chunk)).toLowerCase()
      s += out
      if (out === chunk) {
        if (up && t.up) up.push(...t.up.slice(i, j))
        tr.push(...t.tr.slice(i, j))
      } else {
        const wasUp = t.up?.[i] === true
        if (up) for (let k = 0; k < out.length; k++) up.push(k === 0 && wasUp)
        for (let k = 0; k < out.length; k++) tr.push(true)
      }
      i = j
    }
    t = { s, up, tr }
  }
  let s = ''
  const up: boolean[] | null = t.up ? [] : null
  const tr: boolean[] = []
  let changed = false
  for (let i = 0; i < t.s.length; i++) {
    const c = t.s[i] as string
    const r = mapChar(c, ctx.tables)
    if (r === undefined) {
      s += c
      if (up && t.up) up.push(t.up[i] as boolean)
      tr.push(t.tr[i] as boolean)
      continue
    }
    changed = true
    const wasUp = t.up?.[i] === true
    const nextUp = t.up?.[i + 1] === true
    s += r
    for (let k = 0; k < r.length; k++) {
      if (up) up.push(wasUp && (k === 0 || nextUp))
      tr.push(true)
    }
  }
  return changed ? { s, up, tr } : t
}

/**
 * Drop letters of scripts that are not Latin and non-ascii digits (SPEC 4.1). Returns true when
 * something was dropped (warning `script-dropped`).
 */
function dropScripts(t: Masked): { t: Masked; dropped: boolean } {
  let s = ''
  let dropped = false
  for (const c of t.s) {
    if ((RE_LETTER.test(c) && !RE_LATIN_LETTER.test(c)) || (RE_NUMBER_CHAR.test(c) && !RE_ASCII_DIGIT.test(c))) {
      dropped = true
      s += ' '.repeat(c.length)
    } else s += c
  }
  return dropped ? { t: { s, up: t.up, tr: t.tr }, dropped } : { t, dropped }
}

/** Normalize a raw title (SPEC 4.1). */
export function normalize(
  raw: string,
  cfg: ResolvedConfig,
  noise: NoiseContext,
  translit: TranslitContext,
): Normalized {
  const warnings: SlugWarning[] = []
  const removed: string[] = []
  const cased = prepare(raw, cfg, warnings)
  let t = lowerMasked(cased)
  t = edit(t, RE_CPP, () => ' cpp ')
  t = edit(t, RE_CSHARP, () => ' csharp ')
  t = edit(t, RE_DOTNET, (m) => `${m[1] as string} dotnet `)
  t = removeNoise(t, noise, removed)
  t = transliterate(t, translit)
  const d = dropScripts(t)
  t = d.t
  if (d.dropped) warnings.push('script-dropped')
  let canonical = toCanonical(t.s)
  if (canonical === '' && d.dropped) canonical = `raw:${hexBytes(utf8(raw.normalize('NFKC')))}`
  return { input: raw, surface: t.s, up: t.up, tr: t.tr, canonical, removed, warnings }
}
