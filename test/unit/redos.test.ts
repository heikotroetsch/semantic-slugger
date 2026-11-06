import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as REGEXES from '../../src/core/regexes.ts'
import { CISTEM_REGEXES } from '../../src/vendor/cistem.ts'

/**
 * ReDoS harness (SPEC 4.3): every regex in src/ against 4096-char adversarial inputs, < 50 ms each.
 * A lint test fails when a regex literal in src/ is not registered here.
 */

const REGISTERED: readonly [string, RegExp][] = [
  ...Object.entries(REGEXES).filter((e): e is [string, RegExp] => e[1] instanceof RegExp),
  ...CISTEM_REGEXES.map((r, i): [string, RegExp] => [`cistem[${i}]`, r]),
]

const rep = (s: string, n: number) => s.repeat(n)
const ADVERSARIAL: readonly [string, string][] = [
  ['a@ x 2048', rep('a@', 2048)],
  ['@ x 4096', rep('@', 4096)],
  ['"1 " x 2048', rep('1 ', 2048)],
  ['0/1 x 1365', rep('0/1', 1365)],
  ['de12 + " aaaa" x 1000', `de12${rep(' aaaa', 1000)}`],
  ['1. x 2048 + x', `${rep('1.', 2048)}x`],
  ['www. + a x 4092', `www.${rep('a', 4092)}`],
  ['a x 4096', rep('a', 4096)],
  ['1 x 4096', rep('1', 4096)],
  ['- x 4096', rep('-', 4096)],
  ['space x 4096', rep(' ', 4096)],
  ['< x 4096', rep('<', 4096)],
  ['&# x 2048', rep('&#', 2048)],
  ['c+ x 2048', rep('c+', 2048)],
  ['§ x 2048', rep('§ ', 2048)],
  ['#1 x 2048', rep('#1', 2048)],
  ['v1. x 1365', rep('v1.', 1365)],
  ['kw x 1365', rep('kw ', 1365)],
  ['a- x 2048', rep('a-', 2048)],
  ['1,1 x 1024', rep('1,1 ', 1024)],
  ['ä x 4096', rep('ä', 4096)],
  ['€1 x 2048', rep('€1', 2048)],
  ['+0 x 1365', rep('+0 ', 1365)],
  ['0 1 x 1365', rep('0 1', 1365)],
  ['2026/ x 819', rep('2026/', 819)],
  ['a.b x 1365', rep('a.b', 1365)],
  ['de12 1234 x 800', `de12${rep(' 1234', 800)}`],
  ['fy x 2048', rep('fy', 2048)],
  ['aaaa- x 819', rep('aaaa-', 819)],
  ['(a) x 1365', rep('(a)', 1365)],
  ['sch x 1365', rep('sch', 1365)],
  ['emoji x 2048', rep('🚚', 2048)],
]

function run(re: RegExp, input: string): number {
  const t0 = performance.now()
  re.lastIndex = 0
  if (re.global) input.replace(re, '')
  else re.test(input)
  re.lastIndex = 0
  return performance.now() - t0
}

describe('ReDoS harness (SPEC 4.3)', () => {
  it('registers the core regexes', () => {
    expect(REGISTERED.length).toBeGreaterThan(60)
  })

  for (const [name, re] of REGISTERED) {
    it(`${name} is linear on adversarial inputs`, () => {
      run(re, 'warm up 1234 a@b.de') // JIT warm-up
      for (const [label, input] of ADVERSARIAL) {
        const ms = Math.min(run(re, input), run(re, input))
        expect(ms, `${name} on ${label}: ${ms.toFixed(1)} ms`).toBeLessThan(50)
      }
    })
  }
})

/** Regex literals in TypeScript source, found with a small lexer (strings and comments skipped). */
function regexLiterals(src: string): string[] {
  const out: string[] = []
  const before = /[(,=:[!&|?{};+\-*%<>~^]$/
  let i = 0
  let last = '' // last significant char or keyword
  while (i < src.length) {
    const c = src[i] as string
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1
      i++
      last = c
      continue
    }
    if (c === '/' && (last === '' || before.test(last) || /\b(?:return|typeof|case|of|in)$/.test(last))) {
      let j = i + 1
      let cls = false
      while (j < src.length) {
        const d = src[j] as string
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '\n') break
        if (d === '[') cls = true
        else if (d === ']') cls = false
        else if (d === '/' && !cls) break
        j++
      }
      let k = j + 1
      while (k < src.length && /[dgimsuyv]/.test(src[k] as string)) k++
      out.push(src.slice(i, k))
      i = k
      last = '/'
      continue
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z_$]/.test(c)) {
        let j = i
        while (j < src.length && /[\w$]/.test(src[j] as string)) j++
        last = src.slice(i, j)
        i = j
        continue
      }
      last = c
    }
    i++
  }
  return out
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('regex lint (SPEC 4.3)', () => {
  const root = new URL('../../src', import.meta.url).pathname
  const registered = new Set(REGISTERED.map(([, r]) => `/${r.source}/${r.flags}`))

  it('the literal finder works', () => {
    expect(regexLiterals("const a = /x[/]y/gu; const b = 'a/b' // c / d\nreturn /z/.test(q) / 2")).toEqual([
      '/x[/]y/gu',
      '/z/',
    ])
  })

  it('finds every literal of the registry file', () => {
    const own = Object.values(REGEXES).filter((r) => r instanceof RegExp).length
    expect(regexLiterals(readFileSync(join(root, 'core/regexes.ts'), 'utf8')).length).toBe(own)
    expect(regexLiterals(readFileSync(join(root, 'vendor/cistem.ts'), 'utf8')).length).toBe(CISTEM_REGEXES.length)
  })

  it('every regex literal in src/ is registered in the harness', () => {
    const missing: string[] = []
    for (const f of files(root)) {
      for (const lit of regexLiterals(readFileSync(f, 'utf8'))) if (!registered.has(lit)) missing.push(`${f}: ${lit}`)
    }
    expect(missing).toEqual([])
  })

  it('no dynamic RegExp in src/', () => {
    for (const f of files(root)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/new RegExp\(/)
  })
})
