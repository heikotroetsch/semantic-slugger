import { describe, expect, it } from 'vitest'
import { front, kept, tok } from '../helpers/front.ts'

const keys = (title: string, config?: Parameters<typeof kept>[1]) => kept(title, config)

describe('years, dates, ranges, quarters, weeks (SPEC 5.1, 5.2)', () => {
  it('years and historic years', () => {
    expect(keys('Bericht 2026')).toContain('y2026:year')
    expect(keys('Paris 1889')).toEqual(['paris:topic', 'y1889:year'])
    expect(tok('Paris 1889', '1889')?.historic).toBe(true)
  })

  it('a date gives its year only', () => {
    expect(keys('Protokoll 12.03.2026')).toContain('y2026:year')
    expect(keys('Termin 1/2/26')).toContain('y2026:year')
    expect(keys('Termin 12.03.2026').filter((k) => k.endsWith(':month'))).toEqual([])
  })

  it('ranges', () => {
    expect(keys('Plan 2025/2026')).toContain('r2025-2026:range')
    expect(keys('Plan 2025/26')).toContain('r2025-2026:range')
    expect(keys('Plan 2026–2028')).toContain('r2026-2028:range')
    expect(keys('Niederschlag 1950–2020')).toContain('r1950-2020:range')
    expect(keys('Liste 2026/2025')).toEqual(expect.arrayContaining(['y2026:year', 'y2025:year']))
  })

  it('quarters, weeks and fiscal years', () => {
    expect(keys('Q3 2026 Review')).toEqual(expect.arrayContaining(['q3:quarter', 'y2026:year']))
    expect(keys('KW12 Plan')).toContain('kw12:week')
    expect(keys('KW 12 Plan')).toContain('kw12:week')
    expect(keys('Week 22 Recap')).toContain('kw22:week')
    expect(keys('FY26 Budget')).toContain('y2026:year')
    expect(tok('FY26 Budget', '2026')?.fy).toBe(true)
  })

  it('long numbers', () => {
    expect(keys('Auftrag 4500012345')).toContain('n4500012345:longnum')
  })
})

describe('months and weekdays (SPEC 5.4)', () => {
  it('a capitalized month or a month next to a year or a day number', () => {
    expect(keys('Newsletter März 2026')).toContain('m03:month')
    expect(keys('Board Minutes March 2026')).toContain('m03:month')
    expect(keys('Treffen am 3. märz')).toContain('m03:month')
    expect(keys('report for march 2026')).toContain('m03:month')
    expect(keys('we may march')).toEqual(['may:topic', 'march:topic'])
  })

  it('weekdays: full words always, short forms only when capitalized next to a time or weekday', () => {
    expect(keys('Team Lunch Friday')).toContain('wd5:weekday')
    expect(keys('Teamessen Freitag')).toContain('wd5:weekday')
    expect(keys('sat alone')).toContain('sat:topic')
    expect(keys('Sat Sun Brunch')).toEqual(expect.arrayContaining(['wd6:weekday', 'wd7:weekday']))
    expect(keys('Open House Sat 2 PM')).toContain('wd6:weekday')
  })
})

describe('versions (SPEC 5.4)', () => {
  it('v-forms, version words and decimal versions in a version position', () => {
    expect(keys('Firefox v132 Release Notes')).toContain('v132:version')
    expect(keys('API v2.4 Changes')).toContain('v2.4:version')
    expect(keys('Handbuch Version 2.4')).toContain('v2.4:version')
    expect(keys('Release 3 Plan')).toContain('v3:version')
    expect(keys('Rev. 2 Entwurf')).toContain('v2:version')
    expect(keys('Release Notes')).toEqual(['release:topic', 'notes:topic~weak'])
    expect(keys('Versionshinweise 5.1')).toContain('v5.1:version')
    expect(keys('Python 3.12 Release Notes for Developers')).toContain('v3.12:version')
    expect(keys('Messwert 42,5 Grad')).not.toContain('v42.5:version')
    expect(front('Messwert 42,5 Grad').tokens.find((t) => t.decimal === '42,5')?.cls).toBe('noise')
  })

  it('the version word alone is noise; revision and release are words', () => {
    expect(keys('Version Neu')).not.toContain('version:topic')
    expect(keys('Interne Revision')).toContain('revision:topic')
  })
})

describe('markers (SPEC 5.3)', () => {
  it('number, letter, number word, Roman numeral', () => {
    expect(keys('Teil 2')).toEqual(['pt2:marker'])
    expect(keys('Part B')).toEqual(['ptb:marker'])
    expect(keys('Part One')).toEqual(['pt1:marker'])
    expect(keys('Teil Zwei')).toEqual(['pt2:marker'])
    expect(keys('Sprint 14 Review')).toContain('sprint14:marker')
    expect(keys('Phase II')).toEqual(['ph2:marker'])
    expect(keys('Teil Nr. 3')).toEqual(['pt3:marker'])
  })

  it('#, §, sizes, variants, classes, articles', () => {
    expect(keys('Ticket #4521')).toContain('nr4521:marker')
    expect(keys('Shirt Größe M')).toContain('szm:marker')
    expect(keys('Shirt Size XL')).toContain('szxl:marker')
    expect(keys('Variante B')).toEqual(['varb:marker'])
    expect(keys('Elternabend Klasse 4b')).toContain('kla4b:marker')
    expect(keys('Art. 28 DSGVO')).toContain('art28:marker')
    expect(keys('§ 5 BGB')).toContain('par5:marker')
    expect(keys('§§ 12 Satz')).toContain('par12:marker')
  })

  it('without a value a marker word is a normal word', () => {
    expect(keys('Teil der Lösung')).toContain('teil:topic')
    expect(keys('Sprint Review')).toContain('sprint:topic')
  })

  it('a user marker from the lexicon', () => {
    const cfg = { lexicon: [{ key: 'ticket', lang: '*' as const, cls: 'marker' as const, abbr: ['tkt'] }] }
    expect(keys('Ticket 42', cfg)).toEqual(['tkt42:marker'])
    expect(keys('Ticket 42')).toEqual(['ticket:topic'])
  })

  it('glued marker forms', () => {
    expect(keys('Podcast Ep3')).toContain('ep3:marker')
  })
})

describe('model numbers and number words (SPEC 5.1 step 4b, 4c)', () => {
  it('a number after a name, an acronym or (not in de) a capitalized word', () => {
    expect(keys('Tavora Phone 8 Midnight Blue')).toContain('d8:model')
    expect(keys('Brightwave Pro 14 Laptop Review for Students')).toContain('d14:model')
    expect(keys('History 101 for Beginners')).toContain('d101:model')
    expect(keys('Laptop RAM 16 Upgrade')).toContain('d16:model')
  })

  it('no model after a plain noun in a de title; stop words break the link', () => {
    expect(keys('Zimmer 8 Reinigung der Fenster').filter((k) => k.endsWith(':model'))).toEqual([])
    expect(keys('Phone of 8 Friends').filter((k) => k.endsWith(':model'))).toEqual([])
  })

  it('number words are dropped in titles of their language only', () => {
    expect(keys('Ten Houseplants That Survive Any Office')).not.toContain('ten:topic')
    expect(keys('Elf on the Shelf')).toContain('elf:topic')
    expect(keys('Die elf Freunde aus der Stadt')).not.toContain('elf:topic')
  })
})

describe('quantities (SPEC 5.2)', () => {
  it('integer quantities have a short form, decimals only a key', () => {
    expect(keys('Hantel 50 kg')).toContain('q50kg:quantity')
    expect(keys('Urlaub 10 Tagen')).toContain('q10d:quantity')
    expect(keys('Phone 128 GB')).toContain('q128gb:quantity')
    expect(keys('Wohnung 85 m²')).toContain('q85m2:quantity')
    expect(keys('Milch 1,7 Liter')).toEqual(['milch:topic', 'q1.7l:quantity'])
    expect(tok('Milch 1,7 Liter', '')?.ascii).toBe('')
  })

  it('a unit word counts only after a number', () => {
    expect(keys('Liter Milch')).toContain('liter:topic')
  })
})

describe('noise tokens (SPEC 5.2)', () => {
  it('am/pm after a time, ordinals, single letters, Roman numerals, [ilo] tokens', () => {
    expect(keys('Open House Saturday 2 PM')).toEqual(['open:topic', 'house:topic', 'wd6:weekday'])
    expect(keys('Meeting 9am')).not.toContain('am:topic')
    expect(keys('1st Place')).toEqual(['place:topic'])
    expect(keys('Vitamin D')).toEqual(['vitamin:topic'])
    expect(keys('Louis XIV Biografie')).not.toContain('xiv:topic')
    expect(keys('Ludwig II')).toEqual(['ludwig:topic'])
    expect(keys('ii ll lo Kalender')).toEqual(['kalender:topic'])
  })

  it('PM alone is an acronym, not noise', () => {
    expect(keys('PM Weekly Sync')).toContain('pm:acronym')
  })
})

describe('code runs (SPEC 5.1 step 1b)', () => {
  it('ticket keys, standards and technical codes', () => {
    expect(keys('PROJ-1234 Checkout fails')).toContain('cproj1234:code')
    expect(keys('COVID-19 Update')).toContain('ccovid19:code')
    expect(keys('TCP/IP Basics')).toContain('ctcpip:code')
    expect(keys('USB-C Kabel')).toContain('cusbc:code')
    expect(keys('ISO 9001 Audit')).toContain('ciso9001:code')
    expect(keys('Ersatzteil SKU A-4471')).toContain('cskua4471:code')
    expect(keys('MP3 Player')).toContain('cmp3:code')
    expect(keys('papier a4 kaufen')).toContain('ca4:code')
  })

  it('a run ends before a hyphen word (B2B-Marketing, COVID-19-Impfung)', () => {
    expect(keys('B2B-Marketing Plan')).toEqual(expect.arrayContaining(['cb2b:code', 'marketing:topic']))
    expect(keys('COVID-19-Impfung Termin')).toEqual(expect.arrayContaining(['ccovid19:code', 'impfung:topic']))
  })

  it('slash and bracket words with lower-case letters are words', () => {
    expect(keys('A/B-Test Ergebnisse')).not.toContain('cab:code')
    expect(keys('Input/Output Errors')).toEqual(expect.arrayContaining(['input:topic', 'output:topic']))
    expect(keys('Report(Final)').filter((k) => k.endsWith(':code'))).toEqual([])
  })

  it('long codes without a digit are noise', () => {
    expect(front('ABCDEFGHI-XYZ Liste').tokens.find((t) => t.ascii === 'abcdefghixyz')?.cls).toBe('noise')
  })
})

describe('words and hyphens (SPEC 5.1 steps 2 and 3)', () => {
  it('an inner hyphen keeps the token and records the parts', () => {
    const t = tok('E-Mail-Vorlage Kunden', 'emailvorlage')
    expect(t?.parts).toEqual(['e', 'mail', 'vorlage'])
    expect(tok('Gluten-Free Cookies', 'glutenfree')?.parts).toEqual(['gluten', 'free'])
  })

  it('a hyphen with a space or at the edge splits', () => {
    expect(front('Laptop - Berlin -x').tokens.map((t) => t.ascii)).toEqual(['laptop', 'berlin', 'x'])
    expect(front('Laptop – Berlin').tokens.map((t) => t.ascii)).toEqual(['laptop', 'berlin'])
  })

  it('splits on apostrophes (contraction stems)', () => {
    expect(front("Don't stop").tokens.map((t) => t.ascii)).toEqual(['don', 't', 'stop'])
  })

  it('case flags', () => {
    expect(tok('iPhone', 'iphone')?.innerCaps).toBe(true)
    expect(tok('NASA Mission', 'nasa')?.case).toBe('upper')
    expect(tok('NASA Mission', 'mission')?.case).toBe('title')
    expect(tok('KPIs Review', 'kpis')?.capsAbbr).toBe('kpi')
  })
})

describe('deny tokens (SPEC 6.6)', () => {
  it('single and multi-word entries are dropped right after tokenizing', () => {
    const f = front('Mitarbeitergespräch Anna Weber 2026', { denyTokens: ['anna weber'] })
    expect(f.denied.map((t) => t.ascii)).toEqual(['anna', 'weber'])
    expect(kept('Gespräch Anna Weber und Anna', { denyTokens: ['Anna Weber'] })).toContain('anna:topic')
    expect(kept('Gespräch Anna Weber', { denyTokens: ['Weber', 'Müller'] })).not.toContain('weber:topic')
    expect(kept('Feedback Müller', { denyTokens: ['Müller'] })).toEqual(['feedback:topic'])
  })

  it('a title made only of deny tokens is empty, never restored', () => {
    const f = front('Anna Weber', { denyTokens: ['anna', 'weber'] })
    expect(f.empty).toBe(true)
  })

  it('deny tokens are removed before phrase match', () => {
    const f = front('machine learning intro', { denyTokens: ['machine'] })
    expect(f.phrases).toEqual([])
  })
})
