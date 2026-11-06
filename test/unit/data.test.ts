import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { LexiconEntry } from '../../src/config.ts'
import { compile } from '../../src/core/compile.ts'
import { normalizeListEntry } from '../../src/core/normalize.ts'
import { fold, hasLookalikePair } from '../../src/core/safety.ts'
import { BLOCK_HARD, BLOCK_SHORT_DE, BLOCK_SOFT } from '../../src/data/v1/blocklist.ts'
import { CONFLICT_DE, CONFLICT_EN } from '../../src/data/v1/conflict.ts'
import { V1_DATA_DIGEST } from '../../src/data/v1/digest.ts'
import { DOCKIND_DE, DOCKIND_EN } from '../../src/data/v1/dockind.ts'
import { LEXICON_DE } from '../../src/data/v1/lexicon-de.ts'
import { LEXICON_EN } from '../../src/data/v1/lexicon-en.ts'
import { LEXICON_SHARED } from '../../src/data/v1/lexicon-shared.ts'
import {
  MARKER_HASH_PREFIX,
  MARKER_PARAGRAPH_PREFIX,
  MARKERS_DE,
  MARKERS_EN,
  MARKERS_SHARED,
} from '../../src/data/v1/markers.ts'
import { NOISE_DE, NOISE_EN, NOISE_SHARED } from '../../src/data/v1/noise.ts'
import { NUMBER_WORDS_DE, NUMBER_WORDS_EN } from '../../src/data/v1/number-words.ts'
import { PARTS_DE, PARTS_SHARED } from '../../src/data/v1/parts-de.ts'
import { computeV1Digest } from '../../src/data/v1/profile.ts'
import { QUALIFIERS } from '../../src/data/v1/qualifiers.ts'
import { STOP_DE } from '../../src/data/v1/stop-de.ts'
import { STOP_EN } from '../../src/data/v1/stop-en.ts'
import { UNITS } from '../../src/data/v1/units.ts'
import { FILLER_DE, FILLER_EN, WEAK_DE, WEAK_EN, WEAK_NO_SHOW, WEAK_SHARED } from '../../src/data/v1/weak.ts'
import { dePack } from '../../src/lang/de.ts'
import { enPack } from '../../src/lang/en.ts'
import { validatePack } from '../../src/lang/pack.ts'
import { cfgOf } from '../helpers/front.ts'

const ENTRIES: readonly LexiconEntry[] = [
  ...LEXICON_DE,
  ...LEXICON_EN,
  ...LEXICON_SHARED,
  ...QUALIFIERS,
  ...WEAK_DE,
  ...WEAK_EN,
  ...WEAK_SHARED,
  ...DOCKIND_DE,
  ...DOCKIND_EN,
]
const PART_KEYS = [...PARTS_DE, ...PARTS_SHARED]
const LIST_WORDS = [...BLOCK_HARD, ...BLOCK_SOFT, ...BLOCK_SHORT_DE]

/** B1: the folded rung is no list word. B2: it does not start with a 3-char list word and holds no 4+ word. */
function b1b2(rung: string): string | null {
  const f = fold(rung)
  if (LIST_WORDS.includes(f)) return 'B1'
  for (const w of LIST_WORDS) {
    if (w.length === 3 && f.startsWith(w)) return 'B2'
    if (w.length >= 4 && f.includes(w)) return 'B2'
  }
  return null
}

describe('v1 lexicon data (SPEC 15)', () => {
  it('no two built-in entries share a key (15.3 to 15.7)', () => {
    const keys = [...ENTRIES.map((e) => e.key), ...PART_KEYS]
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dup).toEqual([])
  })

  it('every built-in entry has an explicit lang (6.1)', () => {
    for (const e of ENTRIES) expect(['de', 'en', '*'], e.key).toContain(e.lang)
  })

  it('every key, form, phrase and abbr is normalized ascii', () => {
    for (const e of ENTRIES) {
      for (const w of [e.key, ...(e.forms ?? []), ...(e.phrase ?? [])]) {
        expect(normalizeListEntry(w), w).toBe(w)
        expect(w, w).toMatch(/^[a-z0-9]+(?: [a-z0-9]+)*$/)
      }
      for (const a of e.abbr ?? []) expect(a, a).toMatch(/^[a-z0-9]+$/)
      for (const k of e.known ?? []) expect(e.abbr, `${e.key}: known ${k}`).toContain(k)
    }
  })

  it('filler words (docs/DEVIATIONS.md, quality round 1): weak, no shared key, never shown', () => {
    const fillers = [...FILLER_EN, ...FILLER_DE]
    const keys = [...ENTRIES.map((e) => e.key), ...PART_KEYS, ...fillers.map((e) => e.key)]
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
    for (const e of fillers) {
      expect(e.weak, e.key).toBe(true)
      expect(e.cls, e.key).toBe('topic')
      for (const w of [e.key, ...(e.forms ?? [])]) {
        expect(w, w).toMatch(/^[a-z]+$/)
        expect(WEAK_NO_SHOW.has(w), w).toBe(true)
      }
    }
  })

  it('has about 250 entries plus 239 parts (15.2, 15.7)', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(220)
    expect(ENTRIES.length).toBeLessThanOrEqual(280)
    expect(PART_KEYS.length).toBe(239)
  })

  it('the known abbreviation list equals the known fields (15.2)', () => {
    const list =
      'admin agm ai allhands api apac app arch at auth ch config crm dach db de dept dev docs doku emea eng env erp eu faq fin gov hr hw infra info intl intro it kickoff ki kita kpi lab latam mail mgmt ml mktg mtg oss ops org perf poc pr prod qa retro roi sec seo spec stats sw tech ui uk uni us ux wip'.split(
        ' ',
      )
    const fields = new Set(ENTRIES.flatMap((e) => e.known ?? []))
    expect([...fields].sort()).toEqual([...list].sort())
    for (const j of ['abt', 'br', 'gf', 'jhv', 'ma', 'mv', 'va']) expect(fields.has(j), j).toBe(false)
  })

  it('every abbr passes B1, B2 and I8 (15.2 rule 5)', () => {
    const bad: string[] = []
    for (const e of ENTRIES)
      for (const a of e.abbr ?? []) {
        const r = b1b2(a)
        if (r !== null || hasLookalikePair(a)) bad.push(`${e.key}:${a}:${r ?? 'I8'}`)
      }
    expect(bad).toEqual([])
  })

  it('every part passes the part rules (15.7)', () => {
    const enStop = new Set(STOP_EN)
    const enForms = new Set(ENTRIES.filter((e) => e.lang === 'en').flatMap((e) => [e.key, ...(e.forms ?? [])]))
    for (const p of PART_KEYS) {
      expect(LIST_WORDS.includes(fold(p)), p).toBe(false)
      expect(hasLookalikePair(p), p).toBe(false)
    }
    for (const p of PARTS_DE) {
      if (p.length < 6) continue
      expect(enStop.has(p), p).toBe(false)
      expect(enForms.has(p), p).toBe(false)
    }
  })

  it('every unit short form and marker prefix passes B1, B2 and I8', () => {
    const prefixes = [...MARKERS_DE, ...MARKERS_EN, ...MARKERS_SHARED].map((m) => m.prefix)
    for (const x of [...UNITS.map((r) => r[0] as string), ...prefixes, MARKER_PARAGRAPH_PREFIX, MARKER_HASH_PREFIX]) {
      expect(b1b2(x), x).toBeNull()
      expect(hasLookalikePair(x), x).toBe(false)
    }
    for (const p of prefixes) expect(p, p).toMatch(/^[a-z]{0,5}[a-hj-km-np-z]$/)
  })

  it('weak words are weak topics, doc-kind words have weight -60 (15.6)', () => {
    for (const e of [...WEAK_DE, ...WEAK_EN, ...WEAK_SHARED])
      expect(e, e.key).toMatchObject({ cls: 'topic', weak: true })
    for (const e of [...DOCKIND_DE, ...DOCKIND_EN]) {
      expect(e, e.key).toMatchObject({ cls: 'topic', weight: -60 })
      expect(e.weak, e.key).toBeUndefined()
    }
  })

  it('weak and doc-kind pairs: the pair exists, has the other language and the same kind (15.6)', () => {
    const exceptions: Record<string, string> = {
      item: 'German titles use Punkt, which is too broad to be weak',
      ultimate: 'no common German title word',
      ratgeber: 'a second German word for guide',
      miscellaneous: 'three words on each side for one meaning; misc pairs with sonstiges',
      various: 'three words on each side for one meaning',
      sonstige: 'three words on each side for one meaning',
      diverses: 'three words on each side for one meaning',
      aktualisierung: 'its English counterpart update is a shared (*) entry',
      'work in progress': 'no common German title phrase',
    }
    const weakish = [...WEAK_DE, ...WEAK_EN, ...DOCKIND_DE, ...DOCKIND_EN, ...LEXICON_DE, ...LEXICON_EN].filter(
      (e) => e.weak === true || e.weight === -60,
    )
    const kind = (e: LexiconEntry) => (e.weak === true ? 'weak' : 'doc')
    const byKey = new Map(weakish.map((e) => [e.key, e]))
    for (const e of weakish) {
      if (e.lang === '*') continue
      if (e.pair === undefined) {
        expect(exceptions[e.key], `${e.key} has no pair and no exception`).toBeDefined()
        continue
      }
      const p = byKey.get(e.pair)
      expect(p, `${e.key} -> ${e.pair}`).toBeDefined()
      expect(p?.lang, `${e.key} -> ${e.pair}`).toBe(e.lang === 'de' ? 'en' : 'de')
      expect(kind(p as LexiconEntry), `${e.key} -> ${e.pair}`).toBe(kind(e))
    }
    for (const k of Object.keys(exceptions)) expect(byKey.get(k)?.pair, k).toBeUndefined()
  })

  it('retrospective entries share the group retro', () => {
    const g = ENTRIES.filter((e) => e.key.startsWith('retrospe')).map((e) => e.group)
    expect(g).toEqual(['retro', 'retro'])
  })

  it('stem clashes in the v1 data are on the allowed list (4.4 step 3)', () => {
    for (const e of STEM_CLASH_FIXTURE) expect(e.reason.length, e.clash).toBeGreaterThan(20)
    const allowed = new Set<string>(ALLOWED_STEM_CLASHES)
    const clashes = compile(cfgOf()).lexicon.stemClashes()
    expect(clashes.filter((c) => !allowed.has(c))).toEqual([])
  })
})

/**
 * Reviewed stem clashes, each with a reason (SPEC 4.4 step 3). The stem match picks the word the
 * token starts with, then the longest common prefix, then data order (DEVIATIONS).
 */
const STEM_CLASH_FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/stem-clashes.json', import.meta.url), 'utf8'),
) as { clash: string; reason: string }[]
const ALLOWED_STEM_CLASHES: readonly string[] = STEM_CLASH_FIXTURE.map((e) => e.clash)

describe('v1 stop word data (SPEC 6.3)', () => {
  it('each conflict word is in the function list of each language it is listed for', () => {
    for (const w of CONFLICT_DE) expect(STOP_DE, w).toContain(w)
    for (const w of CONFLICT_EN) expect(STOP_EN, w).toContain(w)
    expect(CONFLICT_DE).toEqual(expect.arrayContaining(['die', 'war', 'hat', 'bin', 'man', 'fast', 'pro']))
    for (const w of ['die', 'war', 'hat', 'bin', 'man', 'fast', 'pro']) expect(STOP_EN, w).not.toContain(w)
    for (const w of ['an', 'also', 'so', 'will']) expect(CONFLICT_EN).toContain(w)
  })

  it('lists are unique, normalized and sorted where the spec lists them sorted', () => {
    for (const list of [STOP_DE, STOP_EN, NOISE_DE, NOISE_EN, NOISE_SHARED]) {
      expect(new Set(list).size).toBe(list.length)
      for (const w of list) expect(normalizeListEntry(w)).toBe(w)
    }
  })

  it('number words: 12 rows, `ein`/`eine` are function words, not number words', () => {
    expect(NUMBER_WORDS_DE.length).toBe(12)
    expect(NUMBER_WORDS_EN.length).toBe(12)
    expect(NUMBER_WORDS_DE.flat()).not.toContain('ein')
    expect(NUMBER_WORDS_DE[0]).toEqual(['eins', 'erste', 'erster', 'erstes', 'ersten', 'erstem'])
    expect(STOP_DE).toContain('ein')
  })
})

describe('built-in packs (SPEC 6.7)', () => {
  it('pass the pack validator (the built-in code check aside)', () => {
    for (const p of [dePack(), enPack()]) expect(() => validatePack(p, p.code, [])).not.toThrow()
  })

  it('fill the language fields', () => {
    for (const p of [dePack(), enPack()]) {
      expect(p.months?.length).toBe(12)
      expect(p.weekdays?.length).toBe(7)
      expect(p.numberWords?.length).toBe(12)
      expect(p.versionWords?.length).toBeGreaterThan(0)
      expect(p.markers?.length).toBeGreaterThan(0)
      expect(p.hints?.suffixes?.length).toBeGreaterThan(0)
      expect(p.attr).toBeDefined()
    }
    expect(dePack().compound?.linkers).toEqual(['', 's', 'es', 'n', 'en', 'er', 'e', 'ens'])
    expect(dePack().nounsCapitalized).toBe(true)
    expect(enPack().nounsCapitalized).toBe(false)
    expect(dePack().weekPrefix).toBe('kw')
    expect(enPack().weekPrefix).toBe('wk')
  })
})

describe('data digest (SPEC 14.2 item 4)', () => {
  it('V1_DATA_DIGEST matches the v1 data (run `pnpm digest` after an intended change)', () => {
    expect(computeV1Digest()).toBe(V1_DATA_DIGEST)
  })

  it('is 16 hex chars', () => {
    expect(V1_DATA_DIGEST).toMatch(/^[0-9a-f]{16}$/)
  })
})
