/**
 * Corpus report (SPEC 19.6): runs every fixture alone with the default config and prints the quality
 * metrics, per domain, the rung mix and the worst IDs. `pnpm corpus:report [--out file.md]`.
 * The gates are checked in `test/quality.test.ts`.
 */
import { writeFileSync } from 'node:fs'
import { buildReport, formatReport } from './lib/corpus.ts'

const rep = buildReport()
const text = formatReport(rep)
const i = process.argv.indexOf('--out')
const out = i >= 0 ? process.argv[i + 1] : undefined
if (out !== undefined) {
  writeFileSync(out, text)
  console.log(`corpus report written to ${out}`)
} else console.log(text)
