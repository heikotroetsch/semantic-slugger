import { describe, expect, it } from 'vitest'
import { compile } from '../../src/core/compile.ts'
import { type PartIndex, splitCompound } from '../../src/core/compound.ts'
import { concept, concepts, doc, shapes } from '../helpers/concepts.ts'
import { cfgOf, front, kept } from '../helpers/front.ts'

const de = (t: string) => shapes(t, undefined, 'de')
const idx = compile(cfgOf()).parts.get('de') as PartIndex

describe('parts to concepts (SPEC 7.3)', () => {
  it('a lexicon word stays whole and keeps its entry', () => {
    const c = concept('Kindertagesstätte Anmeldung', 'kindertagesstaette')
    expect(c?.lex?.key).toBe('kindertagesstaette')
    expect(c?.parts).toBeUndefined()
    expect(front('Kindertagesstätte Anmeldung').splits).toEqual([])
  })

  it('every part weak, generic or noise: the token is a weak word', () => {
    for (const t of [
      'Jahresbericht Vertrieb',
      'Projektplan Vertrieb',
      'Themenliste Vertrieb',
      'Monatsbericht Vertrieb',
    ]) {
      const f = front(t)
      const w = t.split(' ')[0]?.toLowerCase() as string
      expect(f.weak, t).toContain(w)
      expect(kept(t)[0], t).toBe(`${w}:topic~weak`)
      expect(concepts(t)[0]?.weak, t).toBe(true)
    }
    // the explain row has no kept parts
    expect(front('Jahresbericht Vertrieb').splits[0]).toEqual({
      word: 'jahresbericht',
      parts: ['jahr', 'bericht'],
      linkers: ['', 'es'],
      kept: [],
    })
  })

  it('a weak compound alone is restored by the back-off as a normal concept', () => {
    const f = front('Jahresbericht')
    expect(f.backoff).toBe('weak')
    expect(f.warnings).toContain('stopwords-relaxed')
    expect(de('Jahresbericht')).toEqual(['jahresberich:topic'])
    expect(de('Projektplan')).toEqual(['projektpla:topic'])
  })

  it('weak head: the head is dropped and the modifier is the concept', () => {
    expect(de('Urlaubsplan')).toEqual(['urlaub:topic'])
    expect(de('Buchungssystem')).toEqual(['buchung:topic'])
    expect(de('Sicherheitskonzept')).toEqual(['sicherheit:topic'])
    expect(de('Steuerfrage')).toEqual(['steuer:topic'])
    expect(de('Marketingbericht')).toEqual(['marketing:topic'])
    expect(de('Lernplattform')).toEqual(['lern:topic'])
    expect(de('Analyseplattform')[0]).toMatch(/^analy/)
    expect(concept('Analyseplattform', 'analy', undefined, 'de')?.verbatim).toEqual(['analyse'])
    // the modifier keeps its entry: a lexicon part gives a lexicon topic
    expect(concept('Marketingbericht', 'marketing', undefined, 'de')?.lex?.key).toBe('marketing')
  })

  it('pass 2 with a weak head: the unknown modifier is the concept', () => {
    const c = concept('Xantoplexplan', 'xantoplex', undefined, 'de')
    expect(c?.cls).toBe('topic')
    expect(c?.lex).toBeUndefined()
    expect(c?.verbatim).toEqual(['xantoplex'])
  })

  it('pass 2: a modifier with a noun suffix takes the linker', () => {
    expect(splitCompound('buchungssystem', idx)?.map((p) => `${p.linker}|${p.text}`)).toEqual(['|buchung', 's|system'])
    expect(splitCompound('kinderbetreuungskosten', idx)?.map((p) => p.text)).toEqual(['kinderbetreuung', 'kosten'])
    // no noun suffix: the empty linker comes first (as in SPEC 7.2)
    expect(splitCompound('xantoplexplan', idx)?.map((p) => `${p.linker}|${p.text}`)).toEqual(['|xantoplex', '|plan'])
  })

  it('generic modifier: the modifier is dropped, compared without the linker', () => {
    expect(de('Hauptbahnhof')).toEqual(['bahnhof:topic'])
    expect(de('Jahresurlaub')).toEqual(['urlaub:topic'])
    expect(de('Neujahrsfest')).toEqual(['fest:topic'])
  })

  it('direction, region and qualifier modifiers become own concepts', () => {
    expect(de('Norddeutschland')).toEqual(['deutschland:region', 'nord:direction'])
    expect(de('Süddeutschland')).toEqual(['deutschland:region', 'sued:direction'])
    expect(de('Südbahnhof')).toEqual(['bahnhof:topic', 'sued:direction'])
    expect(de('Onlinekurs')).toEqual(['kurs:topic', 'online:qualifier'])
    const nord = concept('Norddeutschland', 'nord', undefined, 'de')
    expect(nord?.verbatim).toEqual(['nord'])
    expect(nord?.pos).toBe(0)
    // the rest after the modifier is weak: only the modifier counts
    expect(de('Nordbericht')).toEqual(['berich:topic~weak', 'nord:direction'])
    // a lowerOnly direction does not match the capitalized first part
    expect(de('Rechtsberatung')).toEqual(['rech+beratung:topic'])
  })

  it('adjacent parts that form a lexicon word are joined first', () => {
    const c = concepts('Kinder-Garten-Fest', undefined, 'de')
    expect(c).toHaveLength(1)
    expect(c[0]?.parts?.map((p) => p.text)).toEqual(['kindergarten', 'fest'])
    expect(c[0]?.display).toBe('kindergartenfest')
    // `e` + `mail` -> `email`; `vorlage` is a weak head
    expect(shapes('E-Mail-Vorlage Kunden')[0]).toBe('email:topic')
    expect(concept('E-Mail-Vorlage Kunden', 'email')?.lex?.key).toBe('email')
  })

  it('two or more strong parts: one concept for the whole token', () => {
    for (const [t, parts] of [
      ['Apfelkuchen', ['apfel', 'kuchen']],
      ['Sommerfest', ['sommer', 'fest']],
      ['Pizzalieferung', ['pizza', 'lieferung']],
      ['Kinderbetreuungskosten', ['kinderbetreuung', 'kosten']],
    ] as const) {
      const c = concepts(t, undefined, 'de')
      expect(c, t).toHaveLength(1)
      const x = c[0]
      expect(x?.cls, t).toBe('topic')
      expect(x?.display, t).toBe(t.toLowerCase())
      expect(x?.verbatim, t).toEqual([t.toLowerCase()])
      expect(
        x?.parts?.map((p) => p.text),
        t,
      ).toEqual(parts)
      // stems of every part, for df and the re-pick diff
      expect(x?.stemKeys.length, t).toBe(2)
    }
  })

  it('class, prior and weight come from the head part', () => {
    // known head: lexicon topic with the head entry (prior common)
    const a = concept('Apfelkuchen', 'apfel+kuch', undefined, 'de')
    expect(a?.lex?.key).toBe('kuchen')
    expect(a?.lex?.prior).toBe('common')
    // pass 2: unknown modifier, known head
    expect(concept('Kinderbetreuungskosten', 'kinderbetreuung+kos', undefined, 'de')?.lex?.key).toBe('kosten')
    // the head entry weight applies (doc-kind head)
    const o = concepts('Onboarding-Checkliste')
    expect(o[0]?.lex?.key).toBe('checkliste')
    expect(o[0]?.lex?.weight).toBe(-60)
  })

  it('compounds with the same head stay two concepts (DEVIATIONS)', () => {
    const t = 'Apfelkuchen und Kirschkuchen Rezept'
    expect(shapes(t).slice(0, 2)).toEqual(['apfel+kuch:topic', 'kirsch+kuch:topic'])
  })

  it('hyphenated tokens: the typed split holds in every language', () => {
    // a language without compound data: one concept, parts not split further
    const g = concepts('Gluten-Free Cookies')
    expect(doc('Gluten-Free Cookies').front.tokens[0]?.lang).not.toBe('de')
    expect(g[0]?.display).toBe('glutenfree')
    expect(g[0]?.parts?.map((p) => p.text)).toEqual(['gluten', 'free'])
    // en title
    expect(concepts('Sugar-Free Recipes for the Holidays')[0]?.display).toBe('sugarfree')
    // all parts weak
    expect(front('Status-Update').backoff).toBe('weak')
  })

  it('hyphenated token with an unknown head: one unknown topic with the stems of every part', () => {
    const c = concepts('Mathe-Arbeitsblatt Klasse 4b', undefined, 'de')[0]
    expect(c?.display).toBe('mathearbeitsblatt')
    expect(c?.cls).toBe('topic')
    expect(c?.lex).toBeUndefined()
    expect(c?.stemKeys).toHaveLength(2)
  })

  it('never splits und, translit or name tokens', () => {
    expect(front('Поставки Москва').splits).toEqual([])
    expect(concepts('Поставки Москва').every((c) => c.parts === undefined)).toBe(true)
    // inner capitals: a name, never split
    expect(front('SommerFest Planung').splits).toEqual([])
    const n = concepts('Treffen mit SommerFest').find((c) => c.cls === 'name')
    expect(n?.verbatim).toEqual(['sommerfest'])
    expect(n?.parts).toBeUndefined()
  })

  it('stem lookup maps inflected forms to their entry', () => {
    expect(concept('Umzüge planen', 'umzug')?.verbatim).toEqual(['umzuege'])
    expect(concept('Besprechungen Vertrieb', 'besprechung')?.weak).toBe(true)
    const lexicon = [{ key: 'kasten', lang: 'de' as const, cls: 'topic' as const }]
    expect(concept('Kästen Lager', 'kasten', { lexicon })?.verbatim).toEqual(['kaesten'])
    // Besprechung and Besprechungen give the same concept
    expect(concept('Besprechung Vertrieb', 'besprechung')).toBeDefined()
  })

  it('no stem lookup for directions; lowerOnly words need lower case', () => {
    expect(shapes('Bill of Rights')).toEqual(['bill:topic', 'right:topic'])
    expect(concept('Bill of Rights', 'right')?.lex).toBeUndefined()
    expect(shapes('Nützliche Links')).toContain('link:topic')
    expect(shapes('Abbiegen nach links')).toContain('links:direction')
  })
})
