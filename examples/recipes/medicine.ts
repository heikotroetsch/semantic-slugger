/**
 * Recipe: medicine (SPEC 15.8). Documentation only: not in the package.
 * The README shows this file; `test/recipes.test.ts` checks the outputs below.
 */
import { createSlugger, type SluggerConfig } from '../../src/index.ts'

export const medicineConfig: SluggerConfig = {
  lexicon: [{ key: 'magnetresonanztomographie', lang: 'de', cls: 'topic', abbr: ['mrt'], known: ['mrt'] }],
  denyTokens: ['patient', 'patientin'],
}

export const medicine = createSlugger(medicineConfig)

/** Title -> ID with this config, alone (no store). */
export const medicineExamples: Readonly<Record<string, string>> = {
  'Befund Magnetresonanztomographie Schulter rechts': 'befund-magnetres',
  'Patient Intake Form': 'intake-form-kh3g',
}
