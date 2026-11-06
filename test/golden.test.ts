/**
 * Golden subset (SPEC 14.2, 19.5): the committed IDs of `test/golden/v1.subset.json` must not change
 * without a deliberate `pnpm test:update`. The browser parity test checks the same file in real
 * browsers.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadFixtures } from '../scripts/lib/corpus.ts'
import { GOLDEN_CONTENT, type GoldenRow, goldenSubset } from '../scripts/lib/golden.ts'
import { slug } from '../src/index.ts'

const golden = JSON.parse(readFileSync(new URL('./golden/v1.subset.json', import.meta.url), 'utf8')) as GoldenRow[]

describe('golden subset v1', () => {
  it('holds every edge fixture and 60 content titles from 10+ domains', () => {
    const edges = loadFixtures().filter((f) => f.kind === 'edge')
    expect(golden.filter((r) => r.kind === 'edge').map((r) => r.id)).toEqual(edges.map((f) => f.id))
    const content = golden.filter((r) => r.kind !== 'edge')
    expect(content).toHaveLength(GOLDEN_CONTENT)
    expect(new Set(content.map((r) => r.kind)).size).toBeGreaterThanOrEqual(10)
  })

  it('the committed IDs equal the current output', () => {
    expect(goldenSubset()).toEqual(golden)
    for (const r of golden) expect(slug(r.title), r.id).toBe(r.slug)
  })
})
