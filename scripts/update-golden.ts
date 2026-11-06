/**
 * Write generated example, golden and README files (SPEC 14.2, 17.3, 18.9). Run by `pnpm test:update`.
 * - `examples/sql/schema.sql` from `sqlSchema()`
 * - `test/golden/v1.subset.json`: the golden subset for the Node and browser parity tests (19.5)
 * - the config table in `README.md` from `DEFAULTS` (18.9)
 * Tests check that each file matches.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sqlSchema } from '../src/adapters/sql.ts'
import { goldenSubset } from './lib/golden.ts'
import { updateReadme } from './lib/readme.ts'

function write(rel: string, text: string): void {
  const file = new URL(`../${rel}`, import.meta.url)
  mkdirSync(new URL('.', file), { recursive: true })
  let old = ''
  try {
    old = readFileSync(file, 'utf8')
  } catch {}
  if (old === text) console.log(`${rel} unchanged`)
  else {
    writeFileSync(file, text)
    console.log(`${rel} written`)
  }
}

write('examples/sql/schema.sql', sqlSchema())
write('test/golden/v1.subset.json', `${JSON.stringify(goldenSubset(), null, 2)}\n`)
write('README.md', updateReadme(readFileSync(new URL('../README.md', import.meta.url), 'utf8')))
