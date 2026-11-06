// Smoke fixture: TypeScript with module "node16" (SPEC 19.5). Type-checked with tsc, then run with Node.
import { createSlugger, type Explanation, type SlugResult, type SlugStore, slug } from 'semantic-slugger'
import { memoryStore } from 'semantic-slugger/adapters/memory'

declare const process: { argv: string[] }

const expected: string | undefined = process.argv[2]
const id: string = slug('Jahresbericht Vertrieb Nord 2026')
if (id !== expected) throw new Error(`ts-node16: got ${id}, expected ${expected}`)
const s = createSlugger({ length: 20, lexicon: [{ key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] }] })
const r: SlugResult = s.suggest('Kubernetes Cluster Upgrade')
const e: Explanation = s.explain('Kubernetes Cluster Upgrade')
const store: SlugStore = memoryStore()
if (e.result.id !== r.id || typeof store.exists !== 'function') throw new Error('ts-node16: types')
console.log(`ts-node16 ok ${id}`)
