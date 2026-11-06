/**
 * Playground (SPEC 18.7): prefilled titles come from the synthetic corpus, the presets equal the README
 * recipes, the imports resolve against the built `dist/` and the local server maps paths like Pages.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { medicineConfig, medicineExamples } from '../examples/recipes/medicine.ts'
import { procurementConfig, procurementExamples } from '../examples/recipes/procurement.ts'
import { softwareConfig, softwareExamples } from '../examples/recipes/software.ts'
import { DEFAULT_TITLES, DEMO_SECRET, PRESETS } from '../playground/data.js'
import { loadFixtures } from '../scripts/lib/corpus.ts'
import { fileFor } from '../scripts/lib/playground.ts'
import { createSlugger, type SluggerConfig } from '../src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('playground', () => {
  it('prefills 24 corpus titles from 10+ fields, German and English', () => {
    const corpus = new Map(loadFixtures().map((f) => [f.title, f]))
    expect(DEFAULT_TITLES).toHaveLength(24)
    const kinds = new Set<string>()
    const langs = new Set<string>()
    for (const t of DEFAULT_TITLES) {
      const f = corpus.get(t)
      expect(f, t).toBeDefined()
      kinds.add(f?.kind ?? '')
      langs.add(f?.lang ?? '')
    }
    expect(kinds.size).toBeGreaterThanOrEqual(10)
    expect(langs).toContain('de')
    expect(langs).toContain('en')
  })

  it('presets are the README recipes', () => {
    const pairs: [string, SluggerConfig, Readonly<Record<string, string>>][] = [
      ['software', softwareConfig, softwareExamples],
      ['medicine', medicineConfig, medicineExamples],
      ['procurement', procurementConfig, procurementExamples],
    ]
    expect(Object.keys(PRESETS).sort()).toEqual(pairs.map((p) => p[0]).sort())
    for (const [name, cfg, examples] of pairs) {
      const p = PRESETS[name]
      expect(p, name).toBeDefined()
      if (p === undefined) continue
      expect(p.lexicon, name).toEqual(cfg.lexicon)
      expect(p.denyTokens, name).toEqual(cfg.denyTokens)
      const reserved = cfg.reserved
      expect(p.reserved, name).toEqual(typeof reserved === 'object' ? reserved.add : undefined)
      for (const t of p.titles) expect(Object.keys(examples), `${name}: ${t}`).toContain(t)
    }
  })

  it('a blur does not re-run and close the explain panel; a re-run keeps the open row (review fix)', () => {
    const app = read('playground/app.js')
    expect(app).not.toMatch(/el\.addEventListener\('input', later\)\s*el\.addEventListener\('change', later\)/)
    expect(app).toContain("if (toggle) el.addEventListener('change', later)")
    expect(app).toContain('if (rows[selected]) show(selected)')
  })

  it('the demo secret is a valid secret', () => {
    expect(() => createSlugger({ leak: 'opaque', secret: DEMO_SECRET })).not.toThrow()
  })

  it('imports only the built package and its own files', () => {
    const app = read('playground/app.js')
    expect(app.startsWith('// @ts-check')).toBe(true)
    const imports = [...app.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.sort()).toEqual(['./data.js', './dist/adapters/memory.js', './dist/index.js'])
    if (existsSync(join(root, 'dist', 'index.js'))) {
      expect(existsSync(join(root, 'dist', 'adapters', 'memory.js'))).toBe(true)
    }
    const html = read('playground/index.html')
    expect(html).toContain('Runs fully in your browser. Do not paste confidential data.')
    expect(html).toContain('src="./app.js"')
    expect(html).toContain('href="./style.css"')
  })

  it('the local server maps paths like Pages and stays in its folders', () => {
    expect(fileFor(root, '/')).toBe(join(root, 'playground', 'index.html'))
    expect(fileFor(root, '/app.js?x=1')).toBe(join(root, 'playground', 'app.js'))
    expect(fileFor(root, '/dist/index.js')).toBe(join(root, 'dist', 'index.js'))
    expect(fileFor(root, '/dist/adapters/memory.js')).toBe(join(root, 'dist', 'adapters', 'memory.js'))
    expect(fileFor(root, '/../package.json')).toBeNull()
    expect(fileFor(root, '/%2e%2e/package.json')).toBeNull()
    expect(fileFor(root, '/dist/../package.json')).toBeNull()
    expect(fileFor(root, '/%E0%A4%A')).toBeNull()
  })
})
