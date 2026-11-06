import { describe, expect, it } from 'vitest'
import { compile } from '../../src/core/compile.ts'
import { resolveDoc } from '../../src/core/resolve.ts'
import {
  createSlugger,
  ExhaustedError,
  InputError,
  isSluggerError,
  isValidSlug,
  type SlugResult,
  slug,
  suggest,
} from '../../src/index.ts'
import { doc } from '../helpers/concepts.ts'
import { drive } from '../helpers/drive.ts'
import { cfgOf } from '../helpers/front.ts'

describe('suggest() without a store (tier none)', () => {
  it('returns the best body and a full result', () => {
    const r = suggest('Jahresbericht Vertrieb Nord 2026')
    expect(r).toMatchObject({
      id: 'vertrieb-nord-26',
      body: 'vertrieb-nord-26',
      tail: '',
      reason: 'base',
      tailIndex: 0,
      storeTier: 'none',
      checked: false,
      algorithm: 1,
      lang: 'de',
    })
    expect(r.segments.map((s) => [s.text, s.kind, s.cls, s.rung])).toEqual([
      ['vertrieb', 'word', 'topic', 'full'],
      ['nord', 'word', 'direction', 'full'],
      ['26', 'number', 'year', 'number'],
    ])
    expect(r.stems).toEqual(createSlugger().analyze('Jahresbericht Vertrieb Nord 2026').storedStems)
    expect(r.titleKey).toMatch(/^[0-9a-f]{16}$/)
    expect(r.configFingerprint).toBe(createSlugger().fingerprint)
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('a padding tail in exact mode, none in max mode', () => {
    const r = suggest('Sommerfest 2026')
    expect(r.body).toBe('sommerfest-26')
    expect(r.tail).toMatch(/^[bcdfghjkmnpqrstvwxyz][bcdfghjkmnpqrstvwxyz2-9]$/)
    expect(r.segments.at(-1)).toEqual({ text: r.tail, kind: 'tail', verbatim: false })
    expect(createSlugger({ lengthMode: 'max' }).slug('MRT Knie links')).toBe('mrt-knie-links')
  })

  it('slug() is the id of suggest(); module functions use the default slugger', () => {
    expect(slug('Chocolate Cake Recipe')).toBe('choc-cake-recipe')
    expect(createSlugger().slug('Chocolate Cake Recipe')).toBe(suggest('Chocolate Cake Recipe').id)
  })

  it('is deterministic across calls and slugger instances', () => {
    const titles = ['Q3 2026 Marketing Budget Review', 'Sprintplanung Sprint 22', '', 'Öl', 'Договор 2026']
    for (const t of titles) {
      const a = createSlugger().suggest(t)
      const b = createSlugger().suggest(t)
      expect(a).toEqual(b)
      expect(suggest(t)).toEqual(a)
    }
  })

  it('empty, opaque and onEmpty throw', () => {
    expect(suggest('der die das')).toMatchObject({ body: 'doc', reason: 'empty' })
    expect(suggest('der die das').warnings).toContain('empty')
    const o = createSlugger({ leak: 'opaque', secret: 'a-secret-of-16-chars' }).suggest('Vertrieb Nord 2026')
    expect(o).toMatchObject({ body: '', reason: 'opaque' })
    expect(o.id.length).toBe(16)
    expect(() => createSlugger({ onEmpty: 'throw' }).suggest('   ')).toThrow(InputError)
    expect(() => suggest(42 as unknown as string)).toThrow(InputError)
  })

  it('leak minimal drops names, versions and markers', () => {
    const s = createSlugger({ leak: 'minimal' })
    expect(s.suggest('AGB Version 3.1').body).toBe('agb')
    expect(s.suggest('Trip report from Lisbon').body).not.toContain('lisbon')
  })

  it('separators and lengths', () => {
    const u = createSlugger({ separator: '_' }).suggest('Q3 2026 Marketing Budget Review')
    expect(u.id).toBe('mktg_budget_26q3')
    const p = createSlugger({ separator: '' }).suggest('Q3 2026 Marketing Budget Review')
    expect(p.id.length).toBe(16)
    expect(p.id).toMatch(/^[a-z][a-z0-9]*$/)
    const l = createSlugger({ length: 24 }).suggest('Q3 2026 Marketing Budget Review')
    expect(l.id.length).toBe(24)
  })
})

describe('suggest() with taken (tier A)', () => {
  it('a taken body-only ID gets a tail through refitWithTail (SPEC 12.2 B)', () => {
    const r = suggest('Jahresbericht Vertrieb Nord 2026', { taken: new Set(['vertrieb-nord-26']) })
    expect(r).toMatchObject({ body: 'ver-nord-2026', reason: 'shared-body', storeTier: 'A', checked: true })
    expect(r.tail.length).toBe(2)
    expect(r.warnings).toContain('tail-grown')
  })

  it('a taken tailed ID walks the tail index from 0; a function works too', () => {
    const first = suggest('Sommerfest 2026')
    const second = suggest('Sommerfest 2026', { taken: new Set([first.id]) })
    expect(second.body).toBe(first.body)
    expect(second.tailIndex).toBe(1)
    expect(second.id).not.toBe(first.id)
    const third = suggest('Sommerfest 2026', { taken: (id) => id === first.id || id === second.id })
    expect(third.tailIndex).toBe(2)
  })

  it('exclude skips IDs without asking taken', () => {
    const first = suggest('Sommerfest 2026')
    const asked: string[] = []
    const r = suggest('Sommerfest 2026', {
      exclude: [first.id],
      taken: (id) => {
        asked.push(id)
        return false
      },
    })
    expect(r.id).not.toBe(first.id)
    expect(asked).not.toContain(first.id)
  })

  it('tier A exhausts after maxScan', () => {
    let err: unknown
    try {
      suggest('Sommerfest 2026', { taken: () => true })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ExhaustedError)
    expect(isSluggerError(err, 'E_EXHAUSTED')).toBe(true)
  })
})

describe('resolve generator with counts (tiers B and C)', () => {
  const cfg = cfgOf()
  const gen = (title: string, exclude: string[] = []) => resolveDoc(doc(title), cfg, compile(cfg), new Set(exclude))

  it('tier B: a shared body starts the tail index at countBody', () => {
    const { out, reqs } = drive(gen('Jahresbericht Vertrieb Nord 2026'), {
      counts: new Map([
        ['vertrieb-nord-26', 1],
        ['ver-nord-2026', 3],
      ]),
    })
    expect(out.body).toBe('ver-nord-2026')
    expect(out.tailIndex).toBe(3)
    expect(out.reason).toBe('shared-body')
    expect(reqs[0]).toEqual({ op: 'stats', stems: [...doc('Jahresbericht Vertrieb Nord 2026').storedStems] })
  })

  it('a free best body asks stats, countBodies and exists, in this order', () => {
    const { out, reqs } = drive(gen('Chocolate Cake Recipe'), { counts: new Map() })
    expect(out.id).toBe('choc-cake-recipe')
    expect(reqs.map((r) => r.op)).toEqual(['stats', 'countBodies', 'exists'])
  })
})

describe('invariants over generated IDs', () => {
  const titles = [
    'Jahresbericht Vertrieb Nord 2026',
    'Kick-off Meeting KI Strategie Q1 2026',
    'Tavora Phone 8 128 GB Midnight Blue',
    'Archiv 1950–2020',
    'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz',
    'Scunthorpe Town Walking Tour',
    '0O1lI 0o1li',
    'admin',
  ]
  const configs = [{}, { lengthMode: 'max' as const }, { separator: '' as const }, { length: 8 }, { length: 40 }]
  it('every ID passes isValidSlug for its config', () => {
    for (const config of configs)
      for (const t of titles) {
        const r: SlugResult = createSlugger(config).suggest(t)
        expect(isValidSlug(r.id, config), `${t} ${JSON.stringify(config)} -> ${r.id}`).toBe(true)
      }
  })
})
