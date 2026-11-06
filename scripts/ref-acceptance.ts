/**
 * Reference check of the acceptance examples (SPEC 20, milestone M4).
 *
 * A small, separate re-implementation of ranking (SPEC 10), ladders (SPEC 11) and the fit cost (SPEC 12)
 * written from the spec text. The reference computation does not use `src/core`: its input is the public
 * `analyze()` result (concepts, tokens, compound rows) and the public v1 data. The `src` values come from
 * `suggest()` or from the sync memory store in `scripts/lib/corpus.ts` (that helper imports `src/core`:
 * compile, normalize, resolve types, safety; it is only used for the `src` side). For every row of section 20 it
 * prints the spec value, the reference value and the `src` value, and checks
 * I1 and I2 on every spec value. Exit code 1 when the reference and `src` disagree, when an expected
 * value cannot occur, or when a reference score differs from the `src` score.
 *
 * `pnpm acceptance [--out docs/acceptance.md]` also writes the regenerated table.
 */

import { writeFileSync } from 'node:fs'
import {
  BLOCK_HARD,
  BLOCK_SHORT_DE,
  BLOCK_SOFT,
  CODAS_DE,
  CODAS_EN,
  DOCKIND_DE,
  DOCKIND_EN,
  FILLER_DE,
  FILLER_EN,
  LEET_FOLD,
  LEXICON_DE,
  LEXICON_EN,
  LEXICON_SHARED,
  MONTHS_DE,
  MONTHS_EN,
  ONSETS_DE,
  ONSETS_EN,
  PARTS_DE,
  PARTS_SHARED,
  QUALIFIERS,
  SINGLE_CONSONANTS,
  TAIL_BLOCK,
  WEAK_DE,
  WEAK_EN,
  WEAK_NO_SHOW,
  WEAK_SHARED,
  WEEKDAYS_DE,
  WEEKDAYS_EN,
} from '../src/data/index.ts'
import type { SluggerConfig } from '../src/index.ts'
import {
  type Analysis,
  type AnalysisConcept,
  analyze,
  createSlugger,
  type Lang,
  type LexiconEntry,
} from '../src/index.ts'
import { runInto, SyncMemoryStore } from './lib/corpus.ts'

// ---------------------------------------------------------------------------------------------
// Section 20 rows (spec rev 3.1)
// ---------------------------------------------------------------------------------------------

const PROCUREMENT: SluggerConfig = {
  lexicon: [
    { key: 'rahmenvertrag', lang: 'de', cls: 'topic', forms: ['rahmenvertraege'], abbr: ['rv'], known: ['rv'] },
    { key: 'leistungsverzeichnis', lang: 'de', cls: 'topic', abbr: ['lv'], known: ['lv'] },
    { key: 'lieferung', lang: 'de', cls: 'topic', weak: true },
    { key: 'standort', lang: 'de', cls: 'topic', forms: ['standorte'], weak: true },
    { key: 'los', lang: 'de', cls: 'marker', abbr: ['los'] },
  ],
}
const SOFTWARE: SluggerConfig = {
  lexicon: [
    { key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] },
    { key: 'epic', lang: 'en', cls: 'topic', weak: true },
  ],
  reserved: { add: ['tickets', 'board'] },
}
const MAX: SluggerConfig = { lengthMode: 'max' }
const MINIMAL: SluggerConfig = { leak: 'minimal' }
const OPAQUE: SluggerConfig = { leak: 'opaque', secret: 'acceptance-secret-0123' }

export interface AcceptRow {
  readonly n: string
  readonly field: string
  readonly title: string
  /** Value in SPEC 20 (rev 3.1). */
  readonly spec: string
  readonly status: 'ref' | 'unv'
  readonly config?: SluggerConfig
  readonly configName?: string
  /** Rows inserted before, by row number (sync memory store). */
  readonly after?: readonly string[]
}

// biome-ignore format: table
export const ROWS: readonly AcceptRow[] = [
  { n: '1', field: 'finance', title: 'Jahresbericht Vertrieb Nord 2026', spec: 'vertrieb-nord-26', status: 'ref' },
  { n: '2', field: 'finance', title: 'Jahresbericht Vertrieb Süd 2026', spec: 'vertrieb-sued-26', status: 'ref', after: ['1'] },
  { n: '3', field: 'finance', title: 'Jahresbericht Vertrieb Nord 2026', spec: 'ver-nord-2026-[t2]', status: 'ref', after: ['1'] },
  { n: '4', field: 'recipe', title: 'Rezept Apfelkuchen mit Zimt', spec: 'apfelkuchen-zimt', status: 'ref' },
  { n: '5', field: 'event', title: 'Sommerfest 2026', spec: 'sommerfest-26-[t2]', status: 'ref' },
  { n: '6', field: 'medical', title: 'MRT Knie links', spec: 'mrt-knie-[t7]', status: 'ref' },
  { n: '6m', field: 'medical', title: 'MRT Knie links', spec: 'mrt-knie-links', status: 'ref', config: MAX, configName: 'max' },
  { n: '7', field: 'procurement', title: 'Rahmenvertrag Stromlieferung Standorte Nord 2026', spec: 'rv-strom-nord-26', status: 'ref', config: PROCUREMENT, configName: 'example recipe (README 15.8, user config)' },
  { n: '8', field: 'procurement', title: 'Rahmenvertrag Stromlieferung Standorte Nord 2026', spec: 'vertrag-strom-26', status: 'unv' },
  { n: '9', field: 'hr', title: 'Mitarbeitergespräch Anna Weber 2026', spec: 'mitarb-2026-[t4]', status: 'unv', config: { denyTokens: ['anna', 'weber'] }, configName: 'denyTokens anna weber' },
  { n: '10', field: 'education', title: 'Elternabend Klasse 4b Grundschule Nord', spec: 'elternabend-nord', status: 'unv' },
  { n: '11', field: 'legal', title: 'Mietvertrag Wohnung Kassel 2026', spec: 'miet-kassel-2026', status: 'ref' },
  { n: '12', field: 'meeting', title: 'Protokoll Teamsitzung 12.03.2026', spec: 'protok-team-2026', status: 'ref' },
  { n: '13', field: 'software', title: 'Versionshinweise 5.1', spec: 'versionshinweise', status: 'ref' },
  { n: '14', field: 'software', title: 'Versionshinweise 5.2', spec: 'hinweise-v52-[t3]', status: 'ref', after: ['13'] },
  { n: '15', field: 'meeting', title: 'Sprintplanung Sprint 22', spec: 'sprint22-[t7]', status: 'ref' },
  { n: '16', field: 'marketing', title: 'Q3 2026 Marketing Budget Review', spec: 'mktg-budget-26q3', status: 'ref' },
  { n: '17', field: 'recipe', title: 'Chocolate Cake Recipe', spec: 'choc-cake-recipe', status: 'ref' },
  { n: '18', field: 'software', title: 'Firefox v132 Release Notes', spec: 'firefox-rel-v132', status: 'ref' },
  { n: '19', field: 'travel', title: 'Trip report from Lisbon', spec: 'trip-lisbon-[t4]', status: 'ref' },
  { n: '19m', field: 'travel', title: 'Trip report from Lisbon', spec: 'trip-lisbon', status: 'ref', config: MAX, configName: 'max' },
  { n: '20', field: 'travel', title: 'Trip report from Porto', spec: 'trip-porto-[t5]', status: 'ref', after: ['19'] },
  { n: '21', field: 'hr', title: 'Onboarding checklist for Acme Corp', spec: 'onb-check-acme', status: 'unv', config: MAX, configName: 'max' },
  { n: '21e', field: 'hr', title: 'Onboarding checklist for Acme Corp', spec: 'onboar-chct-acme', status: 'unv' },
  { n: '22', field: 'ticket', title: 'PROJ-1234 Checkout fails in Safari', spec: 'check-safari-[t3]', status: 'unv' },
  { n: '23', field: 'research', title: 'Effects of Sleep on Memory in Older Adults', spec: 'eff-sleep-memory', status: 'unv' },
  { n: '24', field: 'news', title: 'Storm warning for the north coast', spec: 'storm-warn-coast', status: 'ref' },
  { n: '25', field: 'software', title: 'Kubernetes Upgrade Plan Q3 2026', spec: 'k8s-upgrade-26q3', status: 'ref', config: SOFTWARE, configName: 'software recipe' },
  { n: '26', field: 'mixed', title: 'Kick-off Meeting KI Strategie Q1 2026', spec: 'kickoff-ki-strat', status: 'ref' },
  { n: '27', field: 'mixed', title: 'Release 2.4 Hinweise zur Migration', spec: 'migration-v24-[t2]', status: 'ref' },
  { n: '28', field: 'event', title: 'Team Lunch Friday', spec: 'lunch-friday-[t3]', status: 'ref' },
  { n: '29', field: 'event', title: 'Team Lunch Monday', spec: 'lunch-monday-[t3]', status: 'ref', after: ['28'] },
  { n: '30', field: 'legal', title: 'AGB Version 3.1', spec: 'agb-v31-[t8]', status: 'ref' },
  { n: '30n', field: 'legal', title: 'AGB Version 3.1', spec: 'agb-[t12]', status: 'ref', config: MINIMAL, configName: 'minimal' },
  { n: '31a', field: 'edge', title: '', spec: 'doc-[t12]', status: 'ref' },
  { n: '31b', field: 'edge', title: '   ', spec: 'doc-[t12]', status: 'ref' },
  { n: '31c', field: 'edge', title: '\t\n', spec: 'doc-[t12]', status: 'ref' },
  { n: '31d', field: 'edge', title: '​', spec: 'doc-[t12]', status: 'ref' },
  { n: '32a', field: 'edge', title: 'der die das', spec: 'doc-[t12]', status: 'ref' },
  { n: '32b', field: 'edge', title: 'und oder für mit von der', spec: 'doc-[t12]', status: 'ref' },
  { n: '32c', field: 'edge', title: 'the and of', spec: 'doc-[t12]', status: 'ref' },
  { n: '33', field: 'edge', title: 'GmbH AG Inc Ltd', spec: 'doc-[t12]', status: 'ref' },
  { n: '34', field: 'edge', title: 'Vertrag GmbH AG', spec: 'vertrag-[t8]', status: 'ref' },
  { n: '35', field: 'edge', title: 'Vertrag_v2_FINAL_final(3).docx', spec: 'vertrag-v2-[t5]', status: 'ref' },
  { n: '36', field: 'edge', title: 'Datei.pdf', spec: 'datei-[t10]', status: 'ref' },
  { n: '37', field: 'edge', title: '2026', spec: 'doc-2026-[t7]', status: 'ref' },
  { n: '38', field: 'edge', title: '2025 2026 2027', spec: 'doc-25-26-27-[t3]', status: 'unv' },
  { n: '39', field: 'edge', title: '12345', spec: 'doc-2345-[t7]', status: 'ref' },
  { n: '40', field: 'edge', title: 'Öl', spec: 'oel-[t12]', status: 'ref' },
  { n: '41', field: 'edge', title: '⚡️ Strom 2026 🔌', spec: 'strom-2026-[t5]', status: 'ref' },
  { n: '42a', field: 'edge', title: '🚚📦🚚', spec: 'doc-[t12]', status: 'ref' },
  { n: '42b', field: 'edge', title: '---___...,,,;;;', spec: 'doc-[t12]', status: 'ref' },
  { n: '42c', field: 'edge', title: '0O1lI 0o1li', spec: 'doc-[t12]', status: 'ref' },
  { n: '43', field: 'edge', title: 'Договор поставки электроэнергии 2026', spec: 'dogovor-postavki', status: 'unv' },
  { n: '44', field: 'edge', title: '电力供应框架协议 2026', spec: 'doc-2026-[t7]', status: 'ref' },
  { n: '45a', field: 'edge', title: 'تقرير المبيعات السنوي', spec: 'doc-[t12]', status: 'ref' },
  { n: '45b', field: 'edge', title: '年度销售报告', spec: 'doc-[t12]', status: 'ref' },
  { n: '46', field: 'edge', title: 'new', spec: 'new-[t12]', status: 'ref' },
  { n: '46m', field: 'edge', title: 'new', spec: 'new-[t2]', status: 'ref', config: MAX, configName: 'max' },
  { n: '47', field: 'edge', title: 'STRASSE Strasse Straße STRAẞE', spec: 'strasse-[t8]', status: 'ref' },
  { n: '48', field: 'edge', title: 'Teil 1 Teil 2 Teil 3', spec: 'pt1-pt2-pt3-[t4]', status: 'ref' },
  { n: '49', field: 'edge', title: 'Jahresbericht Vertrieb Nord 2026', spec: '[t16]', status: 'ref', config: OPAQUE, configName: 'opaque' },
  { n: '50', field: 'edge', title: 'Jahresbericht Vertrieb Nord 2026', spec: 'vertrieb-nord-26', status: 'ref', config: MAX, configName: 'max' },
  { n: '51', field: 'edge', title: 'Q3 2026 Marketing Budget Review', spec: 'mktg-budget-26q3', status: 'ref', config: MAX, configName: 'max' },
  { n: '52', field: 'edge', title: 'Jahresbericht Vertrieb Nord 2026', spec: 'vertrieb-nord-26', status: 'ref', config: MINIMAL, configName: 'minimal' },
]

// ---------------------------------------------------------------------------------------------
// Value parsing and the I1 / I2 check of expected values
// ---------------------------------------------------------------------------------------------

export interface Value {
  readonly body: string
  readonly tail: number
}

/** `ver-nord-2026-[t2]` -> body `ver-nord-2026`, tail 2; `[t16]` -> body '', tail 16. */
export function parseValue(v: string, sep: string): Value {
  const m = /^(.*?)(?:\[t(\d+)\])?$/.exec(v)
  const head = m?.[1] ?? v
  const tail = m?.[2] === undefined ? 0 : Number(m[2])
  const body = tail > 0 && head.endsWith(sep) && sep !== '' ? head.slice(0, -sep.length) : head
  return { body, tail }
}

export function showValue(v: Value, sep: string): string {
  if (v.tail === 0) return v.body
  return v.body === '' ? `[t${v.tail}]` : `${v.body}${sep}[t${v.tail}]`
}

/** I1 and I2 (SPEC 2.3) on an expected value, with a sample tail of the right length. */
export function possible(v: Value, length: number, mode: 'exact' | 'max', sep: string): string | null {
  const id = v.body === '' ? 'k'.repeat(v.tail) : v.tail === 0 ? v.body : `${v.body}${sep}${'k'.repeat(v.tail)}`
  if (mode === 'exact' ? id.length !== length : id.length > length) return `I1: ${id.length} chars`
  const s = sep === '' ? '' : `\\${sep}`
  const re = new RegExp(sep === '' ? '^[a-z][a-z0-9]*$' : `^[a-z][a-z0-9]*(?:${s}[a-z0-9]+)*$`)
  if (!re.test(id)) return 'I2: pattern'
  if (v.tail > 0 && v.tail < 2) return 'tail shorter than tailMin'
  return null
}

// ---------------------------------------------------------------------------------------------
// Reference: rank (SPEC 10)
// ---------------------------------------------------------------------------------------------

const CLASS_WEIGHT: Record<string, number> = {
  topic: 280,
  name: 260,
  acronym: 240,
  place: 200,
  marker: 200,
  year: 160,
  range: 160,
  direction: 140,
  region: 140,
  qualifier: 140,
  quarter: 140,
  month: 140,
  week: 140,
  attr: 120,
  version: 160,
  model: 120,
  longnum: 120,
  code: 100,
  weekday: 100,
  quantity: 50,
}
const NUMBERS = new Set([
  'year',
  'range',
  'quarter',
  'month',
  'week',
  'weekday',
  'version',
  'marker',
  'model',
  'longnum',
  'code',
  'quantity',
])
const PRIOR: Record<string, number> = { common: 20, medium: 50, rare: 70, unknown: 40, proper: 80 }
// quality round 1 (docs/DEVIATIONS.md): position bonus, chunk, head, bridge, skeleton, weak pool, fill
const POS_BONUS = [90, 45, 20, 10, 5]
const CHUNK = 80
const HEAD = 80
const BRIDGE = 70
const SKELETON = 600
const WEAK_POOL_SCORE = 50
const SLOT: Record<string, number> = {
  topic: 0,
  name: 0,
  acronym: 0,
  attr: 0,
  qualifier: 1,
  place: 1,
  direction: 1,
  region: 1,
  code: 1,
}
const MINIMAL_DROP = new Set(['name', 'attr', 'code', 'marker', 'model', 'version', 'longnum', 'quantity'])

interface RC {
  readonly c: AnalysisConcept
  readonly score: number
  readonly display: string
  readonly lang: string
  readonly tokAscii: string
  /** Same stem in a language (SPEC 4.4 step 2), from the public `analyze()` stored stems. */
  readonly sameStem: (x: string, y: string, langs: readonly string[]) => boolean
  ladder: RRung[]
}

const lt = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const rankCmp = (a: RC, b: RC): number => b.score - a.score || a.c.pos - b.c.pos || lt(a.c.key, b.c.key)

function refScores(a: Analysis, diff: ReadonlySet<string>): Map<string, number> {
  const t = a.concepts
    .filter(
      (c) => !c.weak && (c.cls === 'topic' || c.cls === 'name' || c.cls === 'acronym') && (c.lex?.weight ?? 0) >= 0,
    )
    .sort((x, y) => x.pos - y.pos || lt(x.key, y.key))
  const bonus = new Map(t.map((c, i) => [c.key, POS_BONUS[i] ?? 0]))
  const cancel = a.concepts.filter((c) => c.cls === 'direction').length >= 3
  const out = new Map<string, number>()
  for (const c of a.concepts) {
    const base = c.cls === 'topic' && c.lex === undefined ? 240 : (CLASS_WEIGHT[c.cls] ?? 0)
    const rar = NUMBERS.has(c.cls)
      ? 50
      : c.lex !== undefined
        ? (PRIOR[c.lex.prior ?? 'medium'] ?? 0)
        : c.cls === 'name'
          ? 80
          : 40
    let s =
      base +
      Math.floor((rar * 3) / 2) +
      (bonus.get(c.key) ?? 0) +
      40 * (c.tf - 1) +
      (c.lex?.weight ?? 0) +
      (diff.has(c.key) ? 300 : 0)
    if (cancel && c.cls === 'direction') s = 0
    out.set(c.key, s)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Reference: ladders (SPEC 11)
// ---------------------------------------------------------------------------------------------

interface RRung {
  text: string
  segs: string[]
  cost: number
  plain: boolean
  verbatim: boolean
  kind?: 'full' | 'bridge' | 'short'
}

const fold = (s: string): string => [...s].map((ch) => LEET_FOLD[ch] ?? ch).join('')
const LISTS = [...new Set([...BLOCK_HARD, ...BLOCK_SOFT, ...BLOCK_SHORT_DE])]
const RUNG_LISTS = [...new Set([...LISTS, ...TAIL_BLOCK])]
const hardIn = (s: string): boolean => BLOCK_HARD.some((w) => fold(s).includes(w))
const b1 = (s: string): boolean => LISTS.includes(fold(s))
const b2 = (s: string): boolean => {
  const f = fold(s)
  return RUNG_LISTS.some((w) => (w.length === 3 && f.startsWith(w)) || (w.length >= 4 && f.includes(w)))
}
const i8 = (s: string): boolean => /[lio][01]|[01][lio]/.test(s)

const CONS = ['tsch', 'sch', 'ch', 'ck', 'ph', 'th', 'sh', 'qu', 'ng', 'tz', 'pf', 'ss', 'll', 'mm', 'nn', 'tt', 'ff']
const CONS2 = [...CONS, 'pp', 'rr']
const VOW = ['aeu', 'ae', 'oe', 'ue', 'ie', 'ei', 'ai', 'au', 'eu', 'ee', 'aa', 'oo', 'ou']

function units(w: string): { t: string; v: boolean }[] {
  const out: { t: string; v: boolean }[] = []
  for (let i = 0; i < w.length; ) {
    let u: { t: string; v: boolean } | undefined
    for (const n of [4, 3, 2]) {
      const s = w.slice(i, i + n)
      if (s.length < n) continue
      if (CONS2.includes(s)) u = { t: s, v: false }
      else if (VOW.includes(s)) u = { t: s, v: true }
      if (u) break
    }
    u ??= { t: w[i] as string, v: 'aeiouy'.includes(w[i] as string) }
    out.push(u)
    i += u.t.length
  }
  return out
}

function refCuts(w: string, lang: string, bounds: Set<number>, lexForm: (p: string) => boolean): RRung[] {
  const codas = new Set([...SINGLE_CONSONANTS, ...(lang === 'de' ? CODAS_DE : CODAS_EN)])
  const onsets = new Set([...SINGLE_CONSONANTS, ...(lang === 'de' ? ONSETS_DE : ONSETS_EN)])
  const g = units(w)
  const out: RRung[] = []
  let len = 0
  for (let i = 1; i < g.length; i++) {
    len += (g[i - 1] as { t: string }).t.length
    if (len < 3 || len > 7 || len > w.length - 2) continue
    const head = g.slice(0, i)
    if (!head.some((u) => u.v)) continue
    const p = head.map((u) => u.t).join('')
    const last = head[i - 1] as { v: boolean }
    if (last.v && !lexForm(p)) continue
    let cl = ''
    for (let j = head.length - 1; j >= 0 && !(head[j] as { v: boolean }).v; j--) cl = (head[j] as { t: string }).t + cl
    if (!last.v && !codas.has(cl)) continue
    let cost = 0
    if (bounds.has(len)) cost = 60
    else if ((g[i] as { v: boolean }).v) cost = 90
    else {
      let run = ''
      let j = i
      for (; j < g.length && !(g[j] as { v: boolean }).v; j++) run += (g[j] as { t: string }).t
      if (j < g.length && !last.v && onsets.has(run)) cost = 110
    }
    if (cost > 0) out.push({ text: p, segs: [p], cost, plain: false, verbatim: false })
  }
  return out
}

function refSkeleton(w: string): string | null {
  if (w.length < 7) return null
  let c = w
    .slice(1)
    .replace(/[aeiouy]/g, '')
    .replace(/(.)\1+/g, '$1')
  c = c.replace(/([csth])h/g, '$1')
  c = c.replace(/[rlmn](?=[^rlmn])/g, '')
  if (c.length > 3) c = c.slice(0, 2) + c[c.length - 1]
  const s = (w[0] as string) + c
  return s.length >= 3 ? s : null
}

const LEX: LexiconEntry[] = [
  ...LEXICON_DE,
  ...LEXICON_EN,
  ...LEXICON_SHARED,
  ...QUALIFIERS,
  ...WEAK_DE,
  ...WEAK_EN,
  ...WEAK_SHARED,
  ...DOCKIND_DE,
  ...DOCKIND_EN,
  ...FILLER_DE,
  ...FILLER_EN,
]
/** Every exact lexicon word, compound parts included (the cut rule for languages without compound data). */
const ALL_WORDS = new Set<string>([...LEX.flatMap((e) => [e.key, ...(e.forms ?? [])]), ...PARTS_DE, ...PARTS_SHARED])

/** Bridge cuts: prefixes of 8 to 12 chars (at most length - 2) that end on a consonant unit. */
function refBridges(w: string, firstPart: number): string[] {
  if (w.length < 10) return []
  const g = units(w)
  const out: string[] = []
  let len = 0
  for (let i = 0; i < g.length - 1; i++) {
    const u = g[i] as { t: string; v: boolean }
    len += u.t.length
    if (len < 8 || len < firstPart + 2) continue
    if (len > 12 || len > w.length - 2) break
    if (!u.v) out.push(w.slice(0, len))
  }
  return out
}

function lexWords(user: readonly LexiconEntry[]): {
  words: Set<string>
  abbrs: Set<string>
  byWord: Map<string, LexiconEntry>
} {
  const words = new Set<string>()
  const abbrs = new Set<string>()
  const byWord = new Map<string, LexiconEntry>()
  for (const e of [...LEX, ...user]) {
    for (const w of [e.key, ...(e.forms ?? [])]) {
      words.add(w)
      byWord.set(w, e)
    }
    for (const x of e.abbr ?? []) abbrs.add(x)
  }
  return { words, abbrs, byWord }
}

function refLadder(
  rc: RC,
  a: Analysis,
  stop: ReadonlySet<string>,
  lex: ReturnType<typeof lexWords>,
  consistent: boolean,
): RRung[] {
  const c = rc.c
  const w = rc.display
  const drafts: RRung[] = []
  const num = (t: string, cost = 0): RRung => ({ text: t, segs: [t], cost, plain: true, verbatim: false })
  const row = a.compounds.find((r) => r.word === rc.tokAscii)
  const parts = row?.parts ?? []
  const kept = new Set(row?.kept ?? [])
  const lowly = (p: string) => !kept.has(p)
  const plainPart = (t: string) => t.length >= 5 && parts.includes(t) && parts.every((p) => p === t || lowly(p))
  if (NUMBERS.has(c.cls)) {
    const k = c.key
    if (c.cls === 'year') {
      const y = k.slice(1)
      drafts.push(...(Number(y) < 1900 ? [num(y)] : [num(y.slice(2)), num(y, 30)]))
    } else if (c.cls === 'range') {
      const [x = '', y = ''] = k.slice(1).split('-')
      if (Number(y) - Number(x) <= 9 && x.slice(0, 2) === y.slice(0, 2)) drafts.push(num(x.slice(2) + y.slice(2)))
      else drafts.push({ text: `${x}-${y}`, segs: [x, y], cost: 0, plain: true, verbatim: false })
    } else if (c.cls === 'month') {
      const tab = rc.lang === 'de' ? MONTHS_DE : MONTHS_EN
      drafts.push(num((tab[Number(k.slice(1)) - 1] as readonly string[])[0] as string))
    } else if (c.cls === 'weekday') {
      const tab = [WEEKDAYS_DE, WEEKDAYS_EN].find((t) => t.some((r) => r.includes(w))) ?? WEEKDAYS_EN
      const r = tab[Number(k.slice(2)) - 1] as readonly string[]
      for (const f of r) if (f.length === 3) drafts.push(num(f))
      drafts.push(num(r[0] as string, (r[0] as string).length <= 6 ? 0 : 40))
    } else if (c.cls === 'version') {
      const [ma = '', mi = ''] = k.slice(1).split('.')
      drafts.push(num(`v${ma}${mi}`))
    } else if (c.cls === 'week') drafts.push(num((rc.lang === 'de' ? 'kw' : 'wk') + k.slice(2)))
    else if (c.cls === 'model') drafts.push(num(k.slice(1)))
    else if (c.cls === 'longnum') drafts.push(num(k.slice(-4)))
    else if (c.cls === 'code') {
      if (k.length - 1 <= 8) drafts.push(num(k.slice(1)))
    } else if (c.cls === 'quantity') {
      if (!k.includes('.')) drafts.push(num(k.slice(1)))
    } else drafts.push(num(k))
  } else if (c.cls === 'acronym') drafts.push(num(w))
  else {
    // core parts of this concept: the kept parts whose join (with linkers) is the display
    let core: { text: string; linker: string }[] = []
    if (row !== undefined) {
      const ps = row.parts.map((p, i) => ({ text: p, linker: i === 0 ? '' : (row.linkers[i] ?? '') }))
      for (let i = 0; i < ps.length && core.length === 0; i++)
        for (let j = ps.length; j > i + 1 && core.length === 0; j--) {
          const run = ps.slice(i, j)
          const text = run.map((p, q) => (q === 0 ? '' : p.linker) + p.text).join('')
          if (text === w) core = run
        }
    }
    const compound = core.length > 1 && row !== undefined && row.kept.length > 0
    // rung base (SPEC 4.4 step 2, 11.1): a one-word lexicon key with the same stem as the typed word
    const key = c.lex?.key ?? ''
    const base =
      core.length <= 1 &&
      key !== '' &&
      key !== w &&
      /^[a-z0-9]+$/.test(key) &&
      key.length >= 2 &&
      rc.sameStem(key, w, [rc.lang, c.lex?.lang ?? ''])
        ? key
        : w
    if (c.lex !== undefined && c.lex.cls !== 'marker' && !compound)
      (c.lex.abbr ?? []).forEach((x, i) => {
        drafts.push({
          text: x,
          segs: [x],
          cost: 15 * i,
          plain: (c.lex?.known ?? []).includes(x) || parts.includes(x),
          verbatim: false,
        })
      })
    if (c.cls === 'name') {
      if (base.length <= 12)
        drafts.push({
          text: base,
          segs: [base],
          cost: base.length <= 8 ? 0 : 40,
          plain: true,
          verbatim: true,
          kind: 'full',
        })
    } else
      drafts.push({
        text: base,
        segs: [base],
        cost: base.length <= 6 ? 0 : 40,
        plain: true,
        verbatim: true,
        kind: 'full',
      })
    const bounds = new Set<number>()
    if (core.length > 1) {
      let acc = ''
      core.forEach((p, i) => {
        acc += (i === 0 ? '' : p.linker) + p.text
        if (i < core.length - 1) {
          bounds.add(acc.length)
          drafts.push({ text: acc, segs: [acc], cost: 60, plain: plainPart(acc), verbatim: false })
        }
      })
      const head = (core[core.length - 1] as { text: string }).text
      drafts.push({ text: head, segs: [head], cost: HEAD, plain: plainPart(head), verbatim: false })
      if (compound) {
        // joined abbr: one part's abbr with the full form or abbr of the others, 8 chars or less
        const opts = core.map((p) => {
          const e = lex.byWord.get(p.text)
          return [
            { t: p.text, cost: 0, abbr: false, plain: true },
            ...(e?.abbr ?? []).map((x, i) => ({ t: x, cost: 15 * i, abbr: true, plain: (e?.known ?? []).includes(x) })),
          ]
        })
        const walk = (i: number, t: string, cost: number, ab: boolean, pl: boolean) => {
          if (t.length > 8) return
          if (i === opts.length) {
            if (ab) drafts.push({ text: t, segs: [t], cost, plain: pl, verbatim: false })
            return
          }
          for (const o of opts[i] ?? []) walk(i + 1, t + o.t, cost + o.cost, ab || o.abbr, pl && o.plain)
        }
        walk(0, '', 0, false, true)
      }
    }
    const bridgeable = c.cls !== 'name' && base.length >= 10
    for (const cut of refCuts(base, rc.lang, bounds, (p) => lex.words.has(p))) {
      if (c.cls === 'name' && cut.cost === 60) continue
      const short = bridgeable && cut.cost !== 60 && cut.text.length < 5
      drafts.push({
        ...cut,
        plain: cut.cost === 60 && plainPart(cut.text),
        ...(short ? { kind: 'short' as const } : {}),
      })
    }
    if (c.cls !== 'name') {
      const firstPart = core.length > 1 ? (core[0] as { text: string }).text.length : 0
      const bc = refBridges(base, firstPart)
      for (const b of bc)
        drafts.push({ text: b, segs: [b], cost: BRIDGE, plain: false, verbatim: false, kind: 'bridge' })
      const sk = bc.length > 0 ? null : refSkeleton(base)
      if (sk !== null) drafts.push({ text: sk, segs: [sk], cost: SKELETON, plain: false, verbatim: false })
    }
  }
  const isVerbatim = (t: string) => c.verbatim.includes(t) || parts.includes(t)
  const own = new Set([...(c.lex?.abbr ?? []), c.lex?.key ?? '', ...(c.lex?.forms ?? [])])
  const best = new Map<string, RRung>()
  for (const d of drafts) {
    const verbatim = isVerbatim(d.text)
    if (d.segs.some(hardIn) || d.segs.some(b1)) continue
    if (!verbatim && !NUMBERS.has(c.cls) && c.cls !== 'acronym' && b2(d.text)) continue
    if (d.segs.some(i8)) continue
    if (c.cls === 'name' && !own.has(d.text) && (stop.has(d.text) || lex.words.has(d.text) || lex.abbrs.has(d.text)))
      continue
    // a coda or syllable cut that is another known word (quality round 1)
    const cut = d.cost === 90 || d.cost === 110
    if (
      cut &&
      !own.has(d.text) &&
      (stop.has(d.text) || lex.words.has(d.text) || (rc.lang !== 'de' && ALL_WORDS.has(d.text)))
    )
      continue
    if (rc.score < 150 && d.cost > 110) continue
    const r = { ...d, verbatim }
    const old = best.get(r.text)
    if (old === undefined || r.cost < old.cost || (r.cost === old.cost && r.plain && !old.plain)) best.set(r.text, r)
  }
  let out = [...best.values()].sort((x, y) => x.cost - y.cost || x.text.length - y.text.length || lt(x.text, y.text))
  if (out.some((r) => r.kind !== 'short')) out = out.filter((r) => r.kind !== 'short')
  const br = out.filter((r) => r.kind === 'bridge')
  const pick = br.length <= 3 ? br : [0, br.length >> 1, br.length - 1].map((i) => br[i] as RRung)
  out = [...out.filter((r) => r.kind !== 'bridge').slice(0, 4), ...pick].sort(
    (x, y) => x.cost - y.cost || x.text.length - y.text.length || lt(x.text, y.text),
  )
  return out.slice(0, consistent ? 1 : out.length)
}

// ---------------------------------------------------------------------------------------------
// Reference: fit (SPEC 12), exhaustive (no lower-bound cut)
// ---------------------------------------------------------------------------------------------

interface RCand {
  body: string
  tail: number
  cost: number
  idLen: number
  content: RC[]
  rungCosts: number[]
}

/** The fill segment (quality round 1): the first unused word in rank order, `room` chars long. */
function refFill(fill: readonly RC[], used: ReadonlySet<string>, room: number): RRung | null {
  if (room < 2) return null
  const words = new Set(['topic', 'name', 'acronym', 'attr', 'qualifier', 'place', 'direction', 'region'])
  for (const u of fill) {
    if (used.has(u.c.key) || u.c.cls === 'model' || u.ladder.length === 0) continue
    let r: RRung | null = u.ladder.find((x) => x.segs.length === 1 && x.text.length === room) ?? null
    if (r === null && words.has(u.c.cls)) {
      const full = u.ladder.find((x) => x.kind === 'full')?.text ?? u.display
      if (full.length > room && /^[a-z0-9]+$/.test(full)) {
        const t = full.slice(0, room)
        r = { text: t, segs: [t], cost: 0, plain: false, verbatim: false }
      }
    }
    if (r === null || !/[a-z]/.test(r.text) || b1(r.text) || b2(r.text) || hardIn(r.text) || i8(r.text)) continue
    return r
  }
  return null
}

/** B3: no list word of 4+ chars across the joined body, unless soft and strictly inside a verbatim segment. */
function unsafe(segs: readonly { t: string; verb: boolean }[]): boolean {
  const joined = fold(segs.map((x) => x.t).join(''))
  if (BLOCK_HARD.some((x) => joined.includes(x))) return true
  let at = 0
  const bounds = segs.map((x) => {
    const b = { s: at, e: at + x.t.length, v: x.verb }
    at += x.t.length
    return b
  })
  for (const x of BLOCK_SOFT) {
    if (x.length < 4) continue
    for (let i = joined.indexOf(x); i !== -1; i = joined.indexOf(x, i + 1)) {
      const seg = bounds.find((b) => i >= b.s && i + x.length <= b.e)
      if (!(seg?.v === true && x.length < seg.e - seg.s)) return true
    }
  }
  return false
}

function refFit(
  pool: RC[],
  cfg: {
    length: number
    mode: 'exact' | 'max'
    sep: string
    maxSeg: number
    reserved: readonly string[]
    fill: boolean
  },
  minTail: number,
  only?: string,
  must?: ReadonlySet<string>,
  fill: readonly RC[] = [],
): RCand[] {
  const tailOpts = (len: number, m: number): number[] => {
    if (cfg.mode === 'exact') {
      if (len === cfg.length && m === 0) return [0]
      const t = cfg.length - len - cfg.sep.length
      return t >= Math.max(2, m) ? [t] : []
    }
    if (len > cfg.length) return []
    if (m === 0) return [0]
    return len + cfg.sep.length + m <= cfg.length ? [m] : []
  }
  const all: RCand[] = []
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const s = pool.filter((_, i) => mask & (1 << i))
    if (s.some((c) => c.ladder.length === 0)) continue
    const keys = new Set(s.map((c) => c.c.key))
    if (only !== undefined && [...keys].sort().join('|') !== only) continue
    if (must !== undefined && !s.some((c) => must.has(c.c.key))) continue
    if (s.some((c) => c.c.cls === 'model' && !keys.has(c.c.bond?.with ?? ''))) continue
    const lost = pool.filter((c) => !s.includes(c)).reduce((x, c) => x + c.score, 0)
    let top: RCand | undefined
    const pick = (i: number, rs: RRung[]) => {
      if (i < s.length) {
        for (const r of (s[i] as RC).ladder) pick(i + 1, [...rs, r])
        return
      }
      // segments: bonds joined, slot order, title position
      const items: { slot: number; pos: number; key: string; segs: string[]; cryptic: boolean; verb: boolean }[] = []
      const kids = new Map<string, RC[]>()
      const child = new Set<string>()
      for (const c of s) {
        const b = c.c.bond
        if (b === undefined || !keys.has(b.with)) continue
        if (b.kind === 'year' && (kids.get(b.with)?.length ?? 0) > 0) continue
        kids.set(b.with, [...(kids.get(b.with) ?? []), c])
        child.add(c.c.key)
      }
      for (const [i, c] of s.entries()) {
        if (child.has(c.c.key)) continue
        const r = rs[i] as RRung
        const ks = kids.get(c.c.key) ?? []
        if (ks.length === 0) {
          items.push({
            slot: SLOT[c.c.cls] ?? 2,
            pos: c.c.pos,
            key: c.c.key,
            segs: r.segs,
            cryptic: !r.plain,
            verb: r.verbatim,
          })
          continue
        }
        let text = r.text
        let cryptic = !r.plain
        let pos = c.c.pos
        for (const k of ks) {
          const kr = rs[s.indexOf(k)] as RRung
          text += kr.text
          cryptic ||= !kr.plain
          if (k.c.bond?.kind === 'year') pos = Math.min(pos, k.c.pos)
        }
        if (b1(text) || b2(text) || hardIn(text) || i8(text)) return
        // SPEC 11.5: the bond uses the 2-digit year (`26q1`), not the 4-digit rung
        if (c.c.cls === 'year' && r.text.length === 4 && c.ladder.some((x) => x.text.length === 2)) return
        items.push({ slot: SLOT[c.c.cls] ?? 2, pos, key: c.c.key, segs: [text], cryptic, verb: false })
      }
      items.sort((x, y) => x.slot - y.slot || x.pos - y.pos || lt(x.key, y.key))
      const segs = items.flatMap((it) =>
        it.segs.map((t) => ({ t, cryptic: it.cryptic && it.segs.length === 1, verb: it.verb })),
      )
      if (/^[0-9]/.test(segs[0]?.t ?? '')) segs.unshift({ t: 'doc', cryptic: false, verb: false })
      if (segs.length > cfg.maxSeg) return
      const body = segs.map((x) => x.t).join(cfg.sep)
      let tails = tailOpts(body.length, minTail)
      if (cfg.mode === 'max' && tails[0] === 0 && cfg.reserved.includes(body))
        tails = tailOpts(body.length, Math.max(2, minTail))
      if (unsafe(segs)) return
      if (cfg.sep === '' && i8(body)) return
      const content = [...s].sort(rankCmp)
      const base =
        rs.reduce((x, r) => x + r.cost, 0) +
        40 * segs.filter((x) => x.cryptic).length +
        lost +
        CHUNK * Math.max(0, segs.length - 2)
      const offer = (b: string, t: number, tailCost: number) => {
        const cand: RCand = {
          body: b,
          tail: t,
          cost: base + tailCost,
          idLen: b.length + (t === 0 ? 0 : cfg.sep.length + t),
          content,
          rungCosts: content.map((c) => (rs[s.indexOf(c)] as RRung).cost),
        }
        if (top === undefined || candCmp(cand, top, pool) < 0) top = cand
      }
      for (const t of tails) {
        if (t === 0 && cfg.reserved.includes(body)) continue
        // quality round 1: a fill segment from an unused word takes the room of a padding tail
        if (t > 0 && minTail === 0 && cfg.fill && segs.length < cfg.maxSeg) {
          const f = refFill(fill, keys, t)
          if (f !== null) {
            const all = [...segs, { t: f.text, cryptic: false, verb: f.verbatim }]
            const fb = `${body}${cfg.sep}${f.text}`
            if (!unsafe(all) && !(cfg.sep === '' && i8(fb))) {
              offer(fb, 0, 250 + 50 * (Math.min(t, 3) - 2))
              continue
            }
          }
        }
        offer(body, t, t === 0 ? 0 : 250 + 50 * (t - 2))
      }
    }
    pick(0, [])
    if (top !== undefined) all.push(top)
  }
  return all.sort((x, y) => candCmp(x, y, pool))
}

function candCmp(a: RCand, b: RCand, pool: RC[]): number {
  if (a.cost !== b.cost) return a.cost - b.cost
  if (a.idLen !== b.idLen) return a.idLen - b.idLen
  for (let i = 0; i < Math.min(a.rungCosts.length, b.rungCosts.length); i++) {
    const d = (a.rungCosts[i] as number) - (b.rungCosts[i] as number)
    if (d !== 0) return d
  }
  if (a.rungCosts.length !== b.rungCosts.length) return a.rungCosts.length - b.rungCosts.length
  for (const c of pool) {
    const ia = a.content.includes(c)
    const ib = b.content.includes(c)
    if (ia !== ib) return ia ? -1 : 1
  }
  return lt(a.body, b.body)
}

// ---------------------------------------------------------------------------------------------
// Reference: one row
// ---------------------------------------------------------------------------------------------

interface RefOut {
  value: Value
  scoreMismatch: string[]
}

function refPool(
  a: Analysis,
  config: SluggerConfig | undefined,
  diff: ReadonlySet<string>,
): { pool: RC[]; all: RC[]; mismatch: string[] } {
  const s = createSlugger(config)
  const cfg = s.config
  const scores = refScores(a, diff)
  const mismatch: string[] = []
  if (diff.size === 0)
    for (const c of a.concepts)
      if (scores.get(c.key) !== c.score) mismatch.push(`${c.key}: ref ${scores.get(c.key)} src ${c.score}`)
  const lex = lexWords(cfg.lexicon)
  const stop = new Set(cfg.stopWords)
  const stemsOf = new Map<string, string>()
  const stemSet = (word: string, lang: string): string => {
    const k = `${lang}:${word}`
    let v = stemsOf.get(k)
    if (v === undefined) {
      v = [...s.analyze(word, { lang: lang as Lang }).storedStems].sort().join(',')
      stemsOf.set(k, v)
    }
    return v
  }
  const sameStem = (x: string, y: string, langs: readonly string[]): boolean =>
    [...new Set(langs)].some(
      (l) =>
        (cfg.languages as readonly string[]).includes(l) && stemSet(x, l) !== '' && stemSet(x, l) === stemSet(y, l),
    )
  const rcs: RC[] = a.concepts.map((c) => {
    const tok = a.tokens[c.pos]
    const display = c.cls === 'month' || c.cls === 'weekday' ? (tok?.ascii ?? c.key) : (c.verbatim[0] ?? c.key)
    return {
      c,
      score: scores.get(c.key) ?? 0,
      display,
      lang: tok?.lang ?? a.lang,
      tokAscii: tok?.ascii ?? display,
      sameStem,
      ladder: [],
    }
  })
  for (const rc of rcs) rc.ladder = refLadder(rc, a, stop, lex, cfg.consistentRungs)
  const pool = rcs
    .filter((rc) => !rc.c.weak)
    .filter((rc) => cfg.leak !== 'opaque' && !(cfg.leak === 'minimal' && MINIMAL_DROP.has(rc.c.cls)))
    .filter((rc) => rc.score >= 100 && (rc.c.cls === 'model' || rc.ladder.length > 0))
    .sort(rankCmp)
    .slice(0, 6)
  // quality round 1: with one concept or less, weak words (not filler words) fill the free slots
  if (cfg.leak === 'normal' && pool.length <= 1) {
    const weak = rcs
      .filter((rc) => rc.c.weak && !WEAK_NO_SHOW.has(rc.c.lex?.key ?? '') && rc.ladder.length > 0)
      .sort(rankCmp)
    for (const rc of weak) {
      if (pool.length >= 6) break
      const low: RC = { ...rc, score: Math.min(rc.score, WEAK_POOL_SCORE), ladder: [] }
      low.ladder = refLadder(low, a, stop, lex, cfg.consistentRungs)
      pool.push(low)
    }
  }
  return { pool, all: [...rcs].sort(rankCmp), mismatch }
}

function refFitCfg(config: SluggerConfig | undefined) {
  const c = createSlugger(config).config
  return {
    length: c.length,
    mode: c.lengthMode,
    sep: c.separator,
    maxSeg: Math.min(c.maxSegments, c.leak === 'minimal' ? 3 : 5),
    reserved: c.reserved,
    fill: c.leak === 'normal' && c.lengthMode === 'exact',
  }
}

function emptyValue(config: SluggerConfig | undefined): Value {
  const c = createSlugger(config).config
  if (c.leak === 'opaque') return { body: '', tail: c.length }
  return { body: 'doc', tail: c.lengthMode === 'exact' ? c.length - 3 - c.separator.length : 2 }
}

/** The reference value of a row alone. */
function refAlone(title: string, config: SluggerConfig | undefined): RefOut & { best?: RCand; pool: RC[] } {
  const ana = config === undefined ? analyze(title) : createSlugger(config).analyze(title)
  const cfg = createSlugger(config).config
  if (cfg.leak === 'opaque' || ana.empty) return { value: emptyValue(config), scoreMismatch: [], pool: [] }
  const { pool, all, mismatch } = refPool(ana, config, new Set())
  const fc = refFitCfg(config)
  let cands = refFit(pool, fc, 0, undefined, undefined, all)
  if (cands.length === 0) cands = refFit(pool, { ...fc, maxSeg: 1 }, 0, undefined, undefined, all)
  const best = cands[0]
  if (best === undefined) return { value: emptyValue(config), scoreMismatch: mismatch, pool }
  return { value: { body: best.body, tail: best.tail }, scoreMismatch: mismatch, best, pool }
}

/** The reference value of a row after one earlier row in a memory store (SPEC 13.4, tier C). */
function refAfter(
  title: string,
  config: SluggerConfig | undefined,
  prior: { body: string; stems: Set<string> },
): RefOut {
  const alone = refAlone(title, config)
  const best = alone.best
  if (best === undefined || best.body !== prior.body) return alone
  const ana = createSlugger(config).analyze(title)
  const diff = new Set(alone.pool.filter((rc) => !rc.c.stemKeys.every((s) => prior.stems.has(s))).map((rc) => rc.c.key))
  const fc = refFitCfg(config)
  if (diff.size > 0) {
    const { pool, all } = refPool(ana, config, diff)
    const c2 = refFit(pool, fc, 0, undefined, diff, all)
    const free = c2.find((c) => c.body !== prior.body)
    if (free) return { value: { body: free.body, tail: free.tail }, scoreMismatch: alone.scoreMismatch }
  }
  if (best.tail > 0) return alone
  // refitWithTail with t = tailNeed(1) = 2: same content, rungs shrink; else drop the lowest-ranked concept
  let content = [...best.content]
  while (content.length > 0) {
    const r = refFit(
      alone.pool,
      fc,
      2,
      content
        .map((c) => c.c.key)
        .sort()
        .join('|'),
    )[0]
    if (r) return { value: { body: r.body, tail: r.tail }, scoreMismatch: alone.scoreMismatch }
    content = content.slice(0, -1)
  }
  return { value: emptyValue(config), scoreMismatch: alone.scoreMismatch }
}

// ---------------------------------------------------------------------------------------------
// src side
// ---------------------------------------------------------------------------------------------

function srcValue(row: AcceptRow, byN: ReadonlyMap<string, AcceptRow>): { value: Value; id: string } {
  const s = createSlugger(row.config)
  const store = new SyncMemoryStore()
  for (const n of row.after ?? []) runInto(s, store, (byN.get(n) as AcceptRow).title)
  const r = runInto(s, store, row.title).result
  return { value: { body: r.body, tail: r.tail.length }, id: r.id }
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

export interface AcceptResult {
  readonly row: AcceptRow
  readonly spec: Value
  readonly ref: Value
  readonly src: Value
  readonly srcId: string
  readonly impossible: string | null
  readonly agree: boolean
  readonly changed: boolean
  readonly scoreMismatch: readonly string[]
}

export function runAcceptance(): AcceptResult[] {
  const byN = new Map(ROWS.map((r) => [r.n, r]))
  const out: AcceptResult[] = []
  for (const row of ROWS) {
    const cfg = createSlugger(row.config).config
    const spec = parseValue(row.spec, cfg.separator)
    const impossible = possible(spec, cfg.length, cfg.lengthMode, cfg.separator)
    let ref: RefOut
    if (row.after === undefined) ref = refAlone(row.title, row.config)
    else {
      const prior = byN.get(row.after[0] as string) as AcceptRow
      const p = srcValue(prior, byN)
      const stems = new Set(createSlugger(row.config).analyze(prior.title).storedStems)
      ref = refAfter(row.title, row.config, { body: p.value.body, stems })
    }
    const src = srcValue(row, byN)
    const agree = ref.value.body === src.value.body && ref.value.tail === src.value.tail
    const changed = spec.body !== src.value.body || spec.tail !== src.value.tail
    out.push({
      row,
      spec,
      ref: ref.value,
      src: src.value,
      srcId: src.id,
      impossible,
      agree,
      changed,
      scoreMismatch: ref.scoreMismatch,
    })
  }
  // rows 45a and 45b: an Arabic and a CJK title get different tails
  const a = out.find((r) => r.row.n === '45a')
  const b = out.find((r) => r.row.n === '45b')
  if (a !== undefined && b !== undefined && a.srcId === b.srcId) throw new Error('rows 45a/45b: same ID')
  return out
}

function table(results: readonly AcceptResult[]): string {
  const lines = [
    '| # | Field | Title | Config | Expected (regenerated) | Status | Spec rev 3.1 | Note |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const r of results) {
    const sep = createSlugger(r.row.config).config.separator
    const cfg = [r.row.configName, r.row.after ? `after ${r.row.after.join(', ')}` : undefined]
      .filter(Boolean)
      .join(', ')
    const title = r.row.title === '' ? '(empty)' : JSON.stringify(r.row.title).slice(1, -1).replace(/\|/g, '\\|')
    const status = r.agree ? 'ref' : 'DIFF'
    const note = r.changed ? `changed (spec ${r.row.status})` : `same (spec ${r.row.status})`
    lines.push(
      `| ${r.row.n} | ${r.row.field} | ${title} | ${cfg || '-'} | \`${showValue(r.src, sep)}\` | ${status} | \`${r.row.spec}\` | ${note} |`,
    )
  }
  return lines.join('\n')
}

function main(): void {
  const results = runAcceptance()
  let bad = 0
  for (const r of results) {
    const sep = createSlugger(r.row.config).config.separator
    const flags = [
      r.agree ? 'agree' : 'REF!=SRC',
      r.changed ? 'changed' : 'same',
      r.impossible ? `IMPOSSIBLE(${r.impossible})` : '',
      r.scoreMismatch.length > 0 ? `SCORE(${r.scoreMismatch.join('; ')})` : '',
    ]
      .filter(Boolean)
      .join(' ')
    console.log(
      `${r.row.n.padEnd(4)} ${r.row.status} spec ${r.row.spec.padEnd(20)} ref ${showValue(r.ref, sep).padEnd(20)} src ${showValue(r.src, sep).padEnd(20)} ${flags}`,
    )
    if (!r.agree || r.impossible !== null || r.scoreMismatch.length > 0) bad++
  }
  const i = process.argv.indexOf('--out')
  const file = i >= 0 ? process.argv[i + 1] : undefined
  if (file !== undefined) {
    const text = [
      '# Acceptance examples (regenerated)',
      '',
      'Generated by `pnpm acceptance --out docs/acceptance.md` (SPEC 20, milestone M4). The reference',
      're-implementation in `scripts/ref-acceptance.ts` and `src` agree on every row marked `ref`.',
      'Default config: length 16, exact, `-`, leak `normal`, no store df. `[tN]` = a tail of N chars.',
      '"after N" = inserted after row N into one memory store.',
      'The rows are the SPEC 20 examples from many fields. The core has no field-specific data: a row',
      'with an "example recipe" config uses words the user adds through `lexicon` (README recipes, 15.8).',
      '',
      table(results),
      '',
    ].join('\n')
    writeFileSync(file, text)
    console.log(`written ${file}`)
  }
  console.log(`${results.length} rows, ${bad} problems`)
  if (bad > 0) process.exitCode = 1
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) main()
