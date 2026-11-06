/**
 * The README shows real outputs (SPEC 18.9). This test checks the generated tables and every example
 * value in the README against the code.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_DOCS, updateReadme } from '../scripts/lib/readme.ts'
import { createSlugger, DEFAULTS, explain, type LanguagePack, slug, suggest } from '../src/index.ts'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
/** The README with table cells trimmed, so the checks do not depend on column alignment. */
const flat = readme.replace(/ +\|/g, ' |').replace(/\| +/g, '| ').replace(/-{3,}/g, '---')

describe('README', () => {
  it('generated tables are up to date (pnpm test:update)', () => {
    expect(updateReadme(readme)).toBe(readme)
  })

  it('the config table covers every option', () => {
    const keys = CONFIG_DOCS.map((d) => d.key as string)
    for (const k of Object.keys(DEFAULTS)) expect(keys, k).toContain(k)
    expect(new Set(keys).size).toBe(keys.length)
    // every documented key is a known key (unknown keys throw ConfigError)
    for (const k of keys) expect(() => createSlugger({ [k]: undefined }), k).not.toThrow()
  })

  it('every `slug(...) // ...` example of the default slugger is right', () => {
    const re = /(?<![\w.])slug\('([^']+)'\)\)?\s*\/\/\s*'([^']+)'/g
    const found = [...readme.matchAll(re)]
    expect(found.length).toBeGreaterThanOrEqual(2)
    for (const m of found) expect(slug(m[1] ?? ''), m[1]).toBe(m[2])
  })

  it('the edge case table is right', () => {
    const start = flat.indexOf('## Edge cases')
    const table = flat.slice(start, flat.indexOf('\n## ', start + 5))
    const rows = [...table.matchAll(/^\| `([^`]*)` \| `([^`]+)` \|/gm)]
    expect(rows.length).toBeGreaterThanOrEqual(6)
    for (const m of rows) expect(slug(m[1] ?? ''), m[1]).toBe(m[2])
    expect(slug('🚚📦🚚')).toBe(slug(''))
    expect(slug('   ')).toBe(slug(''))
    expect(slug('Sommerfest Gärtnerei München 2026')).toBe(slug('SOMMERFEST  gaertnerei muenchen 2026'))
    expect(slug('x'.repeat(5000))).toHaveLength(16)
  })

  it('the other examples are right', () => {
    const check = (code: string, value: string) => {
      expect(readme, code).toContain(code)
      return value
    }
    expect(
      createSlugger({ length: 20, lengthMode: 'max', separator: '_' }).slug('Quarterly Sales Review Q3 2026'),
    ).toBe(check("slugger.slug('Quarterly Sales Review Q3 2026') // 'sales_review_26q3'", 'sales_review_26q3'))
    expect(suggest('Sommerfest 2026').id).toBe(
      check("suggest('Sommerfest 2026').id // 'sommerfest-26-jf'", 'sommerfest-26-jf'),
    )
    expect(suggest('Sommerfest 2026', { taken: new Set(['sommerfest-26-jf']) }).id).not.toBe('sommerfest-26-jf')

    const t = 'Onboarding checklist for Maria Lopez at Acme'
    expect(flat).toContain(`| \`normal\` (default) | the main words, names included | \`${slug(t)}\` |`)
    expect(flat).toContain(`| \`${createSlugger({ leak: 'minimal' }).slug(t)}\` |`)
    expect(flat).toContain(`| \`${createSlugger({ leak: 'opaque', secret: 'my-tenant-secret-123456' }).slug(t)}\` |`)
    expect(readme).toContain(`gives \`${createSlugger({ denyTokens: ['Maria', 'Lopez'] }).slug(t)}\``)

    const nl: LanguagePack = {
      code: 'nl',
      id: 'my-nl-pack@1',
      stopWords: ['de', 'het', 'een', 'van', 'en', 'voor', 'met'],
      stem: (word) => word.replace(/(en|s)$/, ''),
    }
    expect(createSlugger({ languages: ['de', 'en', 'nl'], languagePacks: [nl] }).suggest('De fiets van oma').lang).toBe(
      'nl',
    )
  })

  it('the explain() example is the real output', () => {
    const text = explain('Jahresbericht Vertrieb Nord 2026').toString()
    expect(readme).toContain(`\`\`\`\n${text}\n\`\`\``)
  })

  it('uses simple, domain-neutral wording', () => {
    for (const w of ['delve', 'robust', 'seamless', 'testament to', 'crucial', '—']) {
      expect(readme.toLowerCase(), w).not.toContain(w)
    }
    // procurement appears only in the recipe section, as one example field among others
    const recipes = readme.slice(readme.indexOf('## Teach it your field'), readme.indexOf('## How it works'))
    const outside = readme.replace(recipes, '')
    expect(outside.toLowerCase()).not.toMatch(/procurement|rahmenvertrag|supplier|lieferant/)
  })
})
