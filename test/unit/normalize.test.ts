import { describe, expect, it } from 'vitest'
import { compile } from '../../src/core/compile.ts'
import { asciiFold, normalize, toCanonical } from '../../src/core/normalize.ts'
import { utf8 } from '../../src/hash/encode.ts'
import { cfgOf, front } from '../helpers/front.ts'

function norm(raw: string, config?: Parameters<typeof cfgOf>[0]) {
  const cfg = cfgOf(config)
  const c = compile(cfg)
  return normalize(raw, cfg, c.noiseCtx, c.translit)
}

const canon = (raw: string) => norm(raw).canonical

describe('normalize (SPEC 4.1)', () => {
  it('folds umlauts, ß and ẞ', () => {
    expect(canon('Größe Äpfel Übung')).toBe('groesse aepfel uebung')
    expect(canon('STRAẞE Straße')).toBe('strasse strasse')
    expect(norm('Straße').surface).toBe('straße')
  })

  it('folds Polish and other Latin letters', () => {
    expect(canon('Łódź')).toBe('lodz')
    expect(asciiFold('ø æ œ đ ð þ ı')).toBe('o ae oe d d th i')
  })

  it('zero-width chars are word breaks, the soft hyphen is removed', () => {
    expect(canon('Kinder​garten')).toBe('kinder garten')
    expect(canon('Kinder­garten')).toBe('kindergarten')
    expect(canon('a﻿b⁠c')).toBe('a b c')
  })

  it('removes markup and decodes entities', () => {
    expect(canon('<b>Bericht</b> &amp; Plan')).toBe('bericht plan')
    expect(norm('Tom &amp; Jerry &#228;&#xFC;&nbsp;x').surface).toBe('tom & jerry äü x')
    expect(canon('a &bogus; b')).toBe('a bogus b')
  })

  it('removes emoji', () => {
    expect(canon('⚡️ Strom 2026 🔌')).toBe('strom 2026')
    expect(canon('1️⃣ Team')).toBe('1 team')
  })

  it('maps C++, C# and .NET to words', () => {
    expect(canon('C++ und C# mit .NET')).toBe('cpp und csharp mit dotnet')
  })

  it('records case flags in a mask without changing the canonical title', () => {
    const n = norm('iPhone SEO')
    expect(n.surface).toBe('iphone seo')
    expect(n.up).toEqual([false, true, false, false, false, false, false, true, true, true])
    expect(canon('IPHONE seo')).toBe(canon('iphone SEO'))
  })

  it('truncates long input with a warning', () => {
    const n = norm('a'.repeat(5000))
    expect(n.surface.length).toBe(4096)
    expect(n.warnings).toContain('truncated')
    expect(norm('abcdef', { maxInputLength: 3 }).canonical).toBe('abc')
  })

  it('replaces lone surrogates', () => {
    expect(canon('a\ud800b')).toBe('a b')
    expect(canon('a\udc00b')).toBe('a b')
  })

  it('drops non-Latin scripts with a warning and hashes the raw title when nothing is left', () => {
    const n = norm('电力供应框架协议 2026')
    expect(n.canonical).toBe('2026')
    expect(n.warnings).toContain('script-dropped')
    const cjk = norm('电力供应')
    const ar = norm('عقد توريد')
    expect(cjk.canonical.startsWith('raw:')).toBe(true)
    expect(ar.canonical.startsWith('raw:')).toBe(true)
    expect(cjk.canonical).not.toBe(ar.canonical)
    expect(norm('🚚🚚').canonical).toBe('')
  })

  it('own utf8() equals TextEncoder output', () => {
    for (const s of ['abc', 'äöü ß', '电力', '🚚', 'Москва'])
      expect([...utf8(s)]).toEqual([...new TextEncoder().encode(s)])
  })

  it('toCanonical is stable on its own output', () => {
    for (const s of ['Größe 2026', 'a--b', '  x  ']) expect(toCanonical(toCanonical(s))).toBe(toCanonical(s))
  })
})

describe('noise removal (SPEC 4.3)', () => {
  it('keeps number spans', () => {
    for (const s of [
      '1000012345',
      '2025 2026 2027',
      'kw 12 2026 2027 2028',
      '2026 / 2027 / 2028',
      'kw12 2026 2027 2028',
      '01/02/2026',
      'Teil 01 2026 2027',
    ]) {
      expect(norm(s).removed, s).toEqual([])
      expect(canon(s), s).toBe(toCanonical(s.toLowerCase()))
    }
  })

  it('removes money, phone numbers, IBANs, emails and URLs', () => {
    expect(canon('budget 500 € 2026')).toBe('budget 2026')
    expect(canon('Hotline +49 89 1234567')).toBe('hotline')
    expect(canon('Tel 089/12345678')).toBe('tel')
    expect(canon('Konto DE89 3704 0044 0532 0130 00')).toBe('konto')
    expect(canon('Mail an info@example.com')).toBe('mail an')
    expect(canon('Siehe https://example.com/a?b=c und www.example.com')).toBe('siehe und')
    expect(canon('USD 1.200 und 3,5 Mio € und 15 %')).toBe('und und')
    expect(norm('Rabatt 15,5 % ab 2026').removed).toEqual(['15,5 %'])
  })

  it('an IBAN-like match of years only is kept', () => {
    expect(canon('DE12 2024 2025 2026')).toBe('de12 2024 2025 2026')
  })

  it('a phone match needs 7 to 15 digits and no year group without +', () => {
    expect(canon('0 2026 2027 1234')).toBe('0 2026 2027 1234')
    expect(canon('0123 45')).toBe('0123 45')
  })

  it('protected spans are not eaten by the money pattern', () => {
    expect(canon('2026 € Budget')).toBe('2026 budget')
    expect(canon('Version 2.4 €')).toBe('version 2 4')
  })
})

describe('normalize through the front', () => {
  it('Q8: umlaut, case and spacing variants give the same canonical title and tokens', () => {
    const a = front('Sommerfest Gärtnerei München 2026')
    const b = front('  sommerfest   GAERTNEREI muenchen 2026 ')
    expect(a.normalized.canonical).toBe(b.normalized.canonical)
    expect(a.lang).toBe('de')
    expect(b.lang).toBe('de')
  })
})
