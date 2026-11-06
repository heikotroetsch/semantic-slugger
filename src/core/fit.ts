/**
 * Fit (SPEC 12, step 11): a bounded, exact search over concept subsets x rungs x tail length for the
 * cheapest body. One candidate per subset (the cheapest spelling), sorted by cost and the tie-breaks
 * of SPEC 12. Integer costs and a fixed loop order make the result deterministic.
 */

import type { ConceptClass, ResolvedConfig } from '../config.ts'
import { DECOYS } from '../data/v1/decoys.ts'
import type { Laddered, Rung } from './ladder.ts'
import { rankOrder } from './rank.ts'
import { bodyBlocked, fold, hardHitIn, hasLookalikePair, rungBlocked, segmentBlocked } from './safety.ts'

/** Fit costs (SPEC 11.1, 12). */
export const FIT_COST: Readonly<{
  cryptic: number
  stub: number
  pad: number
  chunk: number
  tailBase: number
  tailStep: number
}> = Object.freeze({
  cryptic: 40,
  stub: 60,
  pad: 250,
  chunk: 80,
  tailBase: 250,
  tailStep: 50,
})

/** A cryptic segment of this length or less is a stub and pays `FIT_COST.stub` on top. */
export const STUB_LEN = 4

/**
 * The first concepts in rank order that count their full score when the body drops them; topic
 * words (slot T) after them count half (docs/DEVIATIONS.md, quality round 2). Qualifiers, places,
 * numbers and markers always count full: they often tell sibling titles apart. Two whole words read better than three or four
 * cut stubs, so a long title should not force its minor words into the body.
 */
export const LOST_FULL = 2

const DECOY_SET: ReadonlySet<string> = new Set(DECOYS)

/** Shortest fill segment (docs/DEVIATIONS.md, quality round 1). */
export const FILL_MIN = 2
/** A fill costs what a tail of its length costs, but never more than a tail of this length. */
export const FILL_COST_CAP = 3

/** Slots of the body: T topic, Q qualifier, N number and time (SPEC 2.1). */
const SLOT: Readonly<Record<ConceptClass, number>> = Object.freeze({
  topic: 0,
  name: 0,
  acronym: 0,
  attr: 0,
  qualifier: 1,
  place: 1,
  direction: 1,
  region: 1,
  code: 1,
  year: 2,
  range: 2,
  quarter: 2,
  month: 2,
  week: 2,
  weekday: 2,
  version: 2,
  marker: 2,
  model: 2,
  longnum: 2,
  quantity: 2,
})

export type SegKind = 'word' | 'number' | 'code' | 'fallback'

/** One body segment of a candidate. */
export interface FitSeg {
  readonly text: string
  readonly kind: SegKind
  /** Pays the cryptic cost (SPEC 11.1); a joined bond is cryptic when one of its rungs is. */
  readonly cryptic: boolean
  readonly verbatim: boolean
  /** Concepts shown in this segment (two for a bond), main concept first. */
  readonly concepts: readonly Laddered[]
  /** Rung of each concept, same order. */
  readonly rungs: readonly Rung[]
}

export interface CostParts {
  readonly rungs: number
  readonly cryptic: number
  readonly lost: number
  readonly chunks: number
  readonly tail: number
}

export interface Candidate {
  readonly body: string
  readonly segs: readonly FitSeg[]
  readonly tailLen: number
  /** Concepts in the body, in rank order. */
  readonly content: readonly Laddered[]
  /** Sorted concept keys joined by '|'. */
  readonly contentKey: string
  readonly cost: number
  readonly parts: CostParts
  /** Length of the full ID (body, separator and tail). */
  readonly idLength: number
}

export interface FitConstraint {
  readonly minTail?: number
  /** At least one concept of the subset has a key in this set (re-pick, SPEC 13.4). */
  readonly mustInclude?: ReadonlySet<string>
  /** Only the subset with this content key (refitWithTail, SPEC 13.2). */
  readonly onlyContent?: string
  /** Override of `cfg.maxSegments` (fallback chain, SPEC 12). */
  readonly maxSegments?: number
  /**
   * Concepts (in rank order, weak ones included) whose words may fill the room of a padding tail
   * (docs/DEVIATIONS.md, quality round 1). Empty or missing: no fill segments.
   */
  readonly fill?: readonly Laddered[]
}

/** Classes whose word may be cut to any prefix for a fill segment. */
const FILL_WORD: ReadonlySet<ConceptClass> = new Set<ConceptClass>([
  'topic',
  'name',
  'acronym',
  'attr',
  'qualifier',
  'place',
  'direction',
  'region',
])

/**
 * The fill segment for `room` chars (docs/DEVIATIONS.md, quality round 1): instead of a padding tail,
 * the first title word in rank order that the body does not show. It costs what the tail costs, so it
 * never changes which content the fit picks. A rung of exactly `room` chars, or for word classes the
 * first `room` chars of the full word. Null when no unused concept gives a safe text.
 */
function fillSegment(
  fill: readonly Laddered[],
  used: ReadonlySet<string>,
  room: number,
  cfg: ResolvedConfig,
  cache: Map<string, boolean>,
  skeletons = false,
): FitSeg | null {
  if (room < FILL_MIN) return null
  for (const u of fill) {
    if (used.has(u.key) || u.cls === 'model' || u.ladder.length === 0) continue
    const exact = u.ladder.find(
      (r) => r.segs.length === 1 && r.text.length === room && (skeletons || r.kind !== 'skeleton'),
    )
    let text: string | undefined = exact?.text
    let rung: Rung | undefined = exact
    if (text === undefined && FILL_WORD.has(u.cls)) {
      const full = u.ladder.find((r) => r.kind === 'full')?.text ?? u.display
      if (full.length > room && /^[a-z0-9]+$/.test(full) && !DECOY_SET.has(full.slice(0, room))) {
        text = full.slice(0, room)
        rung = { text, segs: [text], kind: 'coda', cost: 0, plain: false, verbatim: false }
      }
    }
    if (text === undefined || rung === undefined || !/[a-z]/.test(text) || !joinedOk(text, cfg, cache)) continue
    return {
      text,
      kind: segKind(u.cls),
      cryptic: !rung.plain,
      verbatim: rung.verbatim,
      concepts: [u],
      rungs: [rung],
    }
  }
  return null
}

/** A fill is "whole" when it shows a plain rung (a full word, a number) or at least this many chars. */
export const FILL_WHOLE = 4

/**
 * A whole unused title word shorter than the room (docs/DEVIATIONS.md, quality round 2): the first
 * unused concept in rank order with a plain one-segment rung of 2 to `room - 1` chars. A grown segment
 * then takes the rest of the room.
 */
function wholeFill(
  fill: readonly Laddered[],
  used: ReadonlySet<string>,
  room: number,
  cfg: ResolvedConfig,
  cache: Map<string, boolean>,
): FitSeg | null {
  for (const u of fill) {
    if (used.has(u.key) || u.cls === 'model') continue
    const r = u.ladder.find(
      (x) =>
        x.plain && x.segs.length === 1 && x.text.length >= FILL_MIN && x.text.length < room && /[a-z]/.test(x.text),
    )
    if (r === undefined || !joinedOk(r.text, cfg, cache)) continue
    return { text: r.text, kind: segKind(u.cls), cryptic: false, verbatim: r.verbatim, concepts: [u], rungs: [r] }
  }
  return null
}

/**
 * Extension (docs/DEVIATIONS.md, quality round 2): instead of a padding tail, a segment of the body
 * grows by `room` chars into the rest of its own word: a cut into the full word
 * (`employee-hand` -> `employee-handboo`), or a base form into the typed form (`guideline` ->
 * `guidelines`), or a weekday or month into its full name (`sat` -> `satur`). Only single-concept
 * segments; a plain word segment only when it grows into a whole word. The shortest segment grows first (the stub gains the most), then the first in body order.
 * Null when no segment can grow.
 */
function extendSegments(
  segs: readonly FitSeg[],
  room: number,
  cfg: ResolvedConfig,
  cache: Map<string, boolean>,
): FitSeg[] | null {
  let pick = -1
  let grown = ''
  let whole = false
  segs.forEach((seg, i) => {
    const u = seg.concepts[0]
    if (seg.concepts.length !== 1 || u === undefined) return
    const named = u.cls === 'weekday' || u.cls === 'month'
    if (seg.kind !== 'word' && !named) return
    const full = u.ladder.find((r) => r.kind === 'full')?.text ?? u.display
    // a weekday or month grows into its full name (`sat` -> `satur`)
    const targets = named ? u.ladder.map((r) => r.text).sort((a, b) => b.length - a.length) : [u.display, full]
    for (const target of targets) {
      if (!/^[a-z0-9]+$/.test(target) || !target.startsWith(seg.text)) continue
      if (target.length < seg.text.length + room) continue
      const text = target.slice(0, seg.text.length + room)
      const done = text === target
      if ((!done && ((!seg.cryptic && !named) || DECOY_SET.has(text))) || !joinedOk(text, cfg, cache)) continue
      const cur = segs[pick]
      if (cur === undefined || seg.text.length < cur.text.length) {
        pick = i
        grown = text
        whole = done
      }
      break
    }
  })
  const at = segs[pick]
  if (at === undefined) return null
  const rung: Rung = { text: grown, segs: [grown], kind: 'coda', cost: 0, plain: whole, verbatim: false }
  const out = [...segs]
  out[pick] = { ...at, text: grown, cryptic: !whole, verbatim: false, rungs: [rung] }
  return out
}

/**
 * The fill segment in slot order (docs/DEVIATIONS.md, quality round 2): a word fill goes before the
 * number and time segments (`release-note-v23`, not `release-v23-note`), else at the end. A short stub
 * (cryptic, under 4 chars) stays at the end.
 */
function withFill(segs: readonly FitSeg[], f: FitSeg): FitSeg[] {
  const u = f.concepts[0]
  if (u === undefined || (f.cryptic && f.text.length < FILL_WHOLE)) return [...segs, f]
  const at = segs.findIndex((x, i) => i > 0 && x.concepts[0] !== undefined && SLOT[x.concepts[0].cls] > SLOT[u.cls])
  return at < 0 ? [...segs, f] : [...segs.slice(0, at), f, ...segs.slice(at)]
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Content key of a set of concepts: sorted keys joined by '|'. */
export function contentKeyOf(cs: readonly { readonly key: string }[]): string {
  return cs
    .map((c) => c.key)
    .sort(cmpStr)
    .join('|')
}

/** Tail lengths a body of this length can take (SPEC 12). */
export function tailOptions(bodyLen: number, cfg: ResolvedConfig, minTail: number): number[] {
  const L = cfg.length
  const sep = cfg.separator.length
  if (cfg.lengthMode === 'exact') {
    if (bodyLen === L && minTail === 0) return [0]
    const t = L - bodyLen - sep
    return t >= Math.max(cfg.tailMin, minTail) ? [t] : []
  }
  if (bodyLen > L) return []
  if (minTail === 0) return [0]
  return bodyLen + sep + minTail <= L ? [minTail] : []
}

/** Tail cost (SPEC 12). */
export function tailCost(tailLen: number, cfg: ResolvedConfig): number {
  return tailLen === 0 ? 0 : FIT_COST.tailBase + FIT_COST.tailStep * (tailLen - cfg.tailMin)
}

/** A joined bond segment (`26q1`, `phone8`) passes B1, B2, B7 and I8 (SPEC 11.5). */
function joinedOk(text: string, cfg: ResolvedConfig, cache: Map<string, boolean>): boolean {
  let ok = cache.get(text)
  if (ok === undefined) {
    ok = !segmentBlocked(text, cfg) && !rungBlocked(text, cfg) && !hardHitIn(fold(text), cfg) && !hasLookalikePair(text)
    cache.set(text, ok)
  }
  return ok
}

interface Item {
  slot: number
  pos: number
  key: string
  segs: FitSeg[]
}

function segKind(cls: ConceptClass): SegKind {
  if (cls === 'code') return 'code'
  return SLOT[cls] === 2 ? 'number' : 'word'
}

/**
 * Segments of one subset with one rung per concept, in slot order (T, Q, N; title position inside a
 * slot), with number and model bonds joined and the fallback word before a leading digit (SPEC 2.1,
 * 11.5). Returns null when a joined bond fails the safety rules.
 */
function slotOrder(
  s: readonly Laddered[],
  rungs: readonly Rung[],
  cfg: ResolvedConfig,
  cache: Map<string, boolean>,
): FitSeg[] | null {
  const rungOf = new Map<string, Rung>()
  const byKey = new Map<string, Laddered>()
  s.forEach((c, i) => {
    rungOf.set(c.key, rungs[i] as Rung)
    byKey.set(c.key, c)
  })
  // bond children: models join their word; a quarter or month joins its year (the first by position)
  const joinTo = new Map<string, Laddered[]>()
  const child = new Set<string>()
  for (const c of s) {
    const b = c.bond
    if (b === undefined || !byKey.has(b.with)) continue
    if (b.kind === 'year') {
      // s is in rank order, so pick the first by title position (then key), not the first seen
      const prev = joinTo.get(b.with)?.[0]
      if (prev !== undefined) {
        if (prev.pos < c.pos || (prev.pos === c.pos && prev.key <= c.key)) continue
        child.delete(prev.key)
      }
      joinTo.set(b.with, [c])
    } else {
      const list = joinTo.get(b.with) ?? []
      list.push(c)
      joinTo.set(b.with, list)
    }
    child.add(c.key)
  }
  const items: Item[] = []
  for (const c of s) {
    if (child.has(c.key)) continue
    const r = rungOf.get(c.key) as Rung
    const kids = joinTo.get(c.key) ?? []
    if (kids.length === 0) {
      const segs: FitSeg[] = r.segs.map((text) => ({
        text,
        kind: segKind(c.cls),
        cryptic: !r.plain,
        verbatim: r.verbatim,
        concepts: [c],
        rungs: [r],
      }))
      items.push({ slot: SLOT[c.cls], pos: c.pos, key: c.key, segs })
      continue
    }
    let text = r.text
    let cryptic = !r.plain
    const concepts: Laddered[] = [c]
    const rs: Rung[] = [r]
    let pos = c.pos
    for (const k of kids) {
      const kr = rungOf.get(k.key) as Rung
      text += kr.text
      cryptic ||= !kr.plain
      concepts.push(k)
      rs.push(kr)
      if (k.bond?.kind === 'year') pos = Math.min(pos, k.pos)
    }
    if (r.segs.length !== 1 || !joinedOk(text, cfg, cache)) return null
    // a quarter or month bond uses the 2-digit year (`26q1`, `26mrz`), never `2026q1` (SPEC 11.5)
    if (c.cls === 'year' && r.text.length === 4 && c.ladder.some((x) => x.text.length === 2)) return null
    // a bond shows the short month (`26mar`), never the full name
    if (kids.some((k) => k.cls === 'month' && (rungOf.get(k.key) as Rung).text.length > 3)) return null
    const isModel = kids.some((k) => k.cls === 'model')
    const main = isModel ? c : (kids[0] as Laddered)
    items.push({
      slot: SLOT[c.cls],
      pos,
      key: c.key,
      segs: [{ text, kind: segKind(main.cls), cryptic, verbatim: false, concepts, rungs: rs }],
    })
  }
  items.sort((a, b) => a.slot - b.slot || a.pos - b.pos || cmpStr(a.key, b.key))
  const segs = items.flatMap((it) => it.segs)
  const first = segs[0]
  if (first !== undefined && first.text.charCodeAt(0) >= 48 && first.text.charCodeAt(0) <= 57)
    segs.unshift({ text: cfg.fallbackWord, kind: 'fallback', cryptic: false, verbatim: false, concepts: [], rungs: [] })
  return segs
}

/** Lowest segment count of a subset: bonds join, a wide range fills two segments. */
function minSegs(s: readonly Laddered[]): number {
  const keys = new Set(s.map((c) => c.key))
  const years = new Set<string>()
  let n = 0
  for (const c of s) {
    const b = c.bond
    if (b !== undefined && keys.has(b.with)) {
      if (b.kind === 'word') continue
      if (!years.has(b.with)) {
        years.add(b.with)
        continue
      }
    }
    n += Math.min(...c.ladder.map((r) => r.segs.length))
  }
  return n
}

/** Cheapest rung cost of a concept. */
function minCost(c: Laddered): number {
  let m = Number.POSITIVE_INFINITY
  for (const r of c.ladder) if (r.cost < m) m = r.cost
  return m
}

/** Rank comparator over pool positions. */
function rankIndex(pool: readonly Laddered[]): Map<string, number> {
  return new Map(pool.map((c, i) => [c.key, i]))
}

/**
 * Candidate order (SPEC 12): cost, ID length, rung costs in rank order (list compare), content by
 * rank (the candidate with the higher-ranked unshared concept wins), body.
 */
export function compareCandidates(a: Candidate, b: Candidate, rank: ReadonlyMap<string, number>): number {
  if (a.cost !== b.cost) return a.cost - b.cost
  if (a.idLength !== b.idLength) return a.idLength - b.idLength
  const ra = rungCosts(a)
  const rb = rungCosts(b)
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
    const d = (ra[i] as number) - (rb[i] as number)
    if (d !== 0) return d
  }
  if (ra.length !== rb.length) return ra.length - rb.length
  if (a.contentKey !== b.contentKey) {
    const inA = new Set(a.content.map((c) => c.key))
    const inB = new Set(b.content.map((c) => c.key))
    let best: { idx: number; side: number } | undefined
    for (const k of new Set([...inA, ...inB])) {
      if (inA.has(k) === inB.has(k)) continue
      const idx = rank.get(k) ?? Number.MAX_SAFE_INTEGER
      if (best === undefined || idx < best.idx) best = { idx, side: inA.has(k) ? -1 : 1 }
    }
    if (best !== undefined) return best.side
  }
  return cmpStr(a.body, b.body)
}

/** Rung costs of the content in rank order. */
function rungCosts(c: Candidate): number[] {
  const out: number[] = []
  for (const k of c.content) {
    for (const seg of c.segs) {
      const i = seg.concepts.indexOf(k)
      if (i >= 0) {
        out.push((seg.rungs[i] as Rung).cost)
        break
      }
    }
  }
  return out
}

function insertSorted(best: Candidate[], c: Candidate, rank: ReadonlyMap<string, number>, max: number): void {
  let i = best.length
  while (i > 0 && compareCandidates(c, best[i - 1] as Candidate, rank) < 0) i--
  best.splice(i, 0, c)
  if (best.length > max) best.length = max
}

/** True when the body passes B3, B7 (body part), joined I8 and the reserved rule (SPEC 9.2, 9.3). */
function safeBody(segs: readonly FitSeg[], body: string, tailLen: number, cfg: ResolvedConfig): boolean {
  if (bodyBlocked(segs, cfg)) return false
  if (hardHitIn(fold(segs.map((s) => s.text).join('')), cfg)) return false
  if (cfg.separator === '' && hasLookalikePair(body)) return false
  if (tailLen === 0 && cfg.reserved.includes(body)) return false
  return true
}

/**
 * The best `maxPlans` candidates, one per subset, sorted (SPEC 12). `pool` must be in rank order.
 * Subsets of any size are tried when their segment count can fit `maxSegments`.
 */
export function fitBody(pool: readonly Laddered[], cfg: ResolvedConfig, constraint: FitConstraint = {}): Candidate[] {
  const maxSeg = Math.min(constraint.maxSegments ?? cfg.maxSegments, cfg.leak === 'minimal' ? 3 : 5)
  const minTail = constraint.minTail ?? 0
  const fill = cfg.leak === 'normal' && cfg.lengthMode === 'exact' ? (constraint.fill ?? []) : []
  const rank = rankIndex(pool)
  const n = pool.length
  const keyOf = (c: Laddered) => c.key
  const subsets: { s: Laddered[]; mask: number; lost: number; fixed: number; lb: number }[] = []
  for (let mask = 1; mask < 1 << n; mask++) {
    const s: Laddered[] = []
    let lost = 0
    pool.forEach((c, i) => {
      if (mask & (1 << i)) s.push(c)
      // a topic word below the first two concepts counts half (docs/DEVIATIONS.md, quality round 2)
      else lost += i < LOST_FULL || SLOT[c.cls] !== 0 ? c.score : c.score >> 1
    })
    if (s.some((c) => c.ladder.length === 0)) continue
    if (constraint.mustInclude !== undefined && !s.some((c) => constraint.mustInclude?.has(keyOf(c)))) continue
    if (constraint.onlyContent !== undefined && contentKeyOf(s) !== constraint.onlyContent) continue
    // a model number only together with its word (SPEC 11.5)
    if (!s.every((c) => c.cls !== 'model' || (c.bond !== undefined && s.some((w) => w.key === c.bond?.with)))) continue
    const ms = minSegs(s)
    if (ms > maxSeg) continue
    // lower bound of every candidate of this subset: lost score, the fewest chunks and the cheapest rungs
    const fixed = lost + FIT_COST.chunk * Math.max(0, ms - 2)
    subsets.push({ s, mask, lost, fixed, lb: fixed + s.reduce((acc, c) => acc + minCost(c), 0) })
  }
  subsets.sort((a, b) => a.lb - b.lb || a.mask - b.mask)

  const maxPlans = cfg.maxPlans
  const best: Candidate[] = []
  const bondCache = new Map<string, boolean>()
  const safeCache = new Map<string, boolean>()
  for (const { s, lost, fixed, lb } of subsets) {
    if (best.length >= maxPlans && lb > (best[maxPlans - 1] as Candidate).cost) break
    const content = [...s].sort(rankOrder)
    const contentKey = contentKeyOf(s)
    const used = new Set(s.map(keyOf))
    let top: Candidate | undefined
    // cheapest rung cost of concepts i.. (for pruning)
    const restMin: number[] = new Array<number>(s.length + 1).fill(0)
    for (let i = s.length - 1; i >= 0; i--) restMin[i] = (restMin[i + 1] as number) + minCost(s[i] as Laddered)
    const rungs: Rung[] = new Array<Rung>(s.length)
    /** No candidate with a cost above this can enter `best` (equal costs still compete on tie-breaks). */
    const limit = (): number => {
      let l = top === undefined ? Number.POSITIVE_INFINITY : top.cost
      if (best.length >= maxPlans) l = Math.min(l, (best[maxPlans - 1] as Candidate).cost)
      return l
    }
    const visit = (rungCost: number): void => {
      const segs = slotOrder(s, rungs, cfg, bondCache)
      if (segs === null || segs.length > maxSeg) return
      const body = segs.map((x) => x.text).join(cfg.separator)
      let tails = tailOptions(body.length, cfg, minTail)
      // max mode: a reserved body without a tail gets a forced tail (SPEC 9.3)
      if (cfg.lengthMode === 'max' && tails[0] === 0 && cfg.reserved.includes(body))
        tails = tailOptions(body.length, cfg, Math.max(cfg.tailMin, minTail))
      // a cryptic stub of 4 chars or less pays more (docs/DEVIATIONS.md, quality round 2)
      const cryptic = segs.reduce(
        (acc, x) => acc + (x.cryptic ? FIT_COST.cryptic + (x.text.length <= STUB_LEN ? FIT_COST.stub : 0) : 0),
        0,
      )
      const chunks = FIT_COST.chunk * Math.max(0, segs.length - 2)
      const offer = (all: readonly FitSeg[], text: string, t: number, tail: number): void => {
        const cost = rungCost + cryptic + lost + chunks + tail
        if (cost > limit()) return
        const sk = `${t === 0 ? 0 : 1}|${all.map((x) => (x.verbatim ? '1' : '0')).join('')}|${text}`
        let ok = safeCache.get(sk)
        if (ok === undefined) {
          ok = safeBody(all, text, t, cfg)
          safeCache.set(sk, ok)
        }
        if (!ok) return
        const c: Candidate = {
          body: text,
          segs: all,
          tailLen: t,
          content,
          contentKey,
          cost,
          parts: { rungs: rungCost, cryptic, lost, chunks, tail },
          idLength: text.length + (t === 0 ? 0 : cfg.separator.length + t),
        }
        if (top === undefined || compareCandidates(c, top, rank) < 0) top = c
      }
      // padding policy (docs/DEVIATIONS.md, quality rounds 1 and 2): a whole unused title word (or 4+
      // of its chars), else a cut of the body that grows into its own word, else a short unused word,
      // takes the room of a padding tail. Letters cost `FIT_COST.pad` (a 2-char tail) at any length; a
      // short stub costs a 3-char tail.
      const pad = (t: number): boolean => {
        if (minTail !== 0 || fill.length === 0) return false
        const cost = FIT_COST.pad
        const stub = tailCost(Math.max(cfg.tailMin, FILL_COST_CAP), cfg)
        const f = t > 0 && segs.length < maxSeg ? fillSegment(fill, used, t, cfg, bondCache) : null
        if (f !== null && (!f.cryptic || f.text.length >= FILL_WHOLE)) {
          const all = withFill(segs, f)
          offer(all, all.map((x) => x.text).join(cfg.separator), 0, cost)
          return true
        }
        const ext = extendSegments(segs, cfg.length - body.length, cfg, bondCache)
        if (ext !== null) {
          offer(ext, ext.map((x) => x.text).join(cfg.separator), 0, cost)
          return true
        }
        // a shorter whole word, then a grown segment
        const w = t > 0 && segs.length < maxSeg ? wholeFill(fill, used, t, cfg, bondCache) : null
        if (w !== null) {
          const all = withFill(segs, w)
          const grown = extendSegments(
            all,
            cfg.length - all.map((x) => x.text).join(cfg.separator).length,
            cfg,
            bondCache,
          )
          if (grown !== null) {
            offer(grown, grown.map((x) => x.text).join(cfg.separator), 0, cost)
            return true
          }
        }
        // a skeleton of an unused word is the last resort before a random tail
        const g = f ?? (t > 0 && segs.length < maxSeg ? fillSegment(fill, used, t, cfg, bondCache, true) : null)
        if (g !== null) {
          const all = withFill(segs, g)
          offer(all, all.map((x) => x.text).join(cfg.separator), 0, stub)
          return true
        }
        return false
      }
      for (const t of tails) {
        if (t > 0 && pad(t)) continue
        offer(segs, body, t, tailCost(t, cfg))
      }
      // a body one or two chars short of the length can take no tail: only a grown segment fills it
      if (cfg.lengthMode === 'exact' && tails.length === 0 && body.length < cfg.length) pad(0)
    }
    // rung combinations in odometer order (last concept fastest); a branch whose lower bound is above
    // the limit is skipped, which never changes the result
    const walk = (i: number, rungCost: number): void => {
      if (i === s.length) {
        visit(rungCost)
        return
      }
      const c = s[i] as Laddered
      for (const r of c.ladder) {
        if (fixed + rungCost + r.cost + (restMin[i + 1] as number) > limit()) continue
        rungs[i] = r
        walk(i + 1, rungCost + r.cost)
      }
    }
    walk(0, 0)
    if (top !== undefined) insertSorted(best, top, rank, maxPlans)
  }
  return best
}

/** The fallback body with a tail of at least `t` (SPEC 13.2, 13.6); null when nothing fits. */
export function fallbackCandidate(pool: readonly Laddered[], cfg: ResolvedConfig, t: number): Candidate | null {
  const body = cfg.fallbackWord
  const tails = tailOptions(body.length, cfg, Math.max(t, cfg.tailMin))
  const tl = tails[0]
  if (tl === undefined) return null
  const lost = pool.reduce((acc, c) => acc + c.score, 0)
  const tail = tailCost(tl, cfg)
  return {
    body,
    segs: [{ text: body, kind: 'fallback', cryptic: false, verbatim: false, concepts: [], rungs: [] }],
    tailLen: tl,
    content: [],
    contentKey: '',
    cost: lost + tail,
    parts: { rungs: 0, cryptic: 0, lost, chunks: 0, tail },
    idLength: body.length + cfg.separator.length + tl,
  }
}

/**
 * Keep the content of `chosen` with a tail of at least `t` (rungs shrink); else drop the lowest-ranked
 * concept and try again; else the fallback body (SPEC 13.2).
 */
export function refitWithTail(
  pool: readonly Laddered[],
  cfg: ResolvedConfig,
  chosen: Candidate,
  t: number,
): Candidate | null {
  let content = [...chosen.content]
  while (content.length > 0) {
    const c = fitBody(pool, cfg, { minTail: t, onlyContent: contentKeyOf(content) })[0]
    if (c !== undefined) return c
    content = content.slice(0, -1)
  }
  return fallbackCandidate(pool, cfg, t)
}
