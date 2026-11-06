/**
 * semantic-slugger CLI (SPEC 18.8). Node only. The full CLI follows in M7.
 */

import { parseArgs } from 'node:util'
import { ALGORITHM_VERSION, isValidSlug } from './index.ts'

const usage = `Usage: semantic-slugger [--help] [--check <id>]

  --check <id>   exit 0 when <id> is a valid ID for the default config, else 1
  --help         show this help

ID generation from titles is not available yet in this version.
Algorithm version: ${ALGORITHM_VERSION}
`

const { values } = parseArgs({
  options: { help: { type: 'boolean', short: 'h' }, check: { type: 'string' } },
  allowPositionals: true,
})

if (values.check !== undefined) {
  const ok = isValidSlug(values.check)
  process.stdout.write(`${ok ? 'valid' : 'invalid'}\n`)
  process.exitCode = ok ? 0 : 1
} else {
  process.stdout.write(usage)
  process.exitCode = values.help ? 0 : 2
}
