import { describe, expect, it } from 'vitest'
import { analyze, ConfigError, createSlugger, InputError } from '../../src/index.ts'

describe('analyze() (SPEC 16.1)', () => {
  it('is public on the module and on the slugger', () => {
    const a = analyze('Jahresbericht Vertrieb Nord 2026')
    expect(a).toEqual(createSlugger().analyze('Jahresbericht Vertrieb Nord 2026'))
    expect(a.lang).toBe('de')
    expect(a.langSource).toBe('heuristic')
    expect(a.canonical).toBe('jahresbericht vertrieb nord 2026')
    expect(a.storedStems).toEqual(['berich', 'jahr', 'jahresberich', 'nord', 'vertrieb', 'y2026'])
    expect(a.pool).toEqual(['vertrieb', 'y2026', 'nord'])
    expect(a.concepts.map((c) => c.key)).toEqual(['vertrieb', 'jahresberich', 'y2026', 'nord'])
    expect(a.concepts.find((c) => c.key === 'jahresberich')?.weak).toBe(true)
    expect(a.rank.map((r) => r.score)).toEqual([370, 235, 215])
    expect(a.titleKey).toMatch(/^[0-9a-f]{16}$/)
    expect(a.empty).toBe(false)
    expect(a.compounds).toEqual([{ word: 'jahresbericht', parts: ['jahr', 'bericht'], linkers: ['', 'es'], kept: [] }])
  })

  it('shows kept tokens with roles and keys', () => {
    const a = analyze('Acme GmbH Jahresbericht für März 2026')
    expect(
      a.tokens.map((t) => `${t.ascii}:${t.role ?? t.cls}${t.key ? `=${t.key}` : ''}${t.weak ? '~weak' : ''}`),
    ).toEqual(['acme:name', 'jahresbericht:topic~weak', 'maerz:month=m03', '2026:year=y2026'])
    expect(a.removed.map((r) => r.list)).toEqual(['legal', 'function'])
  })

  it('returns frozen plain data without internal fields', () => {
    const a = analyze('Sommerfest Kindergarten 2026')
    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.concepts)).toBe(true)
    for (const c of a.concepts) {
      expect(Object.isFrozen(c)).toBe(true)
      expect(Object.keys(c).sort()).toEqual(
        [
          'cls',
          'key',
          'pos',
          'score',
          'stemKeys',
          'storedKeys',
          'tf',
          'verbatim',
          'weak',
          ...(c.lex ? ['lex'] : []),
          ...(c.bond ? ['bond'] : []),
        ].sort(),
      )
    }
    expect(() => JSON.stringify(a)).not.toThrow()
  })

  it('is deterministic across slugger instances', () => {
    const t = 'Q3 2026 Marketing Budget Review'
    expect(createSlugger().analyze(t)).toEqual(createSlugger().analyze(t))
  })

  it('takes a per-call language', () => {
    expect(analyze('Buchungssystem', { lang: 'de' }).concepts.map((c) => c.key)).toEqual(['buchung'])
    expect(analyze('Buchungssystem', { lang: 'en' }).lang).toBe('en')
    expect(() => analyze('x', { lang: 'fr' })).toThrow(ConfigError)
  })

  it('uses the config: hashed stems, leak, lexicon', () => {
    const s = createSlugger({ storeStems: 'hashed', secret: 'analyze-test-secret-0123' })
    const a = s.analyze('Jahresbericht Vertrieb Nord 2026')
    expect(a.storedStems.every((x) => /^[0-9a-f]{16}$/.test(x))).toBe(true)
    expect(a.concepts.find((c) => c.key === 'vertrieb')?.stemKeys).toEqual(['vertrieb'])
    const m = createSlugger({ leak: 'minimal' }).analyze('Onboarding checklist for Acme 2026')
    expect(m.pool).not.toContain('acme')
    const l = createSlugger({ lexicon: [{ key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] }] })
    expect(l.analyze('Kubernetes Upgrade').concepts[0]?.cls).toBe('name')
  })

  it('empty titles give no concepts and no stems', () => {
    for (const t of ['', '   ', 'und die der', '🚚']) {
      const a = analyze(t)
      expect(a.empty, t).toBe(true)
      expect(a.concepts, t).toEqual([])
      expect(a.storedStems, t).toEqual([])
    }
    expect(analyze('').warnings).toContain('empty')
  })

  it('throws InputError for a non-string title', () => {
    expect(() => analyze(42 as unknown as string)).toThrow(InputError)
  })
})
