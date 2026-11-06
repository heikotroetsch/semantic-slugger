import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SluggerConfig } from '../src/config.ts'
import { toCanonical } from '../src/core/normalize.ts'

/** Fixture schema (SPEC 19.7, rev 3.1). */
interface Fixture {
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
    config?: Partial<SluggerConfig>
  }
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8')) as Fixture[]
const content = fixtures.filter((f) => f.kind !== 'edge')
const ids = new Set(fixtures.map((f) => f.id))

function countBy<T>(list: readonly T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return m
}

/** Lower-case like a title, then the canonical form of SPEC 4.1. */
const canon = (s: string): string => toCanonical(s.normalize('NFKC').replace(/ẞ/g, 'ß').toLowerCase())

/** A keep word occurs in the title as whole tokens, or (3+ chars) as a compound part of one token. */
function occursIn(word: string, title: string): boolean {
  const k = canon(word)
  const t = canon(title)
  if (k === '') return false
  if (` ${t} `.includes(` ${k} `)) return true
  return k.length >= 3 && !k.includes(' ') && t.split(' ').some((tok) => tok.includes(k))
}

const isSiblingGroup = (g: string): boolean => !/^(dup|norm)-/.test(g)

describe('fixture corpus (SPEC 19.7)', () => {
  it('ids are unique and every entry has the required fields', () => {
    expect(ids.size).toBe(fixtures.length)
    for (const f of fixtures) {
      expect(typeof f.id, f.id).toBe('string')
      expect(['de', 'en', 'mixed'], f.id).toContain(f.lang)
      expect(typeof f.kind, f.id).toBe('string')
      expect(f.kind.length, f.id).toBeGreaterThan(0)
      expect(typeof f.title, f.id).toBe('string')
    }
  })

  it('has only known fields', () => {
    const known = new Set(['id', 'lang', 'kind', 'title', 'group', 'vary', 'near', 'keep', 'skip', 'expect'])
    for (const f of fixtures) for (const k of Object.keys(f)) expect(known.has(k), `${f.id}.${k}`).toBe(true)
  })

  it('has at least 12 content domains, none over 15%, procurement at most 10%', () => {
    const byKind = countBy(content, (f) => f.kind)
    expect(byKind.size).toBeGreaterThanOrEqual(12)
    for (const [kind, n] of byKind) expect(n / content.length, kind).toBeLessThanOrEqual(0.15)
    expect((byKind.get('procurement') ?? 0) / content.length).toBeLessThanOrEqual(0.1)
  })

  it('language shares: de and en at least 35%, mixed at least 5%', () => {
    const byLang = countBy(fixtures, (f) => f.lang)
    expect((byLang.get('de') ?? 0) / fixtures.length).toBeGreaterThanOrEqual(0.35)
    expect((byLang.get('en') ?? 0) / fixtures.length).toBeGreaterThanOrEqual(0.35)
    expect((byLang.get('mixed') ?? 0) / fixtures.length).toBeGreaterThanOrEqual(0.05)
  })

  it('every near and expect.after id exists; near is never the row itself', () => {
    for (const f of fixtures) {
      if (f.near !== undefined) {
        expect(ids.has(f.near), `${f.id}.near = ${f.near}`).toBe(true)
        expect(f.near, f.id).not.toBe(f.id)
      }
      for (const a of f.expect?.after ?? []) expect(ids.has(a), `${f.id}.expect.after ${a}`).toBe(true)
    }
  })

  it('has at least 10 real near pairs', () => {
    expect(fixtures.filter((f) => f.near !== undefined).length).toBeGreaterThanOrEqual(10)
  })

  it('keep is set on 150+ content titles and on 10+ titles of every content domain', () => {
    const withKeep = content.filter((f) => f.keep !== undefined)
    expect(withKeep.length).toBeGreaterThanOrEqual(150)
    const byKind = countBy(withKeep, (f) => f.kind)
    for (const kind of new Set(content.map((f) => f.kind)))
      expect(byKind.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(10)
    for (const f of fixtures.filter((x) => x.kind === 'edge')) expect(f.keep, f.id).toBeUndefined()
  })

  it('every keep word occurs in its title (after toCanonical)', () => {
    for (const f of fixtures) {
      if (f.keep === undefined) continue
      expect(Array.isArray(f.keep) && f.keep.length > 0, f.id).toBe(true)
      for (const w of f.keep) expect(occursIn(w, f.title), `${f.id}: "${w}" in "${f.title}"`).toBe(true)
    }
  })

  it('skip: only on sibling groups, same on every row of the group, with a reason, at most 3% of pairs', () => {
    const groups = new Map<string, Fixture[]>()
    for (const f of fixtures) if (f.group) groups.set(f.group, [...(groups.get(f.group) ?? []), f])
    for (const f of fixtures) {
      if (f.skip === undefined) continue
      expect(f.group, f.id).toBeDefined()
      expect(isSiblingGroup(f.group as string), f.id).toBe(true)
      expect(Object.keys(f.skip), f.id).toEqual(['Q6'])
      expect(typeof f.skip.Q6 === 'string' && f.skip.Q6.trim().length > 0, f.id).toBe(true)
    }
    let pairs = 0
    let skipped = 0
    for (const [g, rows] of groups) {
      const first = JSON.stringify(rows[0]?.skip)
      for (const r of rows) expect(JSON.stringify(r.skip), `${g}: ${r.id}`).toBe(first)
      if (!isSiblingGroup(g)) continue
      const n = (rows.length * (rows.length - 1)) / 2
      pairs += n
      if (rows[0]?.skip) skipped += n
    }
    expect(pairs).toBeGreaterThan(0)
    expect(skipped / pairs).toBeLessThanOrEqual(0.03)
  })

  it('sibling group rows say what differs (vary)', () => {
    for (const f of fixtures) if (f.group && isSiblingGroup(f.group)) expect(typeof f.vary, f.id).toBe('string')
  })
})
