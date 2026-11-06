/**
 * Quality gates (SPEC 19.6): Q1, Q3, Q4, Q7, Q8, Q10, Q15, Q18 and Q19 (independent run) and, from M5,
 * Q5, Q6, Q9 and Q14 (sequential run, one memory store). Q2, Q11 and Q17 are report only. Q12
 * (worst-case fit) is gated in `test/unit/fit.test.ts`. `pnpm corpus:report` prints every metric.
 */
import { describe, expect, it } from 'vitest'
import { buildReport, buildSequential } from '../scripts/lib/corpus.ts'

/**
 * Q4 padding tail rate gates, set at M4 from the measured values rounded up to the next 5% (SPEC 19.6).
 * They may only go down later.
 */
const Q4_GATE_OVERALL = 25
const Q4_GATES: Readonly<Record<string, number>> = {
  blog: 20,
  education: 20,
  event: 10,
  finance: 55,
  hr: 25,
  legal: 35,
  marketing: 25,
  medical: 30,
  meeting: 65,
  news: 5,
  procurement: 25,
  product: 5,
  project: 45,
  realestate: 25,
  recipe: 20,
  research: 5,
  software: 45,
  ticket: 10,
  travel: 25,
}

const rep = buildReport()
const m = rep.metrics
const pct = (x: number) => Math.round(x * 1000) / 10

describe('quality gates (SPEC 19.6)', () => {
  it('report values (Q2, Q12, Q17)', () => {
    console.log(
      `Q1 ${pct(m.q1)}% Q2 ${pct(m.q2)}% Q3 ${pct(m.q3)}% Q4 ${pct(m.q4)}% Q7 ${m.q7.toFixed(2)} Q17 ${pct(m.q17)}% Q19 ${pct(m.q19)}% speed median ${m.speed.medianUs} µs p99 ${m.speed.p99Us} µs`,
    )
    expect(m.contentN).toBeGreaterThan(400)
  })

  it('Q1 recognizable token >= 95%', () => {
    expect(m.q1).toBeGreaterThanOrEqual(0.95)
  })

  it('Q3 skeleton share <= 5%', () => {
    expect(m.q3).toBeLessThanOrEqual(0.05)
  })

  it('Q4 padding tail rate within the M4 gates, overall and per domain', () => {
    expect(m.q4 * 100).toBeLessThanOrEqual(Q4_GATE_OVERALL + 1e-9)
    for (const d of m.domains) {
      const gate = Q4_GATES[d.kind]
      expect(gate, `no Q4 gate for domain ${d.kind}`).toBeDefined()
      expect(d.q4 * 100, d.kind).toBeLessThanOrEqual((gate ?? 0) + 1e-9)
    }
  })

  it('Q7 average body segments between 2.5 and 3.5', () => {
    expect(m.q7).toBeGreaterThanOrEqual(2.5)
    expect(m.q7).toBeLessThanOrEqual(3.5)
  })

  it('Q8 normalization groups give identical IDs', () => {
    expect(m.q8.groups).toBeGreaterThan(0)
    expect(m.q8.failed).toEqual([])
  })

  it('Q10 no hard bad word in any ID', () => {
    expect(m.q10.hits).toEqual([])
  })

  it('Q15 every expect row matches', () => {
    expect(m.q15.failed.map((c) => `${c.id}: ${c.got.id}`)).toEqual([])
    expect(m.q15.ok).toBe(m.q15.n)
  })

  it('Q18 domain balance: Q1 >= 90% (15+ titles), Q19 >= 75% (10+ keep titles)', () => {
    for (const d of m.domains) {
      if (d.n >= 15) expect(d.q1, `${d.kind} Q1`).toBeGreaterThanOrEqual(0.9)
      if (d.keepN >= 10) expect(d.q19, `${d.kind} Q19`).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('Q19 expected word kept >= 85% overall', () => {
    expect(m.keepN).toBeGreaterThanOrEqual(150)
    expect(m.q19).toBeGreaterThanOrEqual(0.85)
  })
})

const seq = await buildSequential()
const q = seq.metrics

describe('sequential quality gates (SPEC 19.6, M5)', () => {
  it('report values (Q11, Q14 near pairs)', () => {
    console.log(
      `Q5 ${pct(q.q5.rate)}% Q6 ${pct(q.q6.rate)}% (${q.q6.ok}/${q.q6.pairs}) Q11 ${pct(q.q11.rate)}% (${q.q11.repick}/${q.q11.collisions}) Q14 ${q.q14.pairs - q.q14.failed.length}/${q.q14.pairs} near ${q.q14near.pairs - q.q14near.failed.length}/${q.q14near.pairs}`,
    )
    expect(q.n).toBe(rep.rows.length)
  })

  it('Q5 collision fallback rate <= 3%', () => {
    expect(q.q5.rate, q.q5.hits.join('\n')).toBeLessThanOrEqual(0.03)
  })

  it('Q6 sibling distinguishability >= 90%; skipped pairs at most 3%', () => {
    expect(q.q6.pairs).toBeGreaterThanOrEqual(50)
    expect(q.q6.rate, q.q6.failed.join('\n')).toBeGreaterThanOrEqual(0.9)
    expect(q.q6.skippedPairs / q.q6.allPairs).toBeLessThanOrEqual(0.03)
  })

  it('Q9 all sequential IDs are distinct', () => {
    expect(q.q9.dups).toEqual([])
  })

  it('Q14 same title, same content (identical canonical titles)', () => {
    expect(q.q14.pairs).toBeGreaterThanOrEqual(20)
    expect(q.q14.failed).toEqual([])
  })
})
