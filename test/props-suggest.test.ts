/**
 * Property tests for the full sync pipeline (SPEC 19.3 items 1, 2, 4, 5, 6 (taken), 7): suggest() over
 * random titles and configs. assertInvariants runs inside every call; the checks here are independent.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { BLOCK_HARD, BLOCK_SHORT_DE, TAIL_BLOCK_EXTRA } from '../src/data/v1/blocklist.ts'
import { createSlugger, isSluggerError, isValidSlug, type SluggerConfig } from '../src/index.ts'
import { cfgArb, lexiconWords, title } from './helpers/arb.ts'

const seed = Number(process.env.FC_SEED ?? Date.now() % 2 ** 31)
const numRuns = Math.max(1, Number(process.env.FC_RUNS ?? 1000))
console.log(`fast-check seed ${seed} (set FC_SEED to replay), runs ${numRuns}`)

const STRICT_4 = [...BLOCK_SHORT_DE, ...TAIL_BLOCK_EXTRA].filter((w) => w.length >= 4)

function check(id: string, body: string, tail: string, config: SluggerConfig): void {
  const s = createSlugger(config)
  const cfg = s.config
  const sep = cfg.separator
  expect(id).toBe(body === '' ? tail : tail === '' ? body : `${body}${sep}${tail}`)
  if (cfg.lengthMode === 'exact') expect(id.length).toBe(cfg.length)
  else expect(id.length).toBeLessThanOrEqual(cfg.length)
  expect(id).toMatch(s.pattern)
  expect(id.split(sep || '\u0000').join('')).not.toMatch(/^[0-9]+$/)
  if (tail !== '') {
    expect(cfg.tailFirst).toContain(tail[0])
    for (const ch of tail) expect(cfg.tailAlphabet).toContain(ch)
  }
  const fold = (x: string) =>
    x.replace(/[4310578]/g, (d) => ({ 4: 'a', 3: 'e', 1: 'i', 0: 'o', 5: 's', 7: 't', 8: 'b' })[d] as string)
  const joined = fold(id.split(sep || '\u0000').join(''))
  for (const w of BLOCK_HARD) expect(joined.includes(w), w).toBe(false)
  // B3: non-soft list words of 4+ chars (iabb = 1488, nsdap, stfu) never occur in the joined body
  const joinedBody = fold(body.split(sep || '\u0000').join(''))
  for (const w of STRICT_4) expect(joinedBody.includes(w), w).toBe(false)
  expect(cfg.reserved).not.toContain(id)
  const segs = body === '' ? [] : sep === '' ? [body] : body.split(sep)
  for (const g of segs) expect(g).not.toMatch(/[lio][01]|[01][lio]/)
  expect(segs.length).toBeLessThanOrEqual(cfg.maxSegments)
  expect(isValidSlug(id, config)).toBe(true)
}

describe('suggest(): properties', () => {
  it('I1 to I10 hold, never throws, deterministic across instances', () => {
    fc.assert(
      fc.property(cfgArb, title, (config, t) => {
        const r = createSlugger(config).suggest(t)
        check(r.id, r.body, r.tail, config)
        expect(createSlugger(config).suggest(t)).toEqual(r)
      }),
      { seed, numRuns },
    )
  }, 120_000)

  // SPEC 19.3 item 4 also asks for slug(t) === slug(t.toUpperCase()); the case rules of rev 3.1 (upperOnly,
  // lowerOnly, acronyms, sentence-case names, capitalized months) make that false by design, so only the
  // spacing part is a property (docs/DEVIATIONS.md, M4).
  it('normalization: extra spaces give the same ID', () => {
    const ascii = fc.array(fc.constantFrom(...lexiconWords.filter((w) => /^[a-z ]+$/.test(w)), '2026', 'q3'), {
      minLength: 1,
      maxLength: 6,
    })
    fc.assert(
      fc.property(ascii, (ws) => {
        const s = createSlugger()
        const t = ws.join(' ')
        const a = s.slug(t)
        expect(s.slug(`  ${t.replace(/ /g, '   ')}`)).toBe(a)
      }),
      { seed, numRuns },
    )
  })

  it('taken is respected (tier A)', () => {
    fc.assert(
      fc.property(title, fc.integer({ min: 1, max: 6 }), (t, n) => {
        const s = createSlugger()
        const taken = new Set<string>()
        for (let i = 0; i < n; i++) {
          let r: ReturnType<typeof s.suggest>
          try {
            r = s.suggest(t, { taken })
          } catch (e) {
            if (isSluggerError(e, 'E_EXHAUSTED')) return
            throw e
          }
          expect(taken.has(r.id)).toBe(false)
          taken.add(r.id)
        }
        expect(taken.size).toBe(n)
      }),
      { seed, numRuns },
    )
  })
})
