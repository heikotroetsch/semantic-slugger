/**
 * The golden subset (SPEC 19.5): every `edge` fixture plus 60 content titles from all domains
 * (round robin over the domains, in fixture order). Default config, alone (empty store).
 * Written to `test/golden/v1.subset.json` by `pnpm test:update`; checked in Node by
 * `test/golden.test.ts` and in real browsers by `test/browser/golden.browser.test.ts`.
 */
import { slug } from '../../src/index.ts'
import { loadFixtures } from './corpus.ts'

export interface GoldenRow {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly slug: string
}

export const GOLDEN_CONTENT = 60

export function goldenSubset(): GoldenRow[] {
  const all = loadFixtures()
  const byKind = new Map<string, typeof all>()
  for (const f of all) {
    if (f.kind === 'edge') continue
    const list = byKind.get(f.kind) ?? []
    list.push(f)
    byKind.set(f.kind, list)
  }
  const picked = new Set<string>()
  for (let round = 0; picked.size < GOLDEN_CONTENT; round++) {
    let added = false
    for (const list of byKind.values()) {
      const f = list[round]
      if (f === undefined || picked.size >= GOLDEN_CONTENT) continue
      picked.add(f.id)
      added = true
    }
    if (!added) break
  }
  return all
    .filter((f) => f.kind === 'edge' || picked.has(f.id))
    .map((f) => ({ id: f.id, kind: f.kind, title: f.title, slug: slug(f.title) }))
}
