// @ts-check
/**
 * Playground data (SPEC 18.7): the prefilled titles and the recipe presets. No DOM code here, so the
 * tests can import this file. All titles come from the synthetic test corpus.
 */

/** 24 titles from many fields, German, English and mixed. */
export const DEFAULT_TITLES = [
  'How I Learned to Stop Worrying and Love Spreadsheets',
  'Gartenarbeit im Herbst: Was jetzt zu tun ist',
  'City Council Approves New Riverside Park',
  'Hochwasser in Passau: Pegel sinkt langsam',
  'Kestrel X2 Smartwatch with GPS',
  'Bio-Kaffeebohnen Espresso Röstung 1 kg',
  'Login page shows 500 error after deploy',
  'VPN-Verbindung bricht nach 10 Minuten ab',
  'Retrospektive Sprint 14',
  'Daily Standup Team Phoenix – Protokoll',
  'Classic Buttermilk Pancakes',
  'Omas Apfelstrudel mit Vanillesoße',
  'Deep Learning für die Segmentierung von MRT-Bildern',
  'Sommerfest im Stadtpark 2026',
  'Non-Disclosure Agreement Template',
  'Stellenausschreibung Werkstudent Marketing (m/w/d)',
  'Befund MRT Schultergelenk',
  'Study Guide for Final Exam Biology',
  'Add rate limiting to public API',
  'Steuererklärung 2025 Unterlagen',
  'Email Campaign: Spring Sale',
  'Zugfahrt von München nach Rom',
  'Rahmenvertrag Büromaterial',
  'Project Charter: Customer Portal',
]

/** A visible demo secret: only for trying `leak: 'opaque'` here. Never use it in real code. */
export const DEMO_SECRET = 'playground-demo-secret-not-private'

/**
 * @typedef {{ label: string, lexicon: object[], denyTokens?: string[], reserved?: string[], titles: string[] }} Preset
 */

/**
 * The three README recipes (SPEC 15.8). Plain user config: the core ships no domain knowledge.
 * @type {Record<string, Preset>}
 */
export const PRESETS = {
  software: {
    label: 'Software',
    lexicon: [
      { key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] },
      { key: 'epic', lang: 'en', cls: 'topic', weak: true },
    ],
    reserved: ['tickets', 'board'],
    titles: ['Kubernetes Cluster Upgrade Q3 2026', 'Epic: Kubernetes Monitoring Dashboard'],
  },
  medicine: {
    label: 'Medicine',
    lexicon: [{ key: 'magnetresonanztomographie', lang: 'de', cls: 'topic', abbr: ['mrt'], known: ['mrt'] }],
    denyTokens: ['patient', 'patientin'],
    titles: ['Befund Magnetresonanztomographie Schulter rechts', 'Patient Intake Form'],
  },
  procurement: {
    label: 'Procurement',
    lexicon: [
      { key: 'rahmenvertrag', lang: 'de', cls: 'topic', forms: ['rahmenvertraege'], abbr: ['rv'], known: ['rv'] },
      { key: 'leistungsverzeichnis', lang: 'de', cls: 'topic', abbr: ['lv'], known: ['lv'] },
      { key: 'lieferung', lang: 'de', cls: 'topic', weak: true },
      { key: 'standort', lang: 'de', cls: 'topic', forms: ['standorte'], weak: true },
      { key: 'los', lang: 'de', cls: 'marker', abbr: ['los'] },
    ],
    titles: ['Rahmenvertrag Stromlieferung Standorte Nord 2026', 'Leistungsverzeichnis Gebäudereinigung Los 1'],
  },
}
