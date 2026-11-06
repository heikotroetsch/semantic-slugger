import { describe, expect, it } from 'vitest'
import type { SluggerConfig } from '../../src/config.ts'
import { compile } from '../../src/core/compile.ts'
import { buildLadder, cuts, graphemes, type Laddered, phonologyOf, skeleton } from '../../src/core/ladder.ts'
import { rankPool } from '../../src/core/resolve.ts'
import { hasLookalikePair, rungBlocked, segmentBlocked } from '../../src/core/safety.ts'
import { CODAS_DE, ONSETS_DE } from '../../src/data/v1/phonology.ts'
import { analyze, createSlugger } from '../../src/index.ts'
import { doc } from '../helpers/concepts.ts'
import { cfgOf } from '../helpers/front.ts'

/** All concepts of a title with their ladders (priors only). */
function ladders(title: string, config?: SluggerConfig): Laddered[] {
  const cfg = cfgOf(config)
  return rankPool(doc(title, config), null, cfg, compile(cfg)).ladders
}

function ladderOf(title: string, key: string, config?: SluggerConfig): Laddered {
  const c = ladders(title, config).find((x) => x.key === key || x.display === key)
  if (c === undefined) throw new Error(`no concept ${key} in ${title}`)
  return c
}

const show = (c: Laddered): string[] => c.ladder.map((r) => `${r.text}(${r.cost}${r.plain ? '' : '*'})`)
const texts = (c: Laddered): string[] => c.ladder.map((r) => r.text)

const en = phonologyOf(undefined)
const de = phonologyOf({ codas: CODAS_DE, onsets: ONSETS_DE })
const cutTexts = (ascii: string, ph = en, bounds: number[] = []) =>
  cuts({ ascii, phonology: ph, boundaries: new Set(bounds), lexForm: () => false }).map((c) => `${c.text}:${c.kind}`)

describe('graphemes (SPEC 11.2)', () => {
  it('greedy, longest unit first', () => {
    expect(graphemes('schreibtisch').map((g) => g.text)).toEqual(['sch', 'r', 'ei', 'b', 't', 'i', 'sch'])
    expect(graphemes('quelle').map((g) => g.text)).toEqual(['qu', 'e', 'll', 'e'])
    expect(graphemes('vertrieb').map((g) => g.text)).toEqual(['v', 'e', 'r', 't', 'r', 'ie', 'b'])
    expect(graphemes('baeume').map((g) => `${g.text}${g.vowel ? '+' : ''}`)).toEqual(['b', 'aeu+', 'm', 'e+'])
  })
})

describe('cuts (SPEC 11.3)', () => {
  it('coda and syllable cuts of the section 12 examples', () => {
    expect(cutTexts('vertrieb', de)).toEqual(['ver:syll', 'vert:syll'])
    expect(cutTexts('chocolate')).toEqual(['choc:coda', 'chocol:coda'])
    expect(cutTexts('recipe')).toEqual(['rec:coda'])
    expect(cutTexts('marketing')).toEqual(['mar:syll', 'mark:coda', 'market:coda'])
    expect(cutTexts('budget')).toEqual(['bud:syll'])
    expect(cutTexts('review')).toEqual(['rev:coda'])
    expect(cutTexts('release')).toEqual(['rel:coda'])
  })

  it('never ends on a vowel, unless the prefix is a lexicon form', () => {
    for (const w of ['kalender', 'banane', 'organisation', 'radio'])
      for (const c of cutTexts(w, de)) expect(c.split(':')[0]).not.toMatch(/[aeiouy]$/)
    const withLex = cuts({ ascii: 'radioaktiv', phonology: de, boundaries: new Set(), lexForm: (p) => p === 'radio' })
    expect(withLex.map((c) => c.text)).toContain('radio')
  })

  it('a cut is at least 2 chars shorter than the word and 3 to 7 chars long', () => {
    expect(cutTexts('mitte', de)).toEqual([])
    for (const w of ['international', 'organisation', 'abc', 'zeitung'])
      for (const c of cutTexts(w, de)) {
        const t = c.split(':')[0] as string
        expect(t.length).toBeGreaterThanOrEqual(3)
        expect(t.length).toBeLessThanOrEqual(7)
        expect(t.length).toBeLessThanOrEqual(w.length - 2)
      }
  })

  it('a prefix at a part boundary is a morph cut', () => {
    expect(cutTexts('apfelkuchen', de, [5])).toContain('apfel:morph')
  })

  it('M4 codas: German -dt and -h clusters (docs/DEVIATIONS.md)', () => {
    expect(cutTexts('stadtgeschichte', de)).toContain('stadt:syll')
    expect(cutTexts('wohnung', de)).toContain('wohn:coda')
  })
})

describe('skeleton (SPEC 11.4)', () => {
  it('matches the spec examples', () => {
    expect(skeleton('kalender')).toBe('kldr')
    expect(skeleton('vertrieb')).toBe('vtb')
    expect(skeleton('zeitung')).toBe('ztg')
    expect(skeleton('vertrag')).toBe('vtg')
    expect(skeleton('kurz')).toBeNull()
  })
})

describe('ladders (SPEC 11.1, 12.2)', () => {
  it('Jahresbericht Vertrieb Nord 2026', () => {
    const t = 'Jahresbericht Vertrieb Nord 2026'
    expect(show(ladderOf(t, 'vertrieb'))).toEqual(['vertrieb(40)', 'ver(110*)', 'vert(110*)', 'vtb(800*)'])
    expect(show(ladderOf(t, 'nord'))).toEqual(['nord(0)'])
    expect(show(ladderOf(t, 'y2026'))).toEqual(['26(0)', '2026(30)'])
  })

  it('Q3 2026 Marketing Budget Review: known abbr first, then the full word and cuts', () => {
    const t = 'Q3 2026 Marketing Budget Review'
    expect(show(ladderOf(t, 'marketing'))).toEqual(['mktg(0)', 'marketing(40)', 'mark(90*)', 'market(90*)'])
    expect(show(ladderOf(t, 'budget'))).toEqual(['budget(0)', 'bud(110*)'])
    expect(show(ladderOf(t, 'review'))).toEqual(['review(0)', 'rev(90*)'])
    expect(show(ladderOf(t, 'q3'))).toEqual(['q3(0)'])
  })

  it('Chocolate Cake Recipe', () => {
    const t = 'Chocolate Cake Recipe'
    expect(show(ladderOf(t, 'chocolate'))).toEqual(['chocolate(40)', 'choc(90*)', 'chocol(90*)', 'chct(800*)'])
    expect(show(ladderOf(t, 'cake'))).toEqual(['cake(0)'])
  })

  it('lexicon abbr cost is 15 per index; unknown abbr is cryptic', () => {
    const cfg: SluggerConfig = { lexicon: [{ key: 'strategie', lang: 'de', cls: 'topic', abbr: ['strat', 'stg'] }] }
    const c = ladderOf('Strategie Workshop', 'strategie', cfg)
    expect(c.ladder.find((r) => r.text === 'strat')).toMatchObject({ cost: 0, plain: false, kind: 'lexicon' })
    expect(c.ladder.find((r) => r.text === 'stg')).toMatchObject({ cost: 15, plain: false })
  })

  it('compounds: morph and head rungs are cryptic; joined known abbr is plain', () => {
    const c = ladderOf('Sommerfest 2026', 'sommerfest')
    // a head of less than 6 chars gives no head rung (docs/DEVIATIONS.md, quality round 2)
    expect(show(c)).toEqual(['sommerfest(40)', 'sommer(60*)', 'sommerf(90*)', 'smft(800*)'])
    // the head rung costs more than the morph rung (docs/DEVIATIONS.md, quality round 1)
    const w = ladderOf('Edelstahl-Wasserkocher', ladders('Edelstahl-Wasserkocher')[0]?.key ?? '')
    expect(w.ladder.find((r) => r.kind === 'head')).toMatchObject({ text: 'wasserkocher', cost: 80, plain: false })
    const k = ladderOf('Kindertagesstättenfest 2026', ladders('Kindertagesstättenfest 2026')[0]?.key ?? '')
    expect(k.ladder[0]).toMatchObject({ text: 'kitafest', kind: 'joined', cost: 0, plain: true })
  })

  it('quality round 3: typed compound, generic head, phrase short form, `#` outside German', () => {
    // a dropped weak head keeps the typed word as a rung
    expect(texts(ladders('Impfplan für Kinder')[0] as Laddered)).toContain('impfplan')
    // a generic everyday head (`vertrag`) gives no head rung; a specific one does
    const av = ladders('Rahmenvertrag Büromaterial').find((c) => c.key.includes('vertrag')) as Laddered
    expect(av.ladder.some((r) => r.kind === 'head')).toBe(false)
    // a phrase with a short form: no cuts across its words
    const coc = ladders('Code of Conduct English Edition').find((c) => c.key === 'code of conduct') as Laddered
    expect(texts(coc)).toEqual(['coc', 'codeofconduct'])
    // `#812`: `812` or `no812` in an English title, `nr` only as the last resort
    const pr = ladders('PR #812: Fix pagination bug').find((c) => c.cls === 'marker') as Laddered
    expect(texts(pr)).toEqual(['812', 'no812', 'nr812'])
    const de = ladders('Ticket #812 Drucker defekt').find((c) => c.cls === 'marker') as Laddered
    expect(texts(de)).toEqual(['nr812'])
  })

  it('polarity parts: a negation is kept, no rung stops before a privative head (quality round 2)', () => {
    const nb = ladderOf('No-Bake Peanut Butter Bars', ladders('No-Bake Peanut Butter Bars')[0]?.key ?? '')
    expect(nb.key).toBe('no+bake')
    expect(texts(nb)).toEqual(['nobake'])
    const gf = ladderOf('Gluten-Free Cookies', ladders('Gluten-Free Cookies')[0]?.key ?? '')
    expect(texts(gf)).toContain('glutenfree')
    expect(texts(gf).some((t) => t.length <= 'gluten'.length)).toBe(false)
  })

  it('a whole part of 5+ chars whose other parts are weak or noise is plain (SPEC 7.3)', () => {
    const c = ladderOf('Versionshinweise 5.1', ladders('Versionshinweise 5.1')[0]?.key ?? '')
    expect(c.ladder.find((r) => r.text === 'hinweise')).toMatchObject({ kind: 'head', plain: true })
    const t = ladderOf('Protokoll Teamsitzung 12.03.2026', 'teamsitzung')
    expect(t.ladder.find((r) => r.text === 'team')).toMatchObject({ plain: false })
  })

  it('names: full word up to 8 chars at 0, no morph cut and no skeleton; acronyms: full word only', () => {
    const lisbon = ladderOf('Trip report from Lisbon', 'lisbon')
    expect(texts(lisbon)[0]).toBe('lisbon')
    expect(lisbon.ladder[0]?.cost).toBe(0)
    expect(lisbon.ladder.some((r) => r.kind === 'skeleton' || r.kind === 'morph')).toBe(false)
    expect(show(ladderOf('MRT Knie links', 'mrt'))).toEqual(['mrt(0)'])
  })

  it('number rungs (SPEC 11.5)', () => {
    expect(texts(ladderOf('Paris 1889', 'y1889'))).toEqual(['1889'])
    expect(texts(ladderOf('Plan 2025/2026', 'r2025-2026'))).toEqual(['2526'])
    const wide = ladderOf('Archiv 1950–2020', 'r1950-2020')
    expect(wide.ladder[0]).toMatchObject({ text: '1950-2020', segs: ['1950', '2020'] })
    // the full month name is a rung too (docs/DEVIATIONS.md, quality round 2)
    expect(texts(ladderOf('Newsletter März 2026', 'm03'))).toEqual(['mrz', 'maerz'])
    expect(texts(ladderOf('Board Minutes March 2026', 'm03'))).toEqual(['mar', 'march'])
    expect(texts(ladderOf('Sommerfest Mai 2026', 'm05'))).toEqual(['mai'])
    expect(texts(ladderOf('Team Lunch Friday', 'wd5'))).toEqual(['fri', 'friday'])
    expect(texts(ladderOf('Teamessen am Freitag', 'wd5'))).toEqual(['freitag'])
    expect(texts(ladderOf('AGB Version 3.1', 'v3.1'))).toEqual(['v31'])
    expect(texts(ladderOf('Teil 2 Einleitung', 'pt2'))).toEqual(['pt2'])
    expect(texts(ladderOf('Bestellung 4500012345', 'n4500012345'))).toEqual(['2345'])
    expect(texts(ladderOf('SSD 128 GB', 'q128gb'))).toEqual(['128gb'])
    expect(ladderOf('Wasserkocher 1,7 Liter', 'q1.7l').ladder).toEqual([])
    expect(analyze('Wasserkocher 1,7 Liter').pool).not.toContain('q1.7l')
    expect(texts(ladderOf('PROJ-1234 Checkout fails', 'cproj1234'))).toEqual(['proj1234'])
  })

  it('no zero-pad rung: markers and years have no padded forms', () => {
    for (const r of ladderOf('Teil 2 Einleitung', 'pt2').ladder) expect(r.text).not.toMatch(/0\d/)
  })

  it('concepts below score 150 keep only rungs with cost <= 110', () => {
    for (const c of ladders('Sommerfest im Stadtpark 2026 Programm Kinder Musik'))
      if (c.score < 150) for (const r of c.ladder) expect(r.cost).toBeLessThanOrEqual(110)
  })

  it('consistentRungs keeps only rung 0', () => {
    const c = ladderOf('Q3 2026 Marketing Budget Review', 'marketing', { consistentRungs: true })
    expect(texts(c)).toEqual(['mktg'])
  })

  it('at most 4 rungs, sorted by cost, length, text', () => {
    for (const c of ladders('Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz Marketing')) {
      expect(c.ladder.length).toBeLessThanOrEqual(4)
      for (let i = 1; i < c.ladder.length; i++) {
        const a = c.ladder[i - 1]
        const b = c.ladder[i]
        if (a === undefined || b === undefined) continue
        expect(a.cost < b.cost || (a.cost === b.cost && a.text.length <= b.text.length)).toBe(true)
      }
    }
  })
})

describe('safety on rungs (SPEC 9.2)', () => {
  it('Analyseplattform: verbatim `analyse` allowed, cuts `anal` and `analys` removed', () => {
    const c = ladders('Analyseplattform Update')[0] as Laddered
    expect(c.rejected).toEqual(expect.arrayContaining([{ text: 'anal', rule: 'B1' }]))
    expect(texts(c)).not.toContain('anal')
    expect(texts(c)).not.toContain('analys')
  })

  it('Cockpit keeps the full word, `cock` is removed', () => {
    const c = ladderOf('Cockpit Dashboard', ladders('Cockpit Dashboard')[0]?.key ?? '')
    expect(texts(c)).toContain('cockpit')
    expect(texts(c)).not.toContain('cock')
  })

  it('Fickenscher: every rung removed, concept dropped from the pool', () => {
    const a = analyze('Fickenscher Bericht 2026')
    const c = ladders('Fickenscher Bericht 2026').find((x) => x.display === 'fickenscher')
    expect(c?.ladder).toEqual([])
    expect(a.concepts.some((x) => x.key.startsWith('fick'))).toBe(true)
  })

  it('Scunthorpe: `scun` allowed, the full word removed (hard `cunt`)', () => {
    const c = ladders('Scunthorpe Town Walking Tour').find((x) => x.display === 'scunthorpe') as Laddered
    expect(texts(c)).toContain('scun')
    expect(texts(c)).not.toContain('scunthorpe')
  })

  it('Assessment: full word allowed, cuts that start with `ass` removed; Sexton: full word, no `sex`', () => {
    const a = ladders('Assessment Center for Trainees').find((x) => x.display === 'assessment') as Laddered
    expect(texts(a)).toContain('assessment')
    for (const r of a.ladder) if (r.kind !== 'full') expect(r.text.startsWith('ass')).toBe(false)
    const s = ladders('Sexton Family Reunion').find((x) => x.display === 'sexton') as Laddered
    expect(texts(s)).toEqual(['sexton'])
  })

  it('no false hits', () => {
    for (const t of [
      'Shiitake',
      'Titanium',
      'Kotflügel',
      'Scheibenwischer',
      'Hurtig',
      'Kasse',
      'Massnahme',
      'Hamburg',
    ]) {
      const c = ladders(`${t} Test`)[0] as Laddered
      expect(c.ladder.length, t).toBeGreaterThan(0)
      expect(
        c.ladder.some((r) => r.kind === 'full'),
        t,
      ).toBe(true)
    }
    expect(texts(ladderOf('Vertrieb Süd 2026', 'sued'))).toEqual(['sued'])
    for (const c of ladders('Hamburg Hafen')) expect(texts(c)).not.toContain('hh')
  })

  it('B4: a token that equals a list word is dropped before concepts', () => {
    const a = analyze('Sex Education Guide')
    expect(a.removed).toContainEqual({ word: 'sex', list: 'blocked' })
    expect(a.storedStems.some((s) => s.startsWith('sex'))).toBe(false)
  })

  it('B6: blocked 2-digit years have only the 4-digit rung', () => {
    expect(texts(ladderOf('Bericht 2018 Fazit', 'y2018'))).toEqual(['2018'])
    expect(texts(ladderOf('Bericht 2088 Fazit', 'y2088'))).toEqual(['2088'])
  })

  it('I8: look-alike pairs are removed; the model bond `polo1` is lost', () => {
    for (const c of ladders('Polo 1 Shirt Test')) for (const r of c.ladder) expect(hasLookalikePair(r.text)).toBe(false)
  })

  it('I8: the model bond `pro14` (SPEC 11.5 example) is removed like `polo1`', () => {
    expect(hasLookalikePair('pro14')).toBe(true)
    expect(hasLookalikePair('polo1')).toBe(true)
    for (const config of [undefined, { lengthMode: 'max', length: 32 } as const]) {
      const s = createSlugger(config)
      expect(s.slug('Brightwave Pro 14 Review')).not.toContain('pro14')
      expect(s.slug('Polo 1 Shirt Test')).not.toContain('polo1')
    }
  })

  it('every built-in abbr, compound part and marker prefix passes B1, B2 and I8', () => {
    const comp = compile(cfgOf())
    const bad: string[] = []
    for (const e of comp.lexicon.entries) {
      for (const a of e.abbr ?? [])
        if (segmentBlocked(a, comp.cfg) || rungBlocked(a, comp.cfg) || hasLookalikePair(a)) bad.push(`${e.key}:${a}`)
      if (e.partOnly === true && (segmentBlocked(e.key, comp.cfg) || hasLookalikePair(e.key))) bad.push(e.key)
    }
    for (const [w, m] of comp.markers)
      if (segmentBlocked(m.prefix, comp.cfg) || rungBlocked(m.prefix, comp.cfg) || hasLookalikePair(m.prefix))
        bad.push(`${w}:${m.prefix}`)
    expect(bad).toEqual([])
  })

  it('inflected forms of one lexicon entry give the same ladder (SPEC 4.4 step 2)', () => {
    const pairs: [string, string, string][] = [
      ['Umzug Planung Büro', 'Umzüge Planung Büro', 'umzug'],
      ['Haus Verkauf Nord', 'Häuser Verkauf Nord', 'haus'],
      ['Besprechung Vertrieb Nord', 'Besprechungen Vertrieb Nord', 'besprechung'],
    ]
    for (const [a, b, key] of pairs) {
      const la = ladderOf(a, key)
      const lb = ladderOf(b, key)
      expect(show(lb), b).toEqual(show(la))
      expect(texts(la)).toContain(key)
      // the typed form stays a verbatim form of the concept
      expect(lb.verbatim).not.toContain(key)
    }
    // a long word gets a bridge cut and no skeleton (docs/DEVIATIONS.md, quality round 1)
    expect(texts(ladderOf('Besprechungen Vertrieb Nord', 'besprechung'))).toContain('besprech')
    // a form with another stem keeps the typed word (`kita` is a form of `kindertagesstaette`)
    expect(texts(ladderOf('Kita Fest', 'kindertagesstaette'))).toContain('kita')
    expect(texts(ladderOf('Kita Fest', 'kindertagesstaette'))).not.toContain('kindertagesstaette')
  })

  it('buildLadder is pure: the same concept gives the same ladder', () => {
    const cfg = cfgOf()
    const d = doc('Q3 2026 Marketing Budget Review')
    const c = d.concepts[0]
    if (c === undefined) throw new Error('no concept')
    expect(buildLadder(c, cfg, compile(cfg))).toEqual(buildLadder(c, cfg, compile(cfg)))
  })
})
