/**
 * Section 20 acceptance rows (milestone M4): the reference re-implementation in
 * `scripts/ref-acceptance.ts` and `src` agree on every row, every expected value can occur (I1, I2),
 * and the reference scores equal the `src` scores.
 */
import { describe, expect, it } from 'vitest'
import { runAcceptance } from '../scripts/ref-acceptance.ts'

describe('acceptance examples (SPEC 20)', () => {
  const results = runAcceptance()
  it('reference and src agree on every row', () => {
    const bad = results.filter((r) => !r.agree).map((r) => `${r.row.n}: ref ${r.ref.body}+${r.ref.tail} src ${r.srcId}`)
    expect(bad).toEqual([])
  })
  it('every spec value can occur (I1, I2)', () => {
    expect(results.filter((r) => r.impossible !== null).map((r) => `${r.row.n}: ${r.impossible}`)).toEqual([])
  })
  it('reference scores equal src scores', () => {
    expect(results.flatMap((r) => r.scoreMismatch.map((m) => `${r.row.n}: ${m}`))).toEqual([])
  })
  it('the spec `ref` rows that changed are only the documented ones (docs/DEVIATIONS.md)', () => {
    const changed = results.filter((r) => r.row.status === 'ref' && r.changed).map((r) => r.row.n)
    expect(changed).toEqual(['11', '26'])
  })
})
