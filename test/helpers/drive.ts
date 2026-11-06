import type { AnyAnswer, Req } from '../../src/core/resolve.ts'

/** Test driver: a fake store with optional body counts (tier B) and a taken set. Records requests. */
export function drive<T>(
  gen: Generator<Req, T, AnyAnswer>,
  store: { counts?: ReadonlyMap<string, number>; taken?: ReadonlySet<string> },
): { out: T; reqs: Req[] } {
  const reqs: Req[] = []
  let step = gen.next()
  while (!step.done) {
    const req = step.value
    reqs.push(req)
    let ans: AnyAnswer = null
    if (req.op === 'countBodies') {
      const counts = store.counts
      ans = counts ? new Map(req.bodies.map((b) => [b, counts.get(b) ?? 0])) : null
    } else if (req.op === 'exists') ans = new Set(req.ids.filter((id) => store.taken?.has(id)))
    step = gen.next(ans)
  }
  return { out: step.value, reqs }
}
