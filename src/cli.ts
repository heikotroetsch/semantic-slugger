/**
 * semantic-slugger CLI (SPEC 18.8). Node only; the logic is in `src/cli/main.ts`.
 */

import { readFileSync } from 'node:fs'
import { main } from './cli/main.ts'

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY === true) return null
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

process.exitCode = await main({
  argv: process.argv.slice(2),
  readStdin,
  readFile: (p) => readFileSync(p, 'utf8'),
  env: process.env,
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  version: packageVersion(),
})
