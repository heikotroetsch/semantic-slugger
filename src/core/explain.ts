/**
 * `explain()` (SPEC 16.4): the steps of one call, built from the analysis, the resolve output and a
 * log of the store requests, plus the text form of `toString()`.
 */

import type { ResolvedConfig } from '../config.ts'
import type { Explanation, ResolveStatus, SlugResult, Step } from '../result.ts'
import type { Doc } from './analyze.ts'
import type { Candidate } from './fit.ts'
import type { AnyAnswer, Req, ResolveOut } from './resolve.ts'

/** One store request and its answer. */
export interface ReqLog {
  readonly req: Req
  readonly ans: AnyAnswer
}

/** Wrap a resolver generator so every request and answer is logged (any driver can run it). */
export function* recorded<T>(gen: Generator<Req, T, AnyAnswer>, log: ReqLog[]): Generator<Req, T, AnyAnswer> {
  let step = gen.next()
  while (!step.done) {
    const ans: AnyAnswer = yield step.value
    log.push({ req: step.value, ans })
    step = gen.next(ans)
  }
  return step.value
}

function candidateId(c: Candidate, cfg: ResolvedConfig): string {
  return c.tailLen === 0 ? c.body : `${c.body}${cfg.separator}<t${c.tailLen}>`
}

function resolveRows(log: readonly ReqLog[], result: SlugResult): Extract<Step, { stage: 'resolve' }>['tried'] {
  const rows: { id: string; status: ResolveStatus; detail?: string }[] = []
  for (const { req, ans } of log) {
    if (req.op === 'countBodies' && ans instanceof Map) {
      for (const b of req.bodies) {
        const n = (ans as ReadonlyMap<string, number>).get(b) ?? 0
        if (n > 0) rows.push({ id: b, status: 'body-taken', detail: `countBody ${n}` })
      }
    } else if (req.op === 'exists' && ans instanceof Set) {
      const taken = ans as ReadonlySet<string>
      for (const id of req.ids) {
        if (taken.has(id)) rows.push({ id, status: 'taken' })
        else if (id === result.id) break
      }
    }
  }
  const tier = result.storeTier === 'none' ? 'not checked' : `tier ${result.storeTier}`
  rows.push({ id: result.id, status: 'ok', detail: tier })
  return rows
}

/** The steps of one call (SPEC 16.4). Steps after `concepts` only exist when the fit ran. */
export function buildSteps(doc: Doc, out: ResolveOut, log: readonly ReqLog[], result: SlugResult): Step[] {
  const f = doc.front
  const n = f.normalized
  const cfg = doc.cfg
  const steps: Step[] = [
    { stage: 'normalize', input: n.input, surface: n.surface, canonical: n.canonical, removed: [...n.removed] },
    {
      stage: 'language',
      lang: f.language.lang,
      source: f.language.source,
      scores: { ...f.language.scores },
      reasons: [...f.language.reasons],
    },
    { stage: 'tokens', tokens: f.tokens.map((t) => ({ text: t.text, cls: t.role ?? t.cls, lang: t.lang })) },
    { stage: 'phrases', matches: f.phrases.map((m) => ({ tokens: [...m.tokens], key: m.key })) },
    {
      stage: 'stopwords',
      removed: [
        ...f.denied.map((t) => ({ word: t.ascii, list: 'deny' as const })),
        ...f.removed.map((r) => ({ word: r.word, list: r.list })),
      ],
      weak: [...f.weak],
      ...(f.backoff !== undefined ? { backoff: f.backoff } : {}),
    },
    { stage: 'names', names: f.names.map((x) => ({ word: x.word, signal: x.signal })) },
    {
      stage: 'compounds',
      splits: f.splits.map((s) => ({
        word: s.word,
        parts: [...s.parts],
        linkers: [...s.linkers],
        kept: [...s.kept],
      })),
    },
    {
      stage: 'concepts',
      rows: doc.concepts.map((c) => ({ key: c.key, cls: c.cls, stems: [...c.stemKeys], tf: c.tf, pos: c.pos })),
    },
  ]
  const plan = out.plan
  if (plan !== undefined) {
    const r = plan.ranked
    steps.push({
      stage: 'rank',
      df: r.df,
      ...(r.N !== undefined ? { N: r.N } : {}),
      rows: r.rows.map((x) => ({ ...x })),
      excluded: r.excluded.map((x) => ({ ...x })),
    })
    steps.push({
      stage: 'ladders',
      rows: plan.ladders.map((l) => ({
        key: l.key,
        rungs: l.ladder.map((g) => ({ text: g.text, kind: g.kind, cost: g.cost, plain: g.plain })),
        rejected: l.rejected.map((x) => ({ text: x.text, rule: x.rule })),
      })),
    })
    steps.push({
      stage: 'fit',
      best: plan.cands.slice(0, 5).map((c) => ({ id: candidateId(c, cfg), cost: c.cost, parts: { ...c.parts } })),
    })
  }
  steps.push({ stage: 'resolve', tried: resolveRows(log, result) })
  return steps
}

// ---------------------------------------------------------------------------------------------
// toString
// ---------------------------------------------------------------------------------------------

const PAD = 12

function line(label: string, text: string): string {
  return `${label.padEnd(PAD)}${text}`
}

function more(text: string): string {
  return `${' '.repeat(PAD)}${text}`
}

function list(xs: readonly string[]): string {
  return xs.length === 0 ? '-' : xs.join('  ')
}

function splitText(s: { word: string; parts: readonly string[]; linkers: readonly string[]; kept: readonly string[] }) {
  const pieces: string[] = []
  s.parts.forEach((p, i) => {
    const l = s.linkers[i] ?? ''
    if (l !== '') pieces.push(l)
    pieces.push(p)
  })
  const kept = s.kept.length === 0 ? 'all weak or generic: weak word' : `kept ${s.kept.join('+')}`
  return `${s.word} = ${pieces.join(' + ')} (${kept})`
}

function rankTable(step: Extract<Step, { stage: 'rank' }>): string[] {
  const head = ['key', 'cls', 'base', 'rar', 'pos', 'tf', 'lex', 'diff', 'score']
  const rows = step.rows.map((r) => [
    r.key,
    r.cls,
    String(r.base),
    String(r.rarity),
    String(r.pos),
    String(r.tf),
    String(r.lex),
    String(r.diff),
    String(r.score),
  ])
  const all = [head, ...rows]
  const w = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)))
  const fmt = (r: readonly string[]) =>
    r.map((c, i) => (i < 2 ? c.padEnd((w[i] ?? 0) + 2) : c.padStart((w[i] ?? 0) + 2))).join('')
  const out = all.map(fmt)
  const df = step.df === 'store' ? `df store, N ${step.N ?? '?'}` : 'df static (priors only)'
  out.push(df)
  if (step.excluded.length > 0) out.push(`excluded: ${step.excluded.map((e) => `${e.key} (${e.why})`).join(', ')}`)
  return out
}

/** The text form of an explanation (SPEC 16.4 example). */
export function formatExplanation(input: string, cfg: ResolvedConfig, steps: readonly Step[], r: SlugResult): string {
  const sep = JSON.stringify(cfg.separator)
  const lines = [
    `semantic-slugger v${cfg.algorithm} | length ${cfg.length} ${cfg.lengthMode} | sep ${sep} | leak ${cfg.leak} | fp ${r.configFingerprint}`,
    line('input', JSON.stringify(input)),
  ]
  for (const s of steps) {
    switch (s.stage) {
      case 'normalize':
        lines.push(line('normalize', s.surface === '' ? '-' : s.surface))
        if (s.removed.length > 0) lines.push(more(`noise removed: ${s.removed.join(', ')}`))
        break
      case 'language': {
        const scores = Object.entries(s.scores)
          .map(([k, v]) => `${k} ${v}`)
          .join(' / ')
        lines.push(line('language', `${s.lang} (${s.source})  ${scores}  ${s.reasons.join(' ')}`.trimEnd()))
        break
      }
      case 'tokens':
        lines.push(line('tokens', list(s.tokens.map((t) => `${t.text}:${t.cls}`))))
        break
      case 'phrases':
        lines.push(line('phrases', list(s.matches.map((m) => `${m.tokens.join(' ')} -> ${m.key}`))))
        break
      case 'stopwords': {
        const parts = [
          ...s.removed.map((x) => `${x.word}(${x.list})`),
          ...s.weak.map((x) => `weak:${x}`),
          ...(s.backoff !== undefined ? [`backoff:${s.backoff}`] : []),
        ]
        lines.push(line('stopwords', list(parts)))
        break
      }
      case 'names':
        lines.push(line('names', list(s.names.map((x) => `${x.word}(${x.signal})`))))
        break
      case 'compounds':
        if (s.splits.length === 0) lines.push(line('compounds', '-'))
        s.splits.forEach((x, i) => {
          lines.push(i === 0 ? line('compounds', splitText(x)) : more(splitText(x)))
        })
        break
      case 'concepts':
        lines.push(line('concepts', list(s.rows.map((c) => `${c.key}:${c.cls}`))))
        break
      case 'rank':
        rankTable(s).forEach((x, i) => {
          lines.push(i === 0 ? line('rank', x) : more(x))
        })
        break
      case 'ladders': {
        const rows = s.rows.map(
          (r) =>
            `${r.key}: ${r.rungs.length === 0 ? '-' : r.rungs.map((g) => `${g.text}(${g.cost}${g.plain ? '' : '*'})`).join(' ')}`,
        )
        if (rows.length === 0) lines.push(line('ladders', '-'))
        rows.forEach((x, i) => {
          lines.push(i === 0 ? line('ladders', x) : more(x))
        })
        lines.push(more('(* = cryptic)'))
        break
      }
      case 'fit':
        lines.push(line('fit', s.best.length === 0 ? '-' : s.best.map((b) => `${b.id} ${b.cost}`).join(' | ')))
        break
      case 'resolve':
        lines.push(
          line(
            'resolve',
            s.tried.map((t) => `${t.id} ${t.status}${t.detail !== undefined ? ` (${t.detail})` : ''}`).join(' | '),
          ),
        )
        break
    }
  }
  const tail = r.tail === '' ? 'none' : `${r.tail} (k ${r.tailIndex})`
  lines.push(line('result', `${r.id}  reason ${r.reason}  lang ${r.lang}  tail ${tail}`))
  if (r.warnings.length > 0) lines.push(more(`warnings: ${r.warnings.join(', ')}`))
  return lines.join('\n')
}

/** A JSON-safe copy of the resolved config: functions shown as "fn", the secret hidden. */
function configJson(cfg: ResolvedConfig): object {
  const o: Record<string, unknown> = JSON.parse(
    JSON.stringify(cfg, (_k, v: unknown) => (typeof v === 'function' ? 'fn' : v)),
  ) as Record<string, unknown>
  if (o.secret !== undefined) o.secret = '[hidden]'
  return o
}

/** The frozen explanation object (SPEC 16.4). */
export function makeExplanation(input: string, cfg: ResolvedConfig, steps: Step[], result: SlugResult): Explanation {
  const frozenSteps = Object.freeze(steps)
  return Object.freeze({
    input,
    config: cfg,
    steps: frozenSteps,
    result,
    toString: () => formatExplanation(input, cfg, frozenSteps, result),
    toJSON: () => ({
      input,
      config: configJson(cfg),
      steps: JSON.parse(JSON.stringify(frozenSteps)) as unknown,
      result: { ...result, trace: undefined },
    }),
  })
}
