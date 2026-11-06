/**
 * Corpus snapshot (SPEC 19.2): every fixture alone, empty store, default config (exact 16).
 * Update with `pnpm vitest run -u` after an intended output change.
 */
import { describe, expect, it } from 'vitest'
import { buildReport, independentSnapshot } from '../scripts/lib/corpus.ts'

describe('corpus snapshot', () => {
  it('corpus.independent.md', async () => {
    const rep = buildReport()
    await expect(independentSnapshot(rep.rows)).toMatchFileSnapshot('./__snapshots__/corpus.independent.md')
  })
})
