/**
 * Package smoke test (SPEC 18.3, 19.5). Run after `pnpm build`: `pnpm smoke`.
 *
 * 1. `dist/cli.js` exists, starts with the shebang, and `bin` points to it.
 * 2. `dist/index.js.map` has a non-empty `sourcesContent`.
 * 3. `pnpm pack`, then install the tarball with npm into copies of the four fixtures in
 *    `test/smoke/` (ESM Node, CJS require, TS node16, TS bundler). Each runs
 *    `slug('Jahresbericht Vertrieb Nord 2026')` and compares it to the golden value.
 * 4. Run the installed bin (`npx semantic-slugger "..."` and `--json`) and check the output.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slug } from '../src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const TITLE = 'Jahresbericht Vertrieb Nord 2026'
const GOLDEN = 'vertrieb-nord-26'
const win = process.platform === 'win32'

function fail(msg: string): never {
  console.error(`smoke: ${msg}`)
  process.exit(1)
}

function check(ok: boolean, msg: string): void {
  if (!ok) fail(msg)
  console.log(`ok  ${msg}`)
}

function run(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: win })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string }
    fail(`${cmd} ${args.join(' ')} failed in ${cwd}\n${err.stdout ?? ''}${err.stderr ?? err.message}`)
  }
}

// 1 + 2: dist checks
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  bin: Record<string, string>
  version: string
}
const cliPath = join(root, 'dist', 'cli.js')
check(existsSync(cliPath), 'dist/cli.js exists')
check(readFileSync(cliPath, 'utf8').startsWith('#!/usr/bin/env node\n'), 'dist/cli.js starts with the shebang')
check(pkg.bin['semantic-slugger'] === 'dist/cli.js', 'bin points to dist/cli.js (the form npm stores)')
const map = JSON.parse(readFileSync(join(root, 'dist', 'index.js.map'), 'utf8')) as { sourcesContent?: string[] }
check(
  Array.isArray(map.sourcesContent) && map.sourcesContent.length > 0 && map.sourcesContent.every((s) => s.length > 0),
  'dist/index.js.map has sourcesContent',
)
check(slug(TITLE) === GOLDEN, `src gives the golden value ${GOLDEN}`)

// 3: pack and install
const work = mkdtempSync(join(tmpdir(), 'semantic-slugger-smoke-'))
try {
  run('pnpm', ['pack', '--pack-destination', work], root)
  const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'))
  if (tgz === undefined) fail('pnpm pack wrote no tarball')
  const tarball = join(work, tgz)
  check(tgz === `semantic-slugger-${pkg.version}.tgz`, `packed ${tgz}`)
  const listing = run('tar', ['-tzf', tarball], work).split('\n')
  check(listing.includes('package/dist/cli.js'), 'tarball holds dist/cli.js')
  check(listing.includes('package/NOTICE') && listing.includes('package/LICENSE'), 'tarball holds NOTICE and LICENSE')
  check(
    !listing.some((f) => f.startsWith('package/src/') || f.startsWith('package/test/')),
    'tarball has no src or test',
  )

  const fixtures: { name: string; cmd: (dir: string) => [string, string[]][] }[] = [
    { name: 'esm-node', cmd: () => [['node', ['index.js', GOLDEN]]] },
    { name: 'cjs-node', cmd: () => [['node', ['index.cjs', GOLDEN]]] },
    {
      name: 'ts-node16',
      cmd: () => [
        ['node', [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.']],
        ['node', ['index.ts', GOLDEN]],
      ],
    },
    {
      name: 'ts-bundler',
      cmd: () => [
        ['node', [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.']],
        ['node', ['index.ts', GOLDEN]],
      ],
    },
  ]
  for (const f of fixtures) {
    const dir = join(work, f.name)
    cpSync(join(root, 'test', 'smoke', f.name), dir, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.endsWith('package-lock.json'),
    })
    run('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error', tarball], dir)
    for (const [cmd, args] of f.cmd(dir)) run(cmd, args, dir)
    check(true, `${f.name}: slug() gives ${GOLDEN}`)
  }

  // 4: the installed bin
  const esm = join(work, 'esm-node')
  const out = run('npx', ['--no', '--', 'semantic-slugger', TITLE], esm)
  check(out === `${GOLDEN}\n`, `npx semantic-slugger "${TITLE}" prints ${GOLDEN}`)
  const json = JSON.parse(run('npx', ['--no', '--', 'semantic-slugger', '--json', TITLE], esm)) as {
    id: string
    title: string
  }
  check(json.id === GOLDEN && json.title === TITLE, 'npx semantic-slugger --json prints the result')
  const version = run('npx', ['--no', '--', 'semantic-slugger', '--version'], esm)
  check(version.startsWith(`semantic-slugger ${pkg.version} `), `bin --version shows ${pkg.version}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
console.log('smoke: all checks passed')
