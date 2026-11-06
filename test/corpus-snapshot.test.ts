/**
 * Corpus snapshots (SPEC 19.2): every fixture alone (empty store), and all fixtures in order through
 * createUnique with one memory store; default config (exact 16).
 * Update with `pnpm vitest run -u` after an intended output change.
 */
import { describe, expect, it } from 'vitest'
import { buildReport, buildSequential, independentSnapshot, sequentialSnapshot } from '../scripts/lib/corpus.ts'

describe('corpus snapshot', () => {
  it('corpus.independent.md', async () => {
    const rep = buildReport()
    await expect(independentSnapshot(rep.rows)).toMatchFileSnapshot('./__snapshots__/corpus.independent.md')
  })

  it('corpus.sequential.md', async () => {
    const { rows } = await buildSequential()
    await expect(sequentialSnapshot(rows)).toMatchFileSnapshot('./__snapshots__/corpus.sequential.md')
  })
})
