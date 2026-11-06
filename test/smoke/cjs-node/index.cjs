// Smoke fixture: CommonJS require in Node (SPEC 19.5). Run by scripts/smoke.ts after installing the packed tarball.
const { slug, explain, isSluggerError, ConfigError } = require('semantic-slugger')
const { memoryStore } = require('semantic-slugger/adapters/memory')
const { prismaStore } = require('semantic-slugger/adapters/prisma')
const pkg = require('semantic-slugger/package.json')

const expected = process.argv[2]
const id = slug('Jahresbericht Vertrieb Nord 2026')
if (id !== expected) throw new Error(`cjs: got ${id}, expected ${expected}`)
if (explain('Jahresbericht Vertrieb Nord 2026').result.id !== id) throw new Error('cjs: explain')
if (typeof memoryStore !== 'function' || typeof prismaStore !== 'function') throw new Error('cjs: adapters')
if (pkg.name !== 'semantic-slugger') throw new Error('cjs: package.json subpath')
if (!isSluggerError(new ConfigError('x', { field: 'f', value: 1, reason: 'r' }), 'E_CONFIG'))
  throw new Error('cjs: brand')
console.log(`cjs-node ok ${id}`)
