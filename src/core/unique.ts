/**
 * Unique-violation check for `createUnique` (SPEC 13.5, 16.1): Prisma `P2002`, Postgres `23505` and the
 * memory store conflict. Looks at the error and up to three levels of `cause` (wrapped driver errors).
 */

import { MEMORY_CONFLICT } from './memory.ts'
import { RE_NON_ALNUM_RUN } from './regexes.ts'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null

/** Field names a unique error names, or undefined when the error does not say. */
function targetsOf(e: Obj): string[] | undefined {
  const out: string[] = []
  let known = false
  const push = (v: unknown): void => {
    if (typeof v === 'string') {
      known = true
      out.push(v)
    } else if (Array.isArray(v)) {
      known = true
      for (const x of v) if (typeof x === 'string') out.push(x)
    }
  }
  const meta = e.meta
  if (isObj(meta)) {
    push(meta.target)
    const dae = meta.driverAdapterError
    if (isObj(dae) && isObj(dae.cause) && isObj(dae.cause.constraint)) push(dae.cause.constraint.fields)
  }
  push(e.constraint) // pg: constraint name
  // pg: detail "Key (scope, slug)=(...) already exists."
  if (typeof e.detail === 'string' && e.detail.startsWith('Key (')) {
    const end = e.detail.indexOf(')')
    if (end > 5)
      push(
        e.detail
          .slice(5, end)
          .split(',')
          .map((s) => s.split('"').join('').trim()),
      )
  }
  return known ? out : undefined
}

function matchesField(e: Obj, field: string | undefined): boolean {
  if (field === undefined) return true
  const t = targetsOf(e)
  if (t === undefined) return true // the error does not name its fields: accept
  const f = field.toLowerCase()
  return t.some((x) => x === field || x.toLowerCase().split(RE_NON_ALNUM_RUN).includes(f))
}

/**
 * true for a unique violation: Prisma `P2002` (optionally on `field`), Postgres `23505` (optionally on
 * `field`, by constraint name or detail), or the memory store conflict.
 */
export function isUniqueViolation(e: unknown, field?: string): boolean {
  let cur: unknown = e
  for (let depth = 0; depth < 4 && isObj(cur); depth++) {
    const code = cur.code
    if (code === MEMORY_CONFLICT) return true
    if (code === 'P2002' || code === '23505') return matchesField(cur, field)
    cur = cur.cause
  }
  return false
}
