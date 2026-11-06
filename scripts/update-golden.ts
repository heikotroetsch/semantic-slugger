/**
 * Write generated example and golden files (SPEC 14.2, 17.3). Run by `pnpm test:update`.
 * Now: `examples/sql/schema.sql` from `sqlSchema()`; a test checks that they match.
 * The golden JSON files (`test/golden/v1.*.json`) follow in a later milestone.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sqlSchema } from '../src/adapters/sql.ts'

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
