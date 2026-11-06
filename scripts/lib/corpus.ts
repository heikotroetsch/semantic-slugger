/**
 * Corpus tools (SPEC 19.2, 19.6): load the fixture corpus, run titles alone or after other titles with
 * a sync tier C memory store, and compute the quality metrics. Used by `scripts/corpus-report.ts`,
 * `test/quality.test.ts`, `test/expect.test.ts` and the corpus snapshot test.
 */

import { readFileSync } from 'node:fs'
import { compile } from '../../src/core/compile.ts'
import { toCanonical } from '../../src/core/normalize.ts'
import type { AnyAnswer, Req } from '../../src/core/resolve.ts'
import { fold, hardHitIn } from '../../src/core/safety.ts'
import { createSlugger, type Slugger, type SluggerConfig, type SlugResult } from '../../src/index.ts'
import { type SuggestTrace, type SyncDriver, suggestTrace } from '../../src/slugger.ts'

/** Fixture schema (SPEC 19.7). */
export interface Fixture {
  id: string
  lang: 'de' | 'en' | 'mixed'
  kind: string
  title: string
  group?: string
  vary?: string
  near?: string
  keep?: string[]
  skip?: { Q6?: string }
  expect?: {
    body: string
    tail: number
    after?: string[]
    config?: SluggerConfig
  }
}

export function loadFixtures(): Fixture[] {
  return JSON.parse(readFileSync(new URL('../../test/fixtures/titles.json', import.meta.url), 'utf8')) as Fixture[]
}

// ---------------------------------------------------------------------------------------------
// Sync memory store (tier C) for the report and the expect rows
// ---------------------------------------------------------------------------------------------

interface Row {
  readonly id: string
  readonly body: string
  readonly stems: readonly string[]
}

/** A tier C store that answers the resolver synchronously (same rules as a memory store, SPEC 13.3). */
export class SyncMemoryStore implements SyncDriver {
  readonly tier = 'C' as const
  private readonly rows: Row[] = []
  private readonly ids = new Set<string>()

  readonly answer = (req: Req): AnyAnswer => {
    switch (req.op) {
      case 'stats': {
        const df = new Map<string, number>()
        for (const s of req.stems) df.set(s, this.rows.filter((r) => r.stems.includes(s)).length)
        return { df, N: this.rows.length }
      }
      case 'countBodies':
        return new Map(req.bodies.map((b) => [b, this.rows.filter((r) => r.body === b).length]))
      case 'findByBody':
        return this.rows
          .filter((r) => r.body === req.body)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, req.limit)
          .map((r) => ({ id: r.id, stems: r.stems }))
      case 'exists':
        return new Set(req.ids.filter((id) => this.ids.has(id)))
    }
  }

  insert(r: SlugResult): void {
    if (this.ids.has(r.id)) throw new Error(`duplicate id ${r.id}`)
    this.ids.add(r.id)
    this.rows.push({ id: r.id, body: r.body, stems: r.stems })
  }

  get size(): number {
    return this.rows.length
  }
}

/** One title alone (empty store, tier `none`). */
export function runAlone(s: Slugger, title: string): SuggestTrace {
  return suggestTrace(s.config, s.fingerprint, title)
}

/** One title through a sync memory store, inserted afterwards. */
export function runInto(s: Slugger, store: SyncMemoryStore, title: string): SuggestTrace {
  const tr = suggestTrace(s.config, s.fingerprint, title, {}, store)
  store.insert(tr.result)
  return tr
}

// ---------------------------------------------------------------------------------------------
// Expect rows (Q15)
// ---------------------------------------------------------------------------------------------

export interface ExpectCheck {
  readonly id: string
  readonly title: string
  readonly want: { body: string; tail: number }
  readonly got: { body: string; tail: number; id: string }
  readonly ok: boolean
}

/** Check one fixture with `expect` (SPEC 19.2 expect.test.ts): alone, or after the listed fixtures. */
export function checkExpect(f: Fixture, byId: ReadonlyMap<string, Fixture>): ExpectCheck {
  const e = f.expect
  if (e === undefined) throw new Error(`${f.id} has no expect`)
  const s = createSlugger(e.config)
  let r: SlugResult
  if (e.after === undefined || e.after.length === 0) r = runAlone(s, f.title).result
  else {
    const store = new SyncMemoryStore()
    for (const a of e.after) {
      const g = byId.get(a)
      if (g === undefined) throw new Error(`${f.id}: unknown after id ${a}`)
      runInto(s, store, g.title)
    }
    r = suggestTrace(s.config, s.fingerprint, f.title, {}, store).result
  }
  const got = { body: r.body, tail: r.tail.length, id: r.id }
  return {
    id: f.id,
    title: f.title,
    want: { body: e.body, tail: e.tail },
    got,
    ok: got.body === e.body && got.tail === e.tail,
  }
}

// ---------------------------------------------------------------------------------------------
// Metrics (SPEC 19.6)
// ---------------------------------------------------------------------------------------------

/** Lower-case like a title, then the canonical form of SPEC 4.1. */
export function canon(s: string): string {
  return toCanonical(s.normalize('NFKC').replace(/ẞ/g, 'ß').toLowerCase())
}

/** Letter and digit runs of a segment (`phone8` -> phone, 8; `26mrz` -> 26, mrz). */
function pieces(seg: string): string[] {
  return seg.match(/[a-z]+|[0-9]+/g) ?? []
}

export interface IdRow {
  readonly f: Fixture
  readonly r: SlugResult
  readonly tr: SuggestTrace
  /** Body segments (no tail). */
  readonly segs: readonly string[]
  /** Q1 */
  readonly recognizable: boolean
  /** Q2 (only when the pool is not empty) */
  readonly topKept: boolean | undefined
  /** Q19 (only for rows with `keep`) */
  readonly keepVisible: boolean | undefined
}

/** Q1: a segment is a lexicon abbr of a title concept, or a 3+ char prefix of a title word or part. */
function recognizable(tr: SuggestTrace, title: string): boolean {
  const plan = tr.out.plan
  const words = new Set<string>(
    canon(title)
      .split(' ')
      .filter((w) => w !== ''),
  )
  for (const c of plan?.ladders ?? []) {
    for (const p of c.tok.split?.parts ?? []) words.add(p.text)
    for (const p of c.tok.parts ?? []) words.add(p)
    for (const v of c.verbatim) words.add(v)
  }
  const abbrs = new Set<string>()
  for (const c of plan?.ladders ?? []) {
    for (const a of c.lex?.abbr ?? []) abbrs.add(a)
    for (const r of c.ladder) if (r.kind === 'lexicon' || r.kind === 'joined') abbrs.add(r.text)
  }
  for (const seg of tr.result.segments) {
    if (seg.kind === 'tail' || seg.kind === 'fallback') continue
    for (const s of [seg.text, ...pieces(seg.text)]) {
      if (abbrs.has(s)) return true
      if (s.length >= 3) for (const w of words) if (w.startsWith(s)) return true
    }
  }
  return false
}

/** Q19: one `keep` word is visible in the ID (SPEC 19.6). */
function keepVisible(tr: SuggestTrace, keep: readonly string[], s: Slugger): boolean {
  const lex = compile(s.config).lexicon
  const segs = tr.result.segments.filter((x) => x.kind !== 'tail' && x.kind !== 'fallback')
  const plan = tr.out.plan
  // compound parts of the source tokens of each chosen body segment (by segment text)
  const partsOf = new Map<string, Set<string>>()
  for (const fs of plan?.chosen.segs ?? []) {
    const set = partsOf.get(fs.text) ?? new Set<string>()
    for (const c of fs.concepts) {
      for (const p of c.tok.split?.parts ?? []) set.add(p.text)
      for (const p of c.tok.split?.raw ?? []) set.add(p.text)
      for (const p of c.tok.parts ?? []) set.add(p)
      for (const p of c.parts ?? []) set.add(p.text)
    }
    partsOf.set(fs.text, set)
  }
  for (const word of keep) {
    const k = canon(word).replace(/ /g, '')
    if (k === '') continue
    const forms = new Set<string>([k])
    const abbrs = new Set<string>()
    for (const e of lex.exactAll(k)) for (const a of e.abbr ?? []) abbrs.add(a)
    // a lexicon or joined rung of a concept that comes from this word
    for (const c of plan?.chosen.content ?? [])
      if (c.verbatim.includes(k) || c.display === k) for (const a of c.lex?.abbr ?? []) abbrs.add(a)
    for (const seg of segs) {
      // containment counts only when k is a whole compound part of the segment's source token
      const whole = partsOf.get(seg.text)?.has(k) === true
      for (const t of [seg.text, ...pieces(seg.text)]) {
        if (forms.has(t) || abbrs.has(t)) return true
        if (t.length >= 3 && k.startsWith(t)) return true
        if (whole && k.length >= 3 && t.length > k.length && t.includes(k)) return true
      }
    }
  }
  return false
}

export interface DomainStats {
  readonly kind: string
  readonly n: number
  readonly q1: number
  readonly q4: number
  readonly keepN: number
  readonly q19: number
  readonly avgSegs: number
}

export interface WorstRow {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly slug: string
  readonly cost: number
}

export interface Metrics {
  readonly contentN: number
  readonly q1: number
  readonly q2: number
  readonly q3: number
  readonly q4: number
  readonly q7: number
  readonly q8: { groups: number; ok: number; failed: string[] }
  readonly q10: { hits: string[] }
  readonly q15: { n: number; ok: number; failed: ExpectCheck[] }
  readonly q17: number
  readonly q19: number
  readonly keepN: number
  readonly domains: readonly DomainStats[]
  readonly rungMix: Readonly<Record<string, number>>
  readonly plainShare: number
  readonly reasons: Readonly<Record<string, number>>
  readonly classMix: Readonly<Record<string, number>>
  readonly worst: readonly WorstRow[]
  /** The 20 worst IDs by fit cost per domain (SPEC 19.6). */
  readonly worstByDomain: Readonly<Record<string, readonly WorstRow[]>>
  /** IDs per store tier (SPEC 19.6). Every row runs alone without a store, so all are `none`. */
  readonly storeTiers: Readonly<Record<string, number>>
  readonly speed: { medianUs: number; p99Us: number }
}

export interface Report {
  readonly rows: readonly IdRow[]
  readonly metrics: Metrics
}

const share = (a: number, b: number): number => (b === 0 ? 1 : a / b)

/** Run every fixture alone with the default config and compute the metrics of SPEC 19.6. */
export function buildReport(fixtures: readonly Fixture[] = loadFixtures()): Report {
  const s = createSlugger()
  const rows: IdRow[] = []
  const times: number[] = []
  for (const f of fixtures) {
    const t0 = performance.now()
    const tr = runAlone(s, f.title)
    times.push(performance.now() - t0)
    const r = tr.result
    const segs = r.segments.filter((x) => x.kind !== 'tail').map((x) => x.text)
    const pool = tr.out.plan?.pool ?? []
    const top = pool[0]
    rows.push({
      f,
      r,
      tr,
      segs,
      recognizable: recognizable(tr, f.title),
      topKept: top === undefined ? undefined : (tr.out.plan?.chosen.content ?? []).includes(top),
      keepVisible: f.keep === undefined ? undefined : keepVisible(tr, f.keep, s),
    })
  }
  const content = rows.filter((x) => x.f.kind !== 'edge')
  const bodySegs = content.flatMap((x) => x.r.segments.filter((g) => g.kind !== 'tail'))
  const kinds = [...new Set(content.map((x) => x.f.kind))].sort()
  const domains: DomainStats[] = kinds.map((kind) => {
    const d = content.filter((x) => x.f.kind === kind)
    const keep = d.filter((x) => x.keepVisible !== undefined)
    return {
      kind,
      n: d.length,
      q1: share(d.filter((x) => x.recognizable).length, d.length),
      q4: share(d.filter((x) => x.r.tail !== '').length, d.length),
      keepN: keep.length,
      q19: share(keep.filter((x) => x.keepVisible).length, keep.length),
      avgSegs: d.reduce((a, x) => a + x.segs.length, 0) / Math.max(1, d.length),
    }
  })
  // Q8: each norm-* group alone gives identical IDs
  const groups = new Map<string, IdRow[]>()
  for (const x of rows) if (x.f.group?.startsWith('norm-')) groups.set(x.f.group, [...(groups.get(x.f.group) ?? []), x])
  const q8failed = [...groups].filter(([, g]) => new Set(g.map((x) => x.r.id)).size !== 1).map(([k]) => k)
  // Q10: hard words anywhere in the ID, no exceptions
  const q10 = rows
    .filter((x) => hardHitIn(fold(x.r.id.split(s.config.separator || '\u0000').join('')), s.config))
    .map((x) => x.r.id)
  // Q15
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const checks = fixtures.filter((f) => f.expect !== undefined).map((f) => checkExpect(f, byId))
  // Q17: per concept, the share of IDs that use its most common rung
  const rungUse = new Map<string, Map<string, number>>()
  for (const x of content)
    for (const seg of x.tr.out.plan?.chosen.segs ?? [])
      seg.concepts.forEach((c, i) => {
        const m = rungUse.get(c.key) ?? new Map<string, number>()
        const t = seg.rungs[i]?.text ?? ''
        m.set(t, (m.get(t) ?? 0) + 1)
        rungUse.set(c.key, m)
      })
  let q17a = 0
  let q17b = 0
  for (const m of rungUse.values()) {
    const v = [...m.values()]
    q17a += Math.max(...v)
    q17b += v.reduce((a, b) => a + b, 0)
  }
  const rungMix: Record<string, number> = {}
  for (const g of bodySegs) {
    const k = g.kind === 'fallback' ? 'fallback' : (g.rung ?? 'none')
    rungMix[k] = (rungMix[k] ?? 0) + 1
  }
  const chosenSegs = content.flatMap((x) => x.tr.out.plan?.chosen.segs ?? [])
  const reasons: Record<string, number> = {}
  for (const x of rows) reasons[x.r.reason] = (reasons[x.r.reason] ?? 0) + 1
  const classMix: Record<string, number> = {}
  for (const x of content)
    for (const c of new Set((x.tr.out.plan?.chosen.content ?? []).map((c) => c.cls)))
      classMix[c] = (classMix[c] ?? 0) + 1
  const ranked: WorstRow[] = content
    .filter((x) => x.tr.out.plan !== undefined)
    .map((x) => ({
      id: x.f.id,
      kind: x.f.kind,
      title: x.f.title,
      slug: x.r.id,
      cost: x.tr.out.plan?.chosen.cost ?? 0,
    }))
    .sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : 1))
  const worst = ranked.slice(0, 20)
  const worstByDomain: Record<string, WorstRow[]> = {}
  for (const kind of kinds) worstByDomain[kind] = ranked.filter((w) => w.kind === kind).slice(0, 20)
  const storeTiers: Record<string, number> = {}
  for (const x of rows) storeTiers[x.r.storeTier] = (storeTiers[x.r.storeTier] ?? 0) + 1
  const sorted = [...times].sort((a, b) => a - b)
  const withPool = content.filter((x) => x.topKept !== undefined)
  const withKeep = content.filter((x) => x.keepVisible !== undefined)
  return {
    rows,
    metrics: {
      contentN: content.length,
      q1: share(content.filter((x) => x.recognizable).length, content.length),
      q2: share(withPool.filter((x) => x.topKept).length, withPool.length),
      q3: share(bodySegs.filter((g) => g.rung === 'skeleton').length, bodySegs.length),
      q4: share(content.filter((x) => x.r.tail !== '').length, content.length),
      q7: content.reduce((a, x) => a + x.segs.length, 0) / Math.max(1, content.length),
      q8: { groups: groups.size, ok: groups.size - q8failed.length, failed: q8failed },
      q10: { hits: q10 },
      q15: { n: checks.length, ok: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok) },
      q17: share(q17a, q17b),
      q19: share(withKeep.filter((x) => x.keepVisible).length, withKeep.length),
      keepN: withKeep.length,
      domains,
      rungMix,
      plainShare: share(chosenSegs.filter((g) => !g.cryptic).length, chosenSegs.length),
      reasons,
      classMix,
      worst,
      worstByDomain,
      storeTiers,
      speed: {
        medianUs: Math.round((sorted[sorted.length >> 1] ?? 0) * 1000),
        p99Us: Math.round((sorted[Math.floor(sorted.length * 0.99)] ?? 0) * 1000),
      },
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

const cell = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\t/g, ' ')

/** `corpus.independent.md` (SPEC 19.2): every fixture alone, grouped by kind. */
export function independentSnapshot(rows: readonly IdRow[]): string {
  const kinds = [...new Set(rows.map((x) => x.f.kind))].sort()
  const out: string[] = ['# Corpus, independent (default config, exact 16, empty store)', '']
  for (const kind of kinds) {
    out.push(`## ${kind}`, '', '| id | lang | kind | title | slug | reason | rungs |', '|---|---|---|---|---|---|---|')
    for (const x of rows.filter((r) => r.f.kind === kind)) {
      const rungs = x.r.segments
        .filter((g) => g.kind !== 'tail')
        .map((g) => (g.kind === 'fallback' ? 'fallback' : (g.rung ?? '-')))
        .join(' ')
      out.push(
        `| ${x.f.id} | ${x.r.lang} | ${kind} | ${cell(JSON.stringify(x.f.title).slice(1, -1))} | \`${x.r.id}\` | ${x.r.reason} | ${rungs} |`,
      )
    }
    out.push('')
  }
  return out.join('\n')
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

function worstTable(list: readonly WorstRow[]): string[] {
  return [
    '| id | kind | title | slug | cost |',
    '|---|---|---|---|---|',
    ...list.map((w) => `| ${w.id} | ${w.kind} | ${cell(w.title)} | \`${w.slug}\` | ${w.cost} |`),
  ]
}

/** The corpus report as Markdown (SPEC 19.6). */
export function formatReport(rep: Report): string {
  const m = rep.metrics
  const out: string[] = [
    '# Corpus report',
    '',
    `Content titles: ${m.contentN}. Default config, exact 16, every fixture alone.`,
    '',
    '| # | Metric | Value |',
    '|---|---|---|',
    `| Q1 | Recognizable token | ${pct(m.q1)} |`,
    `| Q2 | Top concept kept (report) | ${pct(m.q2)} |`,
    `| Q3 | Skeleton share | ${pct(m.q3)} |`,
    `| Q4 | Padding tail rate | ${pct(m.q4)} |`,
    `| Q7 | Avg body segments | ${m.q7.toFixed(2)} |`,
    `| Q8 | Normalization groups identical | ${m.q8.ok}/${m.q8.groups} |`,
    `| Q10 | Hard bad words | ${m.q10.hits.length} hits |`,
    `| Q12 | Speed (independent run) | median ${m.speed.medianUs} µs, p99 ${m.speed.p99Us} µs |`,
    `| Q15 | Expected outputs | ${m.q15.ok}/${m.q15.n} |`,
    `| Q17 | Spelling consistency (report) | ${pct(m.q17)} |`,
    `| Q19 | Expected word kept | ${pct(m.q19)} of ${m.keepN} |`,
    '',
    '## Per domain',
    '',
    '| Domain | Titles | Q1 | Q4 | keep titles | Q19 | Avg segments |',
    '|---|---|---|---|---|---|---|',
    ...m.domains.map(
      (d) =>
        `| ${d.kind} | ${d.n} | ${pct(d.q1)} | ${pct(d.q4)} | ${d.keepN} | ${pct(d.q19)} | ${d.avgSegs.toFixed(2)} |`,
    ),
    '',
    '## Rung kind mix (body segments of content titles)',
    '',
    ...Object.entries(m.rungMix)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- ${k}: ${v}`),
    `- plain segments: ${pct(m.plainShare)}`,
    '',
    '## IDs per reason',
    '',
    ...Object.entries(m.reasons).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## IDs per class (content titles that show the class)',
    '',
    ...Object.entries(m.classMix)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## IDs per store tier',
    '',
    ...Object.entries(m.storeTiers).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## 20 worst IDs by fit cost',
    '',
    ...worstTable(m.worst),
    '',
  ]
  for (const [kind, list] of Object.entries(m.worstByDomain)) {
    out.push(`### 20 worst IDs by fit cost: ${kind}`, '', ...worstTable(list), '')
  }
  if (m.q15.failed.length > 0) {
    out.push('## Failed expect rows', '')
    for (const c of m.q15.failed)
      out.push(`- ${c.id} ${cell(c.title)}: want \`${c.want.body}\` + t${c.want.tail}, got \`${c.got.id}\``)
    out.push('')
  }
  const missed = rep.rows.filter((x) => x.keepVisible === false)
  if (missed.length > 0) {
    out.push('## Rows where no keep word is visible (Q19)', '')
    for (const x of missed)
      out.push(`- ${x.f.id} (${x.f.kind}) ${cell(x.f.title)} -> \`${x.r.id}\` keep: ${x.f.keep?.join(', ')}`)
    out.push('')
  }
  return out.join('\n')
}
