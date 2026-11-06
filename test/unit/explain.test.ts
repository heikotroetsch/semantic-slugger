import { describe, expect, it } from 'vitest'
import { memoryStore } from '../../src/adapters/memory.ts'
import { createSlugger, explain, type Step, suggest } from '../../src/index.ts'

function step<S extends Step['stage']>(steps: readonly Step[], stage: S): Extract<Step, { stage: S }> {
  const s = steps.find((x) => x.stage === stage)
  if (s === undefined) throw new Error(`no step ${stage}`)
  return s as Extract<Step, { stage: S }>
}

describe('explain()', () => {
  it('gives the same result as suggest()', () => {
    for (const t of ['Jahresbericht Vertrieb Nord 2026', 'Chocolate Cake Recipe', 'Sprint Review 14', '']) {
      expect(explain(t).result).toEqual(suggest(t))
    }
  })

  it('has every stage in pipeline order', () => {
    const e = explain('Jahresbericht Vertrieb Nord 2026')
    expect(e.steps.map((s) => s.stage)).toEqual([
      'normalize',
      'language',
      'tokens',
      'phrases',
      'stopwords',
      'names',
      'compounds',
      'concepts',
      'rank',
      'ladders',
      'fit',
      'resolve',
    ])
    expect(e.input).toBe('Jahresbericht Vertrieb Nord 2026')
    expect(e.config.length).toBe(16)
  })

  it('shows weak words, compounds, rank rows and the fit', () => {
    const e = explain('Jahresbericht Vertrieb Nord 2026')
    expect(step(e.steps, 'normalize').surface).toBe('jahresbericht vertrieb nord 2026')
    expect(step(e.steps, 'language')).toMatchObject({ lang: 'de', source: 'heuristic' })
    expect(step(e.steps, 'stopwords').weak).toContain('jahresbericht')
    expect(step(e.steps, 'compounds').splits[0]).toMatchObject({ word: 'jahresbericht', parts: ['jahr', 'bericht'] })
    const rank = step(e.steps, 'rank')
    expect(rank.df).toBe('static')
    expect(rank.rows.map((r) => r.key)).toEqual(['vertrieb', 'y2026', 'nord'])
    expect(rank.rows[0]).toMatchObject({ cls: 'topic', base: 280, score: 400 })
    expect(rank.excluded).toContainEqual({ key: 'jahresberich', why: 'weak' })
    const fit = step(e.steps, 'fit')
    expect(fit.best[0]).toMatchObject({ id: 'vertrieb-nord-26', cost: 120 })
    expect(fit.best.length).toBeLessThanOrEqual(5)
    // a fill segment from an unused word takes the room of a padding tail (quality round 1), before
    // the number segments (quality round 2)
    expect(fit.best.map((b) => b.id).slice(0, 2)).toEqual(['vertrieb-nord-26', 'vertrieb-jahr-26'])
    expect(step(explain('Board').steps, 'fit').best[0]?.id).toBe('board-<t10>')
    const lad = step(e.steps, 'ladders').rows.find((r) => r.key === 'vertrieb')
    expect(lad?.rungs[0]).toMatchObject({ text: 'vertrieb', kind: 'full', plain: true })
    expect(step(e.steps, 'resolve').tried).toEqual([{ id: 'vertrieb-nord-26', status: 'ok', detail: 'not checked' }])
  })

  it('lists removed stop words, deny tokens and name signals', () => {
    const s = createSlugger({ denyTokens: ['Weber'] })
    const e = s.explain('Onboarding checklist for Acme with Weber')
    const removed = step(e.steps, 'stopwords').removed
    expect(removed).toContainEqual({ word: 'weber', list: 'deny' })
    expect(removed).toContainEqual({ word: 'for', list: 'function' })
    expect(step(e.steps, 'names').names).toContainEqual({ word: 'acme', signal: 'sentence-case' })
    expect(e.result.id).not.toContain('web')
  })

  it('shows taken IDs in the resolve step', () => {
    const first = suggest('Chocolate Cake Recipe').id
    const e = explain('Chocolate Cake Recipe', { taken: new Set([first]) })
    const tried = step(e.steps, 'resolve').tried
    expect(tried[0]).toEqual({ id: first, status: 'taken' })
    expect(tried.at(-1)).toEqual({ id: e.result.id, status: 'ok', detail: 'tier A' })
  })

  it('empty and opaque titles skip the fit steps', () => {
    const e = explain('der die das')
    expect(e.steps.map((s) => s.stage)).not.toContain('rank')
    expect(e.result.reason).toBe('empty')
    const o = createSlugger({ leak: 'opaque', secret: 'explain-test-secret-01' }).explain('Sommerfest 2026')
    expect(o.result.reason).toBe('opaque')
    expect(o.steps.at(-1)?.stage).toBe('resolve')
  })

  it('toString() gives the text table', () => {
    const text = explain('Jahresbericht Vertrieb Nord 2026').toString()
    const lines = text.split('\n')
    expect(lines[0]).toMatch(/^semantic-slugger v1 \| length 16 exact \| sep "-" \| leak normal \| fp [0-9a-f]{16}$/)
    expect(text).toContain('normalize   jahresbericht vertrieb nord 2026')
    expect(text).toContain('compounds   jahresbericht = jahr + es + bericht')
    expect(text).toMatch(/rank {8}key +cls +base +rar +pos +tf +lex +diff +score/)
    expect(text).toMatch(/ +vertrieb +topic +280 +20 +90 +1 +0 +0 +400/)
    expect(text).toContain('excluded: jahresberich (weak)')
    expect(text).toContain('fit         vertrieb-nord-26 120 | ')
    expect(text).toContain('resolve     vertrieb-nord-26 ok (not checked)')
    expect(lines.at(-1)).toBe('result      vertrieb-nord-26  reason base  lang de  tail none')
    expect(String(explain('Jahresbericht Vertrieb Nord 2026'))).toBe(text)
  })

  it('toJSON() is plain JSON and hides the secret', () => {
    const s = createSlugger({ secret: 'do-not-print-this-secret', transliterate: (x) => x })
    const e = s.explain('Sommerfest 2026')
    const json = JSON.stringify(e)
    expect(json).not.toContain('do-not-print-this-secret')
    const o = JSON.parse(json) as { input: string; config: { secret: string; transliterate: string }; steps: unknown[] }
    expect(o.input).toBe('Sommerfest 2026')
    expect(o.config.secret).toBe('[hidden]')
    expect(o.config.transliterate).toBe('fn')
    expect(o.steps).toHaveLength(e.steps.length)
    expect(e.toString()).not.toContain('do-not-print-this-secret')
  })

  it('is frozen', () => {
    const e = explain('Sommerfest 2026')
    expect(Object.isFrozen(e)).toBe(true)
    expect(Object.isFrozen(e.steps)).toBe(true)
  })
})

describe('generate({ trace: true })', () => {
  it('attaches the trace with store answers', async () => {
    const s = createSlugger()
    const store = memoryStore()
    for (let i = 0; i < 2; i++) await s.createUnique('Sommerfest 2026', { store })
    const plain = await s.generate('Sommerfest 2026', { store })
    expect(plain.trace).toBeUndefined()
    const r = await s.generate('Sommerfest 2026', { store, trace: true })
    expect(r.id).toBe(plain.id)
    const t = r.trace
    expect(t).toBeDefined()
    expect(t?.result.id).toBe(r.id)
    expect(step(t?.steps ?? [], 'rank')).toMatchObject({ df: 'store', N: 2 })
    const tried = step(t?.steps ?? [], 'resolve').tried
    expect(tried.some((x) => x.status === 'body-taken')).toBe(true)
    expect(tried.at(-1)).toMatchObject({ id: r.id, status: 'ok', detail: 'tier C' })
    expect(t?.toString()).toContain('df store, N 2')
  })
})

describe('candidates()', () => {
  it('gives the fit bodies, best first', () => {
    const s = createSlugger()
    const c = s.candidates('Jahresbericht Vertrieb Nord 2026')
    expect(c[0]).toMatchObject({ body: 'vertrieb-nord-26', tailLength: 0, cost: 120 })
    expect(c.length).toBe(5)
    for (let i = 1; i < c.length; i++) expect((c[i]?.cost ?? 0) >= (c[i - 1]?.cost ?? 0)).toBe(true)
    expect(c[0]?.segments.map((x) => x.text)).toEqual(['vertrieb', 'nord', '26'])
    expect(s.candidates('Jahresbericht Vertrieb Nord 2026', { limit: 2 })).toHaveLength(2)
  })

  it('is empty for empty titles and opaque mode', () => {
    expect(createSlugger().candidates('der die das')).toEqual([])
    expect(createSlugger({ leak: 'opaque', secret: 'explain-test-secret-01' }).candidates('Sommerfest')).toEqual([])
  })

  it('checks the limit', () => {
    expect(() => createSlugger().candidates('x', { limit: 0 })).toThrow(/limit/)
  })
})
