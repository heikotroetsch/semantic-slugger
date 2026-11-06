/**
 * The CLI logic (SPEC 18.8). Node only, but all I/O goes through `CliIo`, so tests can run it in
 * process. `src/cli.ts` wires it to the real process.
 */

import { parseArgs } from 'node:util'
import type { LexiconEntry, SluggerConfig } from '../config.ts'
import { isSluggerError } from '../errors.ts'
import { ALGORITHM_VERSION, createSlugger, type Slugger } from '../index.ts'

export interface CliIo {
  readonly argv: readonly string[]
  /** All of stdin, or null when stdin is a terminal (no piped input). */
  readonly readStdin: () => Promise<string | null>
  readonly readFile: (path: string) => string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly out: (text: string) => void
  readonly err: (text: string) => void
  readonly version: string
}

export const USAGE = `Usage: semantic-slugger [options] [title ...]

Makes a short, readable, unique ID from each title. Titles come from the arguments,
or one per line from stdin when there are no arguments.

Options:
  --length <n>        ID length, 8 to 64 (default 16)
  --mode <m>          exact | max (default exact)
  --sep <s>           - | _ | none (default -)
  --leak <l>          normal | minimal | opaque (default normal; opaque needs --secret-env)
  --lang <code>       language of the titles (de, en); default: detect per title
  --secret-env <VAR>  read the secret from this environment variable
  --lexicon <file>    JSON array of lexicon entries (your own words and short forms)
  --deny <file>       words that must never show: JSON array, or one word per line
  --unique            IDs are unique within the batch
  --json              one JSON result per line
  --explain           show every step of the pipeline
  --check <id>        exit 0 when <id> is a valid ID for this config, else 1
  -v, --version       show the version
  -h, --help          show this help

Examples:
  semantic-slugger "Chocolate Cake Recipe"
  semantic-slugger --explain --length 20 "Quarterly Sales Review Q3 2026"
  cat titles.txt | semantic-slugger --unique --json
`

class UsageError extends Error {}

function parseLength(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  // no regex literals in src/ outside the ReDoS registry (SPEC 4.3)
  if (v.length < 1 || v.length > 3 || [...v].some((c) => c < '0' || c > '9'))
    throw new UsageError(`--length must be a number, got "${v}"`)
  return Number(v)
}

function oneOf<T extends string>(flag: string, v: string | undefined, allowed: readonly T[]): T | undefined {
  if (v === undefined) return undefined
  if (!(allowed as readonly string[]).includes(v))
    throw new UsageError(`--${flag} must be one of ${allowed.join(', ')}, got "${v}"`)
  return v as T
}

function readJson(io: CliIo, flag: string, path: string): unknown {
  let text: string
  try {
    text = io.readFile(path)
  } catch {
    throw new UsageError(`--${flag}: cannot read ${path}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new UsageError(`--${flag}: ${path} is not valid JSON`)
  }
}

function readDeny(io: CliIo, path: string): string[] {
  if (path.endsWith('.json')) {
    const v = readJson(io, 'deny', path)
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
      throw new UsageError('--deny: the JSON file must hold an array of strings')
    return v
  }
  let text: string
  try {
    text = io.readFile(path)
  } catch {
    throw new UsageError(`--deny: cannot read ${path}`)
  }
  return splitLines(text).filter((l) => !l.startsWith('#'))
}

/** Non-empty trimmed lines (`\n` or `\r\n`). */
function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

/** Run the CLI. Returns the exit code: 0 ok, 1 `--check` failed, 2 usage or config error. */
export async function main(io: CliIo): Promise<number> {
  let values: Record<string, string | boolean | undefined>
  let positionals: string[]
  try {
    const parsed = parseArgs({
      args: [...io.argv],
      options: {
        length: { type: 'string' },
        mode: { type: 'string' },
        sep: { type: 'string' },
        leak: { type: 'string' },
        lang: { type: 'string' },
        'secret-env': { type: 'string' },
        lexicon: { type: 'string' },
        deny: { type: 'string' },
        unique: { type: 'boolean' },
        json: { type: 'boolean' },
        explain: { type: 'boolean' },
        check: { type: 'string' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
      strict: true,
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch (e) {
    io.err(`${(e as Error).message}\n\n${USAGE}`)
    return 2
  }
  if (values.help === true) {
    io.out(USAGE)
    return 0
  }
  if (values.version === true) {
    io.out(`semantic-slugger ${io.version} (algorithm ${ALGORITHM_VERSION})\n`)
    return 0
  }

  let slugger: Slugger
  let lang: string | undefined
  try {
    const cfg: SluggerConfig = {}
    const length = parseLength(values.length as string | undefined)
    if (length !== undefined) cfg.length = length
    const mode = oneOf('mode', values.mode as string | undefined, ['exact', 'max'] as const)
    if (mode !== undefined) cfg.lengthMode = mode
    const sep = oneOf('sep', values.sep as string | undefined, ['-', '_', 'none', ''] as const)
    if (sep !== undefined) cfg.separator = sep === 'none' ? '' : sep
    const leak = oneOf('leak', values.leak as string | undefined, ['normal', 'minimal', 'opaque'] as const)
    if (leak !== undefined) cfg.leak = leak
    const secretVar = values['secret-env'] as string | undefined
    if (secretVar !== undefined) {
      const secret = io.env[secretVar]
      if (secret === undefined || secret === '')
        throw new UsageError(`--secret-env: environment variable ${secretVar} is not set`)
      cfg.secret = secret
    }
    const lexPath = values.lexicon as string | undefined
    if (lexPath !== undefined) {
      const lex = readJson(io, 'lexicon', lexPath)
      if (!Array.isArray(lex)) throw new UsageError('--lexicon: the JSON file must hold an array of entries')
      cfg.lexicon = lex as LexiconEntry[]
    }
    const denyPath = values.deny as string | undefined
    if (denyPath !== undefined) cfg.denyTokens = readDeny(io, denyPath)
    lang = values.lang as string | undefined
    slugger = createSlugger(cfg)
    if (lang !== undefined && !slugger.config.languages.includes(lang))
      throw new UsageError(`--lang must be one of ${slugger.config.languages.join(', ')}, got "${lang}"`)
  } catch (e) {
    io.err(`${errorText(e)}\n`)
    return 2
  }

  const check = values.check as string | undefined
  if (check !== undefined) {
    const ok = slugger.isValid(check)
    io.out(`${ok ? 'valid' : 'invalid'}\n`)
    return ok ? 0 : 1
  }

  let titles = positionals
  if (titles.length === 0) {
    const input = await io.readStdin()
    if (input === null) {
      io.err(USAGE)
      return 2
    }
    titles = splitLines(input)
  }
  if (values.unique === true && values.explain === true) {
    io.err('--unique and --explain cannot be used together\n')
    return 2
  }

  const opts = lang === undefined ? {} : { lang }
  const json = values.json === true
  try {
    if (values.explain === true) {
      const texts = titles.map((t) => {
        const e = slugger.explain(t, opts)
        return json ? JSON.stringify(e) : e.toString()
      })
      io.out(`${texts.join(json ? '\n' : '\n\n')}\n`)
      return 0
    }
    const results =
      values.unique === true ? slugger.slugMany(titles, opts) : titles.map((t) => slugger.suggest(t, opts))
    const lines = results.map((r, i) => (json ? JSON.stringify({ title: titles[i], ...r }) : r.id))
    if (lines.length > 0) io.out(`${lines.join('\n')}\n`)
    return 0
  } catch (e) {
    io.err(`${errorText(e)}\n`)
    return 2
  }
}

function errorText(e: unknown): string {
  if (e instanceof UsageError) return e.message
  if (isSluggerError(e)) return `${e.code}: ${e.message}`
  return e instanceof Error ? e.message : String(e)
}
