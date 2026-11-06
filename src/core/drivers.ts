/**
 * Drivers run the sans-IO resolver generators (SPEC 13.4). The sync driver gives tier 'none' without
 * `taken` and tier 'A' with `taken`; `driveWith` takes any answer function. The async store driver
 * follows in M5.
 */

import type { StoreTier } from '../result.ts'
import type { AnyAnswer, Req } from './resolve.ts'

export type Taken = ReadonlySet<string> | ((id: string) => boolean)

function answerSync(req: Req, taken: Taken | undefined): AnyAnswer {
  if (req.op !== 'exists') return null
  if (!taken) return new Set<string>()
  const isTaken = typeof taken === 'function' ? taken : (id: string) => taken.has(id)
  return new Set(req.ids.filter((id) => isTaken(id)))
}

export function driveSync<T>(gen: Generator<Req, T, AnyAnswer>, taken?: Taken): { out: T; tier: StoreTier } {
  let step = gen.next()
  while (!step.done) step = gen.next(answerSync(step.value, taken))
  return { out: step.value, tier: taken ? 'A' : 'none' }
}

/** Run a resolver generator with an answer function (tests, tools and the sync store of the report). */
export function driveWith<T>(gen: Generator<Req, T, AnyAnswer>, answer: (req: Req) => AnyAnswer): T {
  let step = gen.next()
  while (!step.done) step = gen.next(answer(step.value))
  return step.value
}
