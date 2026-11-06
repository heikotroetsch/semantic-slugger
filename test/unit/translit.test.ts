import { describe, expect, it } from 'vitest'
import { front } from '../helpers/front.ts'

const pack = {
  code: 'xx',
  id: 'xx@1',
  stopWords: ['ka'],
  stem: (s: string) => s,
  translit: { ŋ: 'ng', ɛ: 'e' },
}

describe('transliteration (SPEC 4.2)', () => {
  it('Cyrillic titles', () => {
    const f = front('Договор поставки электроэнергии 2026')
    expect(f.normalized.canonical).toBe('dogovor postavki elektroenergii 2026')
    const words = f.tokens.filter((t) => t.cls === 'word')
    expect(words.every((t) => t.translit && t.lang === 'und')).toBe(true)
    expect(front('Щука Ёж Ъ').normalized.canonical).toBe('shchuka ezh')
    expect(front('Їжак Ґанок Єва').normalized.canonical).toBe('yizhak ganok yeva')
  })

  it('Greek titles, also with accents', () => {
    expect(front('Θάλασσα και ψάρια').normalized.canonical).toBe('thalassa kai psaria')
    expect(front('Ωραίος χάρτης').normalized.canonical).toBe('oraios chartis')
  })

  it('keeps the case of transliterated words', () => {
    const t = front('Москва').tokens[0]
    expect(t?.case).toBe('title')
    expect(front('МОСКВА').tokens[0]?.case).toBe('upper')
  })

  it('a user transliterate hook runs first, per chunk, and marks its output', () => {
    const f = front('Tokyo 東京 2026', { transliterate: (s) => (s === '東京' ? 'tokyo' : s) })
    expect(f.normalized.canonical).toBe('tokyo tokyo 2026')
    expect(f.tokens.map((t) => t.translit)).toEqual([false, true, false])
    expect(f.warnings).not.toContain('script-dropped')
  })

  it('a pack translit table runs before the built-in tables', () => {
    const f = front('Saŋa ɛla', { languagePacks: [pack], languages: ['de', 'en', 'xx'] })
    expect(f.normalized.canonical).toBe('sanga ela')
    expect(f.tokens.every((t) => t.translit)).toBe(true)
  })
})
