import fc from 'fast-check'
import { LEXICON_DE } from '../../src/data/v1/lexicon-de.ts'
import { LEXICON_EN } from '../../src/data/v1/lexicon-en.ts'
import { LEXICON_SHARED } from '../../src/data/v1/lexicon-shared.ts'
import { PARTS_DE } from '../../src/data/v1/parts-de.ts'
import { STOP_DE } from '../../src/data/v1/stop-de.ts'
import { STOP_EN } from '../../src/data/v1/stop-en.ts'
import type { SluggerConfig } from '../../src/index.ts'

/** Shared fast-check arbitraries of SPEC 19.3. */
export const lexiconWords = [...LEXICON_DE, ...LEXICON_EN, ...LEXICON_SHARED].map((e) => e.key)
export const word = fc.constantFrom(
  ...lexiconWords,
  ...PARTS_DE.slice(0, 80),
  ...STOP_DE.slice(0, 20),
  ...STOP_EN.slice(0, 20),
  'München',
  'Süd',
  '2026',
  'März',
  'v2.4',
  'Teil',
  '3',
  'iPhone',
  'NASA',
  'GmbH',
  '🚚',
  'Москва',
  'ß',
  'Analyse',
  'Fickenscher',
  'Q3',
  'KW 12',
  'Phone',
  '8',
  '1950–2020',
  'PROJ-1234',
  '14',
  '88 kg',
  'Release',
  'Rains',
  'Dapper',
  '1488',
)
export const title = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 300 }),
  fc.array(word, { maxLength: 12 }).map((w) => w.join(' ')),
)
export const cfgArb = fc
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
