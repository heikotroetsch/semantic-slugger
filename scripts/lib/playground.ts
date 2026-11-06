/**
 * Path mapping of the local playground server (SPEC 18.7): the same paths as GitHub Pages, where
 * `playground/*` is the site root and the whole `dist/` tree is `/dist/`.
 */
import { normalize, sep } from 'node:path'

/** Map a URL path to a file under `root`, or null when it leaves the allowed folder. */
export function fileFor(root: string, urlPath: string): string | null {
  let p: string
  try {
    p = decodeURIComponent(urlPath.split('?')[0] ?? '/')
  } catch {
    return null
  }
  if (p.endsWith('/')) p += 'index.html'
  const inDist = p.startsWith('/dist/')
  const base = inDist ? normalize(`${root}${sep}dist${sep}`) : normalize(`${root}${sep}playground${sep}`)
  const file = normalize(base + (inDist ? p.slice('/dist/'.length) : p.slice(1)))
  return file.startsWith(base) ? file : null
}
