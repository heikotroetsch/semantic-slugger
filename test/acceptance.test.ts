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
    // 12 to 14, 19, 20, 27 to 29 and 35 changed in quality round 1 (bridge cuts, fill segments); round 2:
    // 11, 24, 26, 28, 29 and 35 changed (class weights, stub cost, fill before numbers, no `tea` decoy
    // fill: a whole word and a grown weekday instead)
    expect(changed).toEqual(['11', '12', '13', '14', '19', '20', '24', '26', '27', '28', '29', '35'])
  })
})
