import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type CliIo, main, USAGE } from '../../src/cli/main.ts'
import { createSlugger, slug, slugMany } from '../../src/index.ts'

interface Run {
  code: number
  out: string
  err: string
}

async function run(
  argv: string[],
  opts: { stdin?: string; files?: Record<string, string>; env?: Record<string, string> } = {},
): Promise<Run> {
  let out = ''
  let err = ''
  const io: CliIo = {
    argv,
    readStdin: async () => opts.stdin ?? null,
    readFile: (p) => {
      const f = opts.files?.[p]
      if (f === undefined) throw new Error(`ENOENT ${p}`)
      return f
    },
    env: opts.env ?? {},
    out: (t) => {
      out += t
    },
    err: (t) => {
      err += t
    },
    version: '9.9.9',
  }
  const code = await main(io)
  return { code, out, err }
}

describe('cli', () => {
  it('slugs each argument', async () => {
    const r = await run(['Jahresbericht Vertrieb Nord 2026', 'Chocolate Cake Recipe'])
    expect(r).toEqual({
      code: 0,
      out: `${slug('Jahresbericht Vertrieb Nord 2026')}\n${slug('Chocolate Cake Recipe')}\n`,
      err: '',
    })
    expect(r.out.split('\n')[0]).toBe('vertrieb-nord-26')
  })

  it('reads stdin lines when there are no arguments, and --unique keeps them distinct', async () => {
    const stdin = 'Chocolate Cake Recipe\n\nChocolate Cake Recipe\r\nSommerfest 2026\n'
    const r = await run(['--unique'], { stdin })
    const ids = r.out.trim().split('\n')
    expect(ids).toEqual(
      slugMany(['Chocolate Cake Recipe', 'Chocolate Cake Recipe', 'Sommerfest 2026']).map((x) => x.id),
    )
    expect(new Set(ids).size).toBe(3)
    const plain = await run([], { stdin })
    expect(new Set(plain.out.trim().split('\n')).size).toBe(2)
  })

  it('--json prints one result per line', async () => {
    const r = await run(['--json', 'Sommerfest 2026', 'Weekly Engineering Sync'])
    const rows = r.out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { title: string; id: string; reason: string })
    expect(rows.map((x) => x.title)).toEqual(['Sommerfest 2026', 'Weekly Engineering Sync'])
    expect(rows[0]?.id).toBe(slug('Sommerfest 2026'))
    expect(rows[0]?.reason).toBe('base')
  })

  it('config flags', async () => {
    const t = 'Quarterly Sales Review Q3 2026'
    const r = await run(['--length', '24', '--mode', 'max', '--sep', '_', '--leak', 'minimal', t])
    expect(r.out.trim()).toBe(createSlugger({ length: 24, lengthMode: 'max', separator: '_', leak: 'minimal' }).slug(t))
    const none = await run(['--sep', 'none', t])
    expect(none.out.trim()).toBe(createSlugger({ separator: '' }).slug(t))
    const en = await run(['--lang', 'en', 'Die Casting Process'])
    expect(en.out.trim()).toBe(slug('Die Casting Process', { lang: 'en' }))
  })

  it('--secret-env reads the secret from the environment', async () => {
    const secret = 'cli-test-secret-0123456'
    const r = await run(['--leak', 'opaque', '--secret-env', 'SLUG_SECRET', 'Sommerfest 2026'], {
      env: { SLUG_SECRET: secret },
    })
    expect(r.code).toBe(0)
    expect(r.out.trim()).toBe(createSlugger({ leak: 'opaque', secret }).slug('Sommerfest 2026'))
    const missing = await run(['--secret-env', 'NOPE', 'x'])
    expect(missing.code).toBe(2)
    expect(missing.err).toContain('NOPE')
  })

  it('--lexicon and --deny read files', async () => {
    const lexicon = JSON.stringify([{ key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] }])
    const t = 'Kubernetes Cluster Upgrade Weber'
    const r = await run(['--lexicon', 'lex.json', '--deny', 'deny.txt', t], {
      files: { 'lex.json': lexicon, 'deny.txt': '# names\nWeber\n' },
    })
    const expected = createSlugger({ lexicon: JSON.parse(lexicon), denyTokens: ['Weber'] }).slug(t)
    expect(r.out.trim()).toBe(expected)
    expect(expected).toContain('k8s')
    const j = await run(['--deny', 'deny.json', t], { files: { 'deny.json': '["Weber"]' } })
    expect(j.out.trim()).toBe(createSlugger({ denyTokens: ['Weber'] }).slug(t))
    expect((await run(['--deny', 'deny.json', t], { files: { 'deny.json': '{}' } })).code).toBe(2)
    expect((await run(['--lexicon', 'missing.json', t])).err).toContain('cannot read')
    expect((await run(['--lexicon', 'bad.json', t], { files: { 'bad.json': '{' } })).err).toContain('not valid JSON')
    expect((await run(['--lexicon', 'obj.json', t], { files: { 'obj.json': '{}' } })).code).toBe(2)
    const invalid = await run(['--lexicon', 'l.json', t], { files: { 'l.json': '[{"key":"x","cls":"org"}]' } })
    expect(invalid.code).toBe(2)
    expect(invalid.err).toMatch(/^E_CONFIG: /)
  })

  it('--explain prints the trace, as text or JSON', async () => {
    const r = await run(['--explain', 'Jahresbericht Vertrieb Nord 2026'])
    expect(r.out).toMatch(/^semantic-slugger v1 \| length 16 exact/)
    expect(r.out).toContain('result      vertrieb-nord-26')
    const j = await run(['--explain', '--json', 'Jahresbericht Vertrieb Nord 2026'])
    const o = JSON.parse(j.out) as { result: { id: string }; steps: unknown[] }
    expect(o.result.id).toBe('vertrieb-nord-26')
    expect(o.steps.length).toBeGreaterThan(5)
    expect((await run(['--explain', '--unique', 'x'])).code).toBe(2)
  })

  it('--check, --help, --version and errors', async () => {
    expect(await run(['--check', 'vertrieb-nord-26'])).toMatchObject({ code: 0, out: 'valid\n' })
    expect(await run(['--check', 'Not An ID'])).toMatchObject({ code: 1, out: 'invalid\n' })
    expect(await run(['--help'])).toEqual({ code: 0, out: USAGE, err: '' })
    expect((await run(['-v'])).out).toBe('semantic-slugger 9.9.9 (algorithm 1)\n')
    expect((await run([])).code).toBe(2)
    expect((await run(['--bogus'])).code).toBe(2)
    expect((await run(['--length', 'abc', 'x'])).err).toContain('--length')
    expect((await run(['--length', '4', 'x'])).err).toMatch(/^E_CONFIG/)
    expect((await run(['--mode', 'fast', 'x'])).err).toContain('exact, max')
    expect((await run(['--lang', 'fr', 'x'])).err).toContain('--lang')
    expect((await run(['--leak', 'opaque', 'x'])).code).toBe(2)
  })
})

const bin = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))

describe.runIf(existsSync(bin))('built bin (dist/cli.js)', () => {
  it('runs with node and reads stdin', () => {
    const a = spawnSync(process.execPath, [bin, 'Jahresbericht Vertrieb Nord 2026'], { encoding: 'utf8' })
    expect(a.status).toBe(0)
    expect(a.stdout).toBe('vertrieb-nord-26\n')
    const b = spawnSync(process.execPath, [bin, '--unique'], {
      encoding: 'utf8',
      input: 'Sommerfest 2026\nSommerfest 2026\n',
    })
    expect(b.stdout.trim().split('\n')).toEqual(slugMany(['Sommerfest 2026', 'Sommerfest 2026']).map((x) => x.id))
    const v = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
    expect(v.stdout).toMatch(/^semantic-slugger \d+\.\d+\.\d+ \(algorithm 1\)\n$/)
  })
})
