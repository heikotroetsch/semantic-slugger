/**
 * Recipe: procurement (SPEC 15.8). One field among many. Documentation only: not in the package.
 * The README shows this file; `test/recipes.test.ts` checks the outputs below.
 */
import { createSlugger, type SluggerConfig } from '../../src/index.ts'

export const procurementConfig: SluggerConfig = {
  lexicon: [
    { key: 'rahmenvertrag', lang: 'de', cls: 'topic', forms: ['rahmenvertraege'], abbr: ['rv'], known: ['rv'] },
    { key: 'leistungsverzeichnis', lang: 'de', cls: 'topic', abbr: ['lv'], known: ['lv'] },
    { key: 'lieferung', lang: 'de', cls: 'topic', weak: true },
    { key: 'standort', lang: 'de', cls: 'topic', forms: ['standorte'], weak: true },
    { key: 'los', lang: 'de', cls: 'marker', abbr: ['los'] },
  ],
}

export const procurement = createSlugger(procurementConfig)

/** Title -> ID with this config, alone (no store). */
export const procurementExamples: Readonly<Record<string, string>> = {
  'Rahmenvertrag Stromlieferung Standorte Nord 2026': 'rv-strom-nord-26',
  'Rahmenverträge Büromaterial 2027': 'rv-bueromater-27',
  'Leistungsverzeichnis Gebäudereinigung Los 1': 'lv-gebaeude-los1',
  'Leistungsverzeichnis Gebäudereinigung Los 2': 'lv-gebaeude-los2',
}
