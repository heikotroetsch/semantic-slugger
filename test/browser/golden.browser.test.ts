/**
 * Browser parity (SPEC 19.5): the built `dist/index.js` gives the golden IDs in chromium, firefox and
 * webkit (vitest browser mode, Playwright provider). Run `pnpm build` first, then `pnpm test:browser`.
 */
import { describe, expect, it } from 'vitest'
import { memoryStore } from '../../dist/adapters/memory.js'
import { createSlugger, explain, slug } from '../../dist/index.js'
import golden from '../golden/v1.subset.json'

describe('golden subset in the browser', () => {
  it('every golden title gives its golden ID', () => {
    expect(golden.length).toBeGreaterThan(100)
    for (const r of golden) expect(slug(r.title), r.id).toBe(r.slug)
  })

  it('explain and the memory store work', async () => {
    expect(explain('Jahresbericht Vertrieb Nord 2026').result.id).toBe('vertrieb-nord-26')
    const s = createSlugger()
    const store = memoryStore()
    const a = await s.createUnique('Chocolate Cake Recipe', { store })
    const b = await s.createUnique('Chocolate Cake Recipe', { store })
    expect(a.result.id).not.toBe(b.result.id)
  })
})
