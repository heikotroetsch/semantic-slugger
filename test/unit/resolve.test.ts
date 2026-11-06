/**
 * Resolve branches (SPEC 13.4, 19.1 "resolve") through the store driver and the memory adapter.
 * Sibling titles come from the corpus by group (SPEC 19.1: tests select fixtures by group or content).
 */
import { describe, expect, it } from 'vitest'
import { loadFixtures } from '../../scripts/lib/corpus.ts'
import { memoryStore } from '../../src/adapters/memory.ts'
import {
  createSlugger,
  createUnique,
  ExhaustedError,
  generate,
  isSluggerError,
  type SluggerConfig,
  type SlugStore,
  suggest,
} from '../../src/index.ts'
import { existsOnly, noFind } from '../helpers/stores.ts'

const fixtures = loadFixtures()
const group = (g: string): string[] => fixtures.filter((f) => f.group === g).map((f) => f.title)

async function seq(
  titles: readonly string[],
  config?: SluggerConfig,
  wrap?: (m: ReturnType<typeof memoryStore>) => SlugStore,
) {
  const s = createSlugger(config)
  const m = memoryStore()
  const store = wrap ? wrap(m) : m
  const out = []
  for (const t of titles) out.push((await s.createUnique(t, { store })).result)
  return { out, m }
}

describe('resolve branches (SPEC 13.4)', () => {
  it('base: a free best body', async () => {
    const { out } = await seq(['Jahresbericht Vertrieb Nord 2026'])
    expect(out[0]).toMatchObject({ id: 'vertrieb-nord-26', reason: 'base', tail: '' })
  })

  it('a direction or side word that tells siblings apart shows in the base body (quality round 2)', async () => {
    const [north, south] = group('news-storm-direction')
    expect(north).toMatch(/North/)
    const { out } = await seq([north as string, south as string])
    expect(out.map((r) => r.reason)).toEqual(['base', 'base'])
    expect(out[0]?.body).toContain('north')
    expect(out[1]?.body).toContain('south')
    const knee = await seq(group('medical-knee-side'))
    expect(knee.out[0]?.body).toContain('links')
    expect(knee.out[1]?.body).not.toBe(knee.out[0]?.body)
  })

  it('repick: a sibling that differs in a dropped year shows that year (tier C)', async () => {
    const titles = group('news-wahl-year')
    const { out } = await seq(titles)
    expect(out[0]?.reason).toBe('base')
    expect(out[1]?.reason).toBe('repick')
    expect(out[1]?.segments.some((s) => s.text.includes('28'))).toBe(true)
    expect(out[1]?.body).not.toBe(out[0]?.body)
  })

  it('tier B (no findByBody): a sibling keeps the best body and gets a tail', async () => {
    const titles = group('news-wahl-year')
    const { out } = await seq(titles, undefined, noFind)
    expect(out[1]?.storeTier).toBe('B')
    expect(out[1]?.reason).toBe('shared-body')
  })

  it('shared-body with an empty diff: identical, case variant and plural variant keep the body', async () => {
    // the first copy is body-only; the later copies refit to one tailed body with the same content
    const id = await seq([
      'Kartoffelgratin mit Bergkäse',
      'Kartoffelgratin mit Bergkäse',
      'Kartoffelgratin mit Bergkäse',
    ])
    expect(id.out.map((r) => r.reason)).toEqual(['base', 'shared-body', 'shared-body'])
    expect(id.out[0]?.tail).toBe('')
    expect(new Set(id.out.slice(1).map((r) => r.body)).size).toBe(1)
    expect(id.out.map((r) => r.tailIndex)).toEqual([0, 0, 1])

    const cs = await seq(['Chocolate Cake Recipe', 'chocolate cake recipe', 'CHOCOLATE cake recipe'])
    expect(cs.out[1]).toMatchObject({ reason: 'shared-body', body: 'choc-cake-rec' })
    expect(cs.out[2]?.body).toBe(cs.out[1]?.body)

    const pl = await seq(['Exit Interview Questions', 'Exit Interview Question'])
    expect(pl.out[1]?.stems).toEqual(pl.out[0]?.stems)
    expect(pl.out[1]?.reason).toBe('shared-body')
  })

  it('identical titles after a re-picked sibling share one body (docs/DEVIATIONS.md #118)', async () => {
    const pairs: [string, string][] = [
      ['Storm Warning North Coast', 'Storm Warning South Coast'],
      ['Mathe Klassenarbeit Klasse 7a', 'Mathe Klassenarbeit Klasse 7b'],
    ]
    for (const lengthMode of ['exact', 'max'] as const) {
      for (const [a, b] of pairs) {
        const { out } = await seq([a, ...Array<string>(5).fill(b)], { lengthMode })
        const copies = out.slice(1)
        // the first copy may be body-only; then the later copies refit to one tailed body
        const later = copies[0]?.tail === '' ? copies.slice(1) : copies
        expect(new Set(later.map((r) => r.body)).size, `${lengthMode} ${b}`).toBe(1)
        expect(
          later.every((r) => r.reason === 'shared-body' || r === copies[0]),
          `${lengthMode} ${b}`,
        ).toBe(true)
        expect(new Set(out.map((r) => r.id)).size).toBe(out.length)
      }
    }
    const many = createSlugger().slugMany([
      'Storm Warning North Coast',
      ...Array<string>(4).fill('Storm Warning South Coast'),
    ])
    expect(new Set(many.slice(2).map((r) => r.body)).size).toBe(1)
  })

  it('tail-grown: a taken body-only ID refits with a tail (SPEC 12.2 B)', async () => {
    const { out } = await seq(['Chocolate Cake Recipe', 'Chocolate Cake Recipe'])
    expect(out[0]?.id).toBe('choc-cake-recipe')
    expect(out[1]?.warnings).toContain('tail-grown')
    expect(out[1]?.tail.length).toBe(2)
  })

  it('tier A walks the tail index from 0; tiers A, B and C agree on identical titles', async () => {
    const titles = Array.from({ length: 6 }, () => 'Sommerfest 2026')
    const a = await seq(titles, undefined, existsOnly)
    const b = await seq(titles, undefined, noFind)
    const c = await seq(titles)
    expect(a.out.map((r) => r.storeTier)).toEqual(Array(6).fill('A'))
    expect(a.out.map((r) => r.id)).toEqual(c.out.map((r) => r.id))
    expect(b.out.map((r) => r.id)).toEqual(c.out.map((r) => r.id))
  })

  it('exhausted: tier A after maxScan, with the counting-store hint', async () => {
    let err: unknown
    try {
      await generate('Sommerfest 2026', { store: { exists: () => true } })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ExhaustedError)
    expect((err as ExhaustedError).details.tries).toBe(64)
    expect((err as ExhaustedError).message).toMatch(/countBody/)
  })

  it('exclude: an excluded body-only ID is never returned or asked', async () => {
    const asked: string[] = []
    const r = await generate('Jahresbericht Vertrieb Nord 2026', {
      store: {
        exists: (id) => {
          asked.push(id)
          return false
        },
        countBody: () => 0,
      },
      exclude: ['vertrieb-nord-26'],
    })
    expect(r.id).not.toBe('vertrieb-nord-26')
    expect(asked).not.toContain('vertrieb-nord-26')
  })

  it('reserved: a reserved tailed ID is skipped (max mode)', async () => {
    const base: SluggerConfig = { lengthMode: 'max', separator: '' }
    const first = await seq(['Sommerfest 2026', 'Sommerfest 2026'], base)
    const k0 = first.out[1]
    // the body-only row counts on the body, so the first tailed row starts at index 0
    expect(k0?.tailIndex).toBe(0)
    const reserved = await seq(['Sommerfest 2026', 'Sommerfest 2026'], {
      ...base,
      reserved: { add: [k0?.id as string] },
    })
    expect(reserved.out[1]?.id).not.toBe(k0?.id)
    expect(reserved.out[1]?.body).toBe(k0?.body)
    expect(reserved.out[1]?.tailIndex).toBe(1)
  })

  it('hashed stems compare like plain stems (re-pick works on hashes)', async () => {
    const secret = 'resolve-test-secret-0123'
    const titles = [
      ...group('news-storm-direction'),
      ...group('medical-knee-side'),
      'Team Lunch Friday',
      'Team Lunch Friday',
    ]
    const plain = await seq(titles, { secret })
    const hashed = await seq(titles, { secret, storeStems: 'hashed' })
    expect(hashed.out.map((r) => r.id)).toEqual(plain.out.map((r) => r.id))
    expect(hashed.out[0]?.stems).not.toEqual(plain.out[0]?.stems)
    expect(hashed.m.snapshot()[0]?.stems.every((s) => /^[0-9a-f]{16}$/.test(s))).toBe(true)
  })
})

describe('tail growth (docs/DEVIATIONS.md #22)', () => {
  const T = 'Sommerfest 2026'

  it('tier B, max mode: a full window at length t moves on to t + 1 on the same body', async () => {
    const s = createSlugger({ lengthMode: 'max', length: 24 })
    const base = s.suggest(T, { taken: new Set([s.suggest(T).id]) })
    const store: SlugStore = {
      exists: (id) => id === base.body || (id.startsWith(`${base.body}-`) && id.length === base.body.length + 3),
      countBody: () => 1,
    }
    const r = await s.generate(T, { store })
    expect(r.body).toBe(base.body)
    expect(r.tail.length).toBe(3)
    expect(r.tailIndex).toBe(0) // the body-only row is on the body: start = countBody - 1
    expect(r.warnings).not.toContain('tail-grown')
  })

  it('tier B, exact mode: the body shrinks for the longer tail (tail-grown)', async () => {
    const first = suggest(T)
    const store: SlugStore = {
      exists: (id) => id.startsWith(first.body),
      countBody: (b) => (b === first.body ? 1 : 0),
    }
    const r = await generate(T, { store })
    expect(r.body).not.toBe(first.body)
    expect(r.tail.length).toBeGreaterThan(first.tail.length)
    expect(r.warnings).toContain('tail-grown')
  })

  it('tier B: exhausted only when no longer tail fits; tries count every length', async () => {
    let err: unknown
    try {
      await generate(T, { store: { exists: () => true, countBody: () => 0 } })
    } catch (e) {
      err = e
    }
    expect(isSluggerError(err, 'E_EXHAUSTED')).toBe(true)
    expect((err as ExhaustedError).details.tries).toBeGreaterThan(8)
  })

  it('identical titles never exhaust in tier C (3000 rows, max mode)', async () => {
    const s = createSlugger({ lengthMode: 'max' })
    const m = memoryStore()
    for (let i = 0; i < 3000; i++) await s.createUnique(T, { store: m })
    expect(m.size).toBe(3000)
    expect(new Set(m.snapshot().map((r) => r.id)).size).toBe(3000)
  }, 60_000)
})

describe('createUnique and suggest agree for a free body', () => {
  it('same ID for every corpus title alone', async () => {
    for (const f of fixtures.slice(0, 80)) {
      const r = await createUnique(f.title, { store: memoryStore() })
      expect(r.result.id, f.title).toBe(suggest(f.title).id)
    }
  })
})
