/**
 * Dist sandbox (SPEC 14.1, 19.5): the CJS builds run in a `node:vm` context where `process`, `Buffer`,
 * `require`, `crypto`, `TextEncoder`, `Intl`, `Date`, `BigInt` and `Math.random` throw. Module files are
 * loaded by a small loader that only resolves relative `.cjs` files inside `dist/`. The IDs must equal
 * the IDs of the source in Node. Needs `pnpm build` first (it is skipped without `dist/`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { loadFixtures } from '../scripts/lib/corpus.ts'
import { createSlugger, explain, slug } from '../src/index.ts'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const BANNED = ['process', 'Buffer', 'require', 'crypto', 'TextEncoder', 'Intl', 'Date', 'BigInt']

type Exports = Record<string, unknown>

function sandbox(): { load: (file: string) => Exports; context: vm.Context } {
  const context = vm.createContext({})
  vm.runInContext(
    `for (const k of ${JSON.stringify(BANNED)}) {
       Object.defineProperty(globalThis, k, { get() { throw new Error('sandbox: ' + k + ' used') }, configurable: false })
     }
     Math.random = () => { throw new Error('sandbox: Math.random used') }`,
    context,
  )
  const cache = new Map<string, Exports>()
  const load = (file: string): Exports => {
    const hit = cache.get(file)
    if (hit !== undefined) return hit
    if (!file.startsWith(dist) || !file.endsWith('.cjs')) throw new Error(`sandbox: cannot load ${file}`)
    const module = { exports: {} as Exports }
    cache.set(file, module.exports)
    const code = readFileSync(file, 'utf8')
    const fn = vm.runInContext(`(function (exports, require, module) {${code}\n})`, context, { filename: file }) as (
      e: Exports,
      r: (id: string) => Exports,
      m: { exports: Exports },
    ) => void
    const req = (id: string): Exports => {
      if (!id.startsWith('.')) throw new Error(`sandbox: require("${id}")`)
      return load(resolve(dirname(file), id))
    }
    fn(module.exports, req, module)
    cache.set(file, module.exports)
    return module.exports
  }
  return { load, context }
}

const titles = loadFixtures()
  .filter((_, i) => i % 5 === 0)
  .map((f) => f.title)

describe.runIf(existsSync(join(dist, 'index.cjs')))('dist sandbox (CJS in node:vm)', () => {
  it('the sandbox really bans the globals', () => {
    const { context } = sandbox()
    for (const k of [...BANNED, 'Math.random()']) expect(() => vm.runInContext(k, context), k).toThrow(/sandbox/)
  })

  it('index.cjs gives the same IDs as the source', () => {
    const { load } = sandbox()
    const api = load(join(dist, 'index.cjs')) as {
      slug: typeof slug
      explain: typeof explain
      createSlugger: typeof createSlugger
    }
    expect(titles.length).toBeGreaterThan(50)
    for (const t of titles) expect(api.slug(t), t).toBe(slug(t))
    const cfg = { length: 24, lengthMode: 'max', separator: '_', leak: 'minimal' } as const
    const mine = api.createSlugger(cfg)
    const ref = createSlugger(cfg)
    for (const t of titles.slice(0, 30)) expect(mine.slug(t), t).toBe(ref.slug(t))
    const opaque = { leak: 'opaque', secret: 'sandbox-secret-0123456' } as const
    expect(api.createSlugger(opaque).slug('Sommerfest 2026')).toBe(createSlugger(opaque).slug('Sommerfest 2026'))
    expect(api.explain('Jahresbericht Vertrieb Nord 2026').toString()).toBe(
      explain('Jahresbericht Vertrieb Nord 2026').toString(),
    )
  })

  it('adapters and data load and work', async () => {
    const { load } = sandbox()
    const api = load(join(dist, 'index.cjs')) as { createSlugger: typeof createSlugger }
    const { memoryStore } = load(join(dist, 'adapters', 'memory.cjs')) as {
      memoryStore: typeof import('../src/adapters/memory.ts').memoryStore
    }
    const s = api.createSlugger()
    const store = memoryStore()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push((await s.createUnique('Chocolate Cake Recipe', { store })).result.id)
    expect(new Set(ids).size).toBe(5)
    expect(typeof load(join(dist, 'adapters', 'sql.cjs')).sqlSchema).toBe('function')
    expect(typeof load(join(dist, 'adapters', 'prisma.cjs')).prismaStore).toBe('function')
    expect(load(join(dist, 'data.cjs')).RESERVED).toContain('admin')
  })
})
