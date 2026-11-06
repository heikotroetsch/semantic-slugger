/**
 * Property tests for the M1 paths (SPEC 19.3, 21 M1): opaque and empty IDs pass I1 to I10.
 * The checks below are written independently of src/core/invariants.ts.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { resolveConfig, type SluggerConfig } from '../src/config.ts'
import { driveSync } from '../src/core/drivers.ts'
import { emptyPath } from '../src/core/empty.ts'
import { foldTail, segmentBlocked, tailBlocked } from '../src/core/safety.ts'
import { BLOCK_HARD } from '../src/data/v1/blocklist.ts'
import { isSluggerError, isValidSlug } from '../src/index.ts'
import { drive } from './helpers/drive.ts'

const driveEmpty = (
  doc: Parameters<typeof emptyPath>[0],
  cfg: Parameters<typeof emptyPath>[1],
  exclude: Parameters<typeof emptyPath>[2],
  store: Parameters<typeof drive>[1],
) => drive(emptyPath(doc, cfg, exclude), store)

const seed = Number(process.env.FC_SEED ?? Date.now() % 2 ** 31)
const numRuns = Number(process.env.FC_RUNS ?? 1000)
console.log(`fast-check seed ${seed} (set FC_SEED to replay), runs ${numRuns}`)

const cfgArb = fc
  .record(
    {
      length: fc.integer({ min: 8, max: 32 }),
      lengthMode: fc.constantFrom('exact', 'max'),
      separator: fc.constantFrom('-', '_', ''),
      leak: fc.constantFrom('normal', 'minimal', 'opaque'),
      tailAlphabet: fc.constantFrom('safe', 'strict'),
      consistentRungs: fc.boolean(),
      maxSegments: fc.integer({ min: 1, max: 5 }),
    },
    { requiredKeys: [] },
  )
  .map((c) => (c.leak === 'opaque' ? { ...c, secret: 'prop-test-secret-0123' } : c) as SluggerConfig)

const canonicalArb = fc.oneof(
  fc.constant(''),
  fc.stringMatching(/^[a-z0-9]{1,12}( [a-z0-9]{1,12}){0,6}$/),
  fc.uint8Array({ minLength: 1, maxLength: 12 }).map((b) => `raw:${Buffer.from(b).toString('hex')}`),
)

function checkId(id: string, body: string, tail: string, cfg: ReturnType<typeof resolveConfig>): void {
  const sep = cfg.separator
  expect(id).toBe(body === '' ? tail : `${body}${sep}${tail}`)
  // I1
  if (cfg.lengthMode === 'exact') expect(id.length).toBe(cfg.length)
  else expect(id.length).toBeLessThanOrEqual(cfg.length)
  // I2
  const p = sep === '' ? /^[a-z][a-z0-9]*$/ : new RegExp(`^[a-z][a-z0-9]*(${sep}[a-z0-9]+)*$`)
  expect(id).toMatch(p)
  // I3, I4
  expect(id[0]).toMatch(/[a-z]/)
  expect(id.split(sep).join('')).not.toMatch(/^[0-9]+$/)
  // I5
  expect(cfg.tailFirst).toContain(tail[0])
  for (const ch of tail) expect(cfg.tailAlphabet).toContain(ch)
  // I6
  const segs = body === '' ? [] : sep === '' ? [body] : body.split(sep)
  for (const s of segs) expect(segmentBlocked(s, cfg)).toBe(false)
  expect(tailBlocked(body, tail, cfg)).toBe(false)
  const x = foldTail(id.split(sep).join(''))
  for (const w of BLOCK_HARD) expect(x.includes(w), w).toBe(false)
  // I7
  expect(cfg.reserved).not.toContain(id)
  // I8
  for (const s of sep === '' ? [body] : segs) expect(s).not.toMatch(/[lio][01]|[01][lio]/)
  // I9
  expect(id).toMatch(/^[\x20-\x7e]+$/)
  // I10
  expect(segs.length).toBeLessThanOrEqual(cfg.maxSegments)
  for (const s of segs) expect(s.length).toBeGreaterThan(0)
}

describe('opaque and empty IDs: I1 to I10', () => {
  it('tier none', () => {
    fc.assert(
      fc.property(cfgArb, canonicalArb, (c, canonical) => {
        const cfg = resolveConfig(c)
        const doc = { canonical, empty: true }
        const { out } = driveSync(emptyPath(doc, cfg, new Set()))
        checkId(out.id, out.body, out.tail, cfg)
        expect(out.reason).toBe(cfg.leak === 'opaque' ? 'opaque' : 'empty')
        expect(isValidSlug(out.id, c)).toBe(true)
        // deterministic, also across new config instances
        expect(driveSync(emptyPath(doc, resolveConfig(c), new Set())).out).toEqual(out)
      }),
      { seed, numRuns },
    )
  })

  it('tier A and B with random taken sets, counts and exclude', () => {
    fc.assert(
      fc.property(
        cfgArb,
        canonicalArb,
        fc.integer({ min: 0, max: 40 }),
        fc.option(fc.integer({ min: 0, max: 2000 })),
        fc.array(fc.integer({ min: 0, max: 60 }), { maxLength: 6 }),
        (c, canonical, takenFirst, count, excludeKs) => {
          const cfg = resolveConfig(c)
          const doc = { canonical, empty: true }
          // take the first `takenFirst` IDs of the tier A walk; a walk that exhausts the small tail space
          // of strict + max mode (tier A limit, SPEC 13.3, 19.4) makes the case invalid, so it is skipped
          const taken = new Set<string>()
          let exclude: Set<string>
          try {
            for (let i = 0; i < takenFirst; i++) {
              const r = driveSync(emptyPath(doc, cfg, new Set()), taken).out
              taken.add(r.id)
            }
            exclude = new Set(
              excludeKs.map((k) => driveSync(emptyPath(doc, cfg, new Set()), taken).out.id + (k % 2 ? '' : 'x')),
            )
          } catch (e) {
            if (isSluggerError(e, 'E_EXHAUSTED')) return
            throw e
          }
          const body = cfg.leak === 'opaque' ? '' : cfg.fallbackWord
          // a consistent counting store has at least one row per taken ID on this body
          const n = count === null ? null : takenFirst + count
          const store = n === null ? { taken } : { taken, counts: new Map([[body, n]]) }
          let res: ReturnType<typeof driveEmpty>
          try {
            res = driveEmpty(doc, cfg, exclude, store)
          } catch (e) {
            // tier A walks at most maxScan indexes from 0: with a small tail space (strict, max mode)
            // many taken IDs can exhaust it, which is the documented tier A limit (SPEC 13.3, 19.4)
            if (n === null && isSluggerError(e, 'E_EXHAUSTED')) return
            throw e
          }
          const { out } = res
          checkId(out.id, out.body, out.tail, cfg)
          expect(taken.has(out.id)).toBe(false)
          expect(exclude.has(out.id)).toBe(false)
          if (n !== null) expect(out.tailIndex).toBeGreaterThanOrEqual(n)
        },
      ),
      { seed, numRuns: Math.max(1, Math.floor(numRuns / 4)) },
    )
  })
})
