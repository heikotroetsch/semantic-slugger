/**
 * Serve the playground locally (SPEC 18.7) with the same paths as GitHub Pages: `/` is `playground/`,
 * `/dist/` is the built package. `pnpm playground` builds first. Port: `PORT` or 5173.
 */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileFor } from './lib/playground.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

const port = Number(process.env.PORT ?? 5173)
createServer(async (req, res) => {
  const file = fileFor(root, req.url ?? '/')
  if (file === null) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => {
  console.log(`playground on http://localhost:${port}/ (Ctrl+C to stop)`)
})
