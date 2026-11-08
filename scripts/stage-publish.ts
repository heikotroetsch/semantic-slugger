/**
 * Release step of `.github/workflows/release.yml` (run by changesets/action as `pnpm release`).
 *
 * The npm trusted publisher of this package allows only `npm stage publish`: CI uploads the version
 * through OIDC, and a maintainer approves it with 2FA (`npm stage approve <id>` or on npmjs.com).
 *
 * The step is idempotent. It does nothing when the version is already on npm, or when its git tag
 * exists (the tag is set right after a staging, so a pending approval is not staged twice).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string; version: string }
const spec = `${pkg.name}@${pkg.version}`
const tag = `v${pkg.version}`

function quiet(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

if (quiet('npm', ['view', spec, 'version']) === pkg.version) {
  console.log(`${spec} is already on npm. Nothing to stage.`)
  process.exit(0)
}
if (quiet('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) {
  console.log(`Tag ${tag} exists, so ${spec} is already staged and waits for approval. Nothing to do.`)
  process.exit(0)
}

const prerelease = pkg.version.includes('-')
const args = ['stage', 'publish', '--access', 'public', ...(prerelease ? ['--tag', 'next'] : [])]
execFileSync('npm', args, { stdio: 'inherit' })

execFileSync('git', ['tag', tag], { stdio: 'inherit' })
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' })

console.log(`\nStaged ${spec} and pushed tag ${tag}.`)
console.log('Approve it on npmjs.com (package > Staged) or run: npm stage list, then npm stage approve <id>')
