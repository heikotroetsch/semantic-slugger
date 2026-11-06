import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as data from '../../src/data/index.ts'
import * as api from '../../src/index.ts'

const srcDir = new URL('../../src/', import.meta.url).pathname

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('public surface', () => {
  it('exports the M1 API', () => {
    for (const name of [
      'createSlugger',
      'isValidSlug',
      'isSluggerError',
      'DEFAULTS',
      'ALGORITHM_VERSION',
      'SluggerError',
      'ConfigError',
      'InputError',
      'ExhaustedError',
      'ConflictError',
      'StoreError',
      'InternalError',
    ]) {
      expect(api, name).toHaveProperty(name)
    }
    expect(api.ALGORITHM_VERSION).toBe(1)
  })

  it('data subpath exports the v1 lists', () => {
    expect(data.BLOCK_HARD.length).toBeGreaterThan(10)
    expect(data.TAIL_ALPHABETS.safe.rest).toHaveLength(28)
    expect(data.RESERVED).toContain('admin')
  })
})

describe('browser-safe core', () => {
  it('no node: imports in src (except the CLI)', () => {
    for (const f of files(srcDir)) {
      if (f.endsWith('/cli.ts')) continue
      const imports = [...readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*from\s+['"]([^'"]+)['"]/gm)]
      for (const m of imports) expect(m[1], f).not.toMatch(/^node:|^(fs|path|crypto|os|util|buffer)$/)
    }
  })
})
