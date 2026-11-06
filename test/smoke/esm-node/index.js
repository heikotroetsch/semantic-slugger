// Smoke fixture: ESM import in Node (SPEC 19.5). Run by scripts/smoke.ts after installing the packed tarball.
import { createSlugger, isSluggerError, slug } from 'semantic-slugger'
import { memoryStore } from 'semantic-slugger/adapters/memory'
import { sqlSchema } from 'semantic-slugger/adapters/sql'
import { RESERVED } from 'semantic-slugger/data'

const expected = process.argv[2]
const id = slug('Jahresbericht Vertrieb Nord 2026')
if (id !== expected) throw new Error(`esm: got ${id}, expected ${expected}`)
const s = createSlugger()
const store = memoryStore()
const a = await s.createUnique('Sommerfest 2026', { store })
const b = await s.createUnique('Sommerfest 2026', { store })
if (a.result.id === b.result.id) throw new Error('esm: createUnique gave the same ID twice')
if (!RESERVED.includes('admin')) throw new Error('esm: data subpath')
if (!sqlSchema().includes('create table')) throw new Error('esm: sql adapter')
try {
  createSlugger({ length: 2 })
  throw new Error('esm: no ConfigError')
} catch (e) {
  if (!isSluggerError(e, 'E_CONFIG')) throw e
}
console.log(`esm-node ok ${id}`)
