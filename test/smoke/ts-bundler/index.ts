// Smoke fixture: TypeScript with moduleResolution "bundler" (SPEC 19.5). Type-checked with tsc, then run with Node.
import { type CreateUniqueResult, createSlugger, type SluggerConfig, slug } from 'semantic-slugger'
import { memoryStore } from 'semantic-slugger/adapters/memory'
import { STOP_EN } from 'semantic-slugger/data'

declare const process: { argv: string[] }

const expected: string | undefined = process.argv[2]
const id: string = slug('Jahresbericht Vertrieb Nord 2026')
if (id !== expected) throw new Error(`ts-bundler: got ${id}, expected ${expected}`)
const cfg: SluggerConfig = { separator: '_', stopWords: { add: ['draft'] } }
const s = createSlugger(cfg)
const done: CreateUniqueResult<undefined> = await s.createUnique('Draft Release Notes 2.4', { store: memoryStore() })
if (!done.result.id.includes('_') || STOP_EN.length === 0) throw new Error('ts-bundler: config')
console.log(`ts-bundler ok ${id}`)
