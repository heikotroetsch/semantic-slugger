import { describe, expect, it } from 'vitest'
import { resolveConfig, type SluggerConfig } from '../../src/config.ts'
import { driveSync } from '../../src/core/drivers.ts'
import { emptyPath, emptyTailLength, renderEmpty } from '../../src/core/empty.ts'
import { invariantFailure } from '../../src/core/invariants.ts'
import { ExhaustedError, InputError, isSluggerError } from '../../src/index.ts'
import { drive } from '../helpers/drive.ts'

const secret = 'empty-test-secret-001'
const none = new Set<string>()
const emptyDoc = { canonical: '', empty: true }
const run = (cfg: SluggerConfig, doc = emptyDoc, taken?: ReadonlySet<string>) => {
  const c = resolveConfig(cfg)
  return { c, ...driveSync(emptyPath(doc, c, none), taken) }
}

describe('empty title (fallback)', () => {
  it('exact: doc + tail of L - 3 - 1', () => {
    const { out, c, tier } = run({})
    expect(tier).toBe('none')
    expect(out.id).toHaveLength(16)
    expect(out.body).toBe('doc')
    expect(out.tail).toHaveLength(12)
    expect(out.id).toBe(`doc-${out.tail}`)
    expect(out.reason).toBe('empty')
    expect(out.tailIndex).toBe(0)
    expect(out.segments).toEqual([
      { text: 'doc', kind: 'fallback', verbatim: false },
      { text: out.tail, kind: 'tail', verbatim: false },
    ])
    expect(invariantFailure(out.id, out.body, out.tail, c)).toBeNull()
  })

  it('exact with other lengths, separators and fallback words', () => {
    expect(run({ length: 8 }).out.id).toMatch(/^doc-[a-z0-9]{4}$/)
    expect(run({ separator: '' }).out.id).toMatch(/^doc[a-z0-9]{13}$/)
    expect(run({ separator: '_', length: 24 }).out.id).toMatch(/^doc_[a-z0-9]{20}$/)
    expect(run({ fallbackWord: 'item' }).out.id).toMatch(/^item-[a-z0-9]{11}$/)
  })

  it('max: doc + tailMin chars', () => {
    expect(run({ lengthMode: 'max' }).out.id).toMatch(/^doc-[a-z0-9]{2}$/)
    expect(run({ lengthMode: 'max', tailMin: 5 }).out.id).toMatch(/^doc-[a-z0-9]{5}$/)
  })

  it('max with counts: the tail grows with the load rule, capped by the length', () => {
    const c = resolveConfig({ lengthMode: 'max' })
    expect(emptyTailLength(c, 0)).toBe(2)
    expect(emptyTailLength(c, 35)).toBe(3)
    expect(emptyTailLength(c, 980)).toBe(4)
    expect(emptyTailLength(resolveConfig({ lengthMode: 'max', length: 8 }), 1e12)).toBe(4)
  })

  it('onEmpty throw gives InputError, but not for opaque', () => {
    expect(() => run({ onEmpty: 'throw' })).toThrow(InputError)
    expect(run({ onEmpty: 'throw', leak: 'opaque', secret }).out.reason).toBe('opaque')
    // a non-empty doc without candidates still takes the fallback
    expect(run({ onEmpty: 'throw' }, { canonical: 'x', empty: false }).out.body).toBe('doc')
  })

  it('the tail depends on the canonical title and the secret', () => {
    const a = run({}, { canonical: 'raw:e4b8ad', empty: true }).out.id
    const b = run({}, { canonical: 'raw:e69687', empty: true }).out.id
    const c = run({ secret }, { canonical: 'raw:e4b8ad', empty: true }).out.id
    expect(new Set([a, b, c, run({}).out.id]).size).toBe(4)
    expect(run({}, { canonical: 'raw:e4b8ad', empty: true }).out.id).toBe(a)
  })
})

describe('opaque', () => {
  it('tail only, length L, in exact and max mode', () => {
    for (const cfg of [
      { leak: 'opaque', secret },
      { leak: 'opaque', secret, lengthMode: 'max' },
      { leak: 'opaque', secret, separator: '' },
      { leak: 'opaque', secret, length: 8, tailAlphabet: 'strict' },
    ] as SluggerConfig[]) {
      const { out, c } = run(cfg, { canonical: 'rahmenvertrag strom', empty: false })
      expect(out.id).toHaveLength(c.length)
      expect(out.body).toBe('')
      expect(out.tail).toBe(out.id)
      expect(out.reason).toBe('opaque')
      expect(c.tailFirst).toContain(out.id[0])
      expect(out.segments).toEqual([{ text: out.id, kind: 'tail', verbatim: false }])
      expect(invariantFailure(out.id, '', out.tail, c)).toBeNull()
    }
  })

  it('different titles give different IDs; the same title gives the same ID', () => {
    const cfg = { leak: 'opaque', secret } as const
    const a = run(cfg, { canonical: 'rahmenvertrag strom nord', empty: false }).out.id
    const b = run(cfg, { canonical: 'rahmenvertrag strom sued', empty: false }).out.id
    expect(a).not.toBe(b)
    expect(run(cfg, { canonical: 'rahmenvertrag strom nord', empty: false }).out.id).toBe(a)
  })
})

describe('tiers and collisions', () => {
  const c = resolveConfig({ lengthMode: 'max' })

  it('tier A (taken set): walks from k = 0', () => {
    const k0 = renderEmpty(emptyDoc, c, 0, 2)
    const k1 = renderEmpty(emptyDoc, c, 1, 2)
    const r = driveSync(emptyPath(emptyDoc, c, none), new Set([k0]))
    expect(r.tier).toBe('A')
    expect(r.out.id).toBe(k1)
    expect(r.out.tailIndex).toBe(1)
    // taken as a function
    expect(driveSync(emptyPath(emptyDoc, c, none), (id) => id === k0).out.id).toBe(k1)
  })

  it('tier B (counts): starts at k = countBody(body) and uses maxAttempts', () => {
    const { out, reqs } = drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', 5]]) })
    expect(out.tailIndex).toBe(5)
    expect(out.id).toBe(renderEmpty(emptyDoc, c, 5, 2))
    expect(reqs[0]).toEqual({ op: 'countBodies', bodies: ['doc'] })
    expect(reqs[1]?.op).toBe('exists')
  })

  it('tier B for opaque counts the body ""', () => {
    const o = resolveConfig({ leak: 'opaque', secret })
    const { out, reqs } = drive(emptyPath({ canonical: 'x', empty: false }, o, none), { counts: new Map([['', 3]]) })
    expect(reqs[0]).toEqual({ op: 'countBodies', bodies: [''] })
    expect(out.tailIndex).toBe(3)
  })

  it('tier A and tier B reach the same ID for identical titles', () => {
    const taken = new Set<string>()
    for (let n = 0; n < 20; n++) {
      const a = driveSync(emptyPath(emptyDoc, c, none), taken).out
      const b = drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', n]]), taken }).out
      expect(b.id).toBe(a.id)
      taken.add(a.id)
    }
    expect(taken.size).toBe(20)
  })

  it('exclude skips IDs without asking the store', () => {
    const k0 = renderEmpty(emptyDoc, c, 0, 2)
    const r = drive(emptyPath(emptyDoc, c, new Set([k0])), {})
    expect(r.out.tailIndex).toBe(1)
    const asked = r.reqs.filter((q) => q.op === 'exists').flatMap((q) => (q.op === 'exists' ? q.ids : []))
    expect(asked).not.toContain(k0)
  })

  it('asks exists in batches of 8', () => {
    const taken = new Set(Array.from({ length: 10 }, (_, k) => renderEmpty(emptyDoc, c, k, 2)))
    const r = drive(emptyPath(emptyDoc, c, none), { taken })
    const batches = r.reqs.filter((q) => q.op === 'exists')
    expect(batches).toHaveLength(2)
    expect(batches[0]?.op === 'exists' && batches[0].ids.length).toBe(8)
    expect(r.out.tailIndex).toBe(10)
  })

  it('tier A exhausts after maxScan; tier B tries maxAttempts per tail length up to the room left', () => {
    const all = { has: () => true } as unknown as ReadonlySet<string>
    try {
      driveSync(emptyPath(emptyDoc, c, none), all)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ExhaustedError)
      expect(isSluggerError(e, 'E_EXHAUSTED')).toBe(true)
      expect((e as ExhaustedError).details).toEqual({ body: 'doc', tailIndex: 0, tries: 64 })
    }
    try {
      drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', 7]]), taken: all })
      expect.unreachable()
    } catch (e) {
      // t = 2..12 (16 - 'doc' - '-'), 8 indexes each
      expect((e as ExhaustedError).details).toEqual({ body: 'doc', tailIndex: 7, tries: 88 })
    }
    // exact mode has one tail length only
    try {
      drive(emptyPath(emptyDoc, resolveConfig({}), none), { counts: new Map([['doc', 7]]), taken: all })
      expect.unreachable()
    } catch (e) {
      expect((e as ExhaustedError).details).toEqual({ body: 'doc', tailIndex: 7, tries: 8 })
    }
  })

  it('tier B: a full window at length t moves on to length t + 1, from k = n again', () => {
    const n = 40 // tailNeed(40) = 3
    const window = new Set(Array.from({ length: 8 }, (_, i) => renderEmpty(emptyDoc, c, n + i, 3)))
    const r = drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', n]]), taken: window })
    expect(r.out.tailIndex).toBe(n)
    expect(r.out.tail).toHaveLength(4)
    expect(r.out.id).toBe(renderEmpty(emptyDoc, c, n, 4))
    // deterministic for the same store state
    expect(drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', n]]), taken: window }).out.id).toBe(r.out.id)
  })

  it('tier B, max mode: 3000 identical titles never exhaust (regression, tail lag)', () => {
    const taken = new Set<string>()
    for (let n = 0; n < 3000; n++) {
      const { out } = drive(emptyPath(emptyDoc, c, none), { counts: new Map([['doc', n]]), taken })
      expect(taken.has(out.id)).toBe(false)
      taken.add(out.id)
    }
    expect(taken.size).toBe(3000)
  })

  it('skips reserved IDs', () => {
    const k0 = renderEmpty(emptyDoc, c, 0, 2)
    const withReserved = resolveConfig({ lengthMode: 'max', reserved: { add: [k0.replace('-', '')] } })
    expect(renderEmpty(emptyDoc, withReserved, 0, 2)).toBe(k0) // reserved entries have no separator
    const sepless = resolveConfig({ lengthMode: 'max', separator: '' })
    const id0 = renderEmpty(emptyDoc, sepless, 0, 2)
    const blockedCfg = resolveConfig({ lengthMode: 'max', separator: '', reserved: { add: [id0] } })
    expect(renderEmpty(emptyDoc, blockedCfg, 0, 2)).toBe('')
    expect(driveSync(emptyPath(emptyDoc, blockedCfg, none)).out.tailIndex).toBe(1)
  })
})
