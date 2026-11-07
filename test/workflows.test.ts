/**
 * CI, release and Pages workflows (SPEC 18.4 to 18.6): actions pinned by commit SHA, the release gated
 * on CI and published with OIDC, Pages built from dist.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const wf = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
const files = ['ci.yml', 'release.yml', 'pages.yml']

describe('workflows', () => {
  it('pin every action by commit SHA', () => {
    for (const f of files) {
      const uses = [...wf(f).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1] ?? '')
      expect(uses.length, f).toBeGreaterThan(0)
      for (const u of uses) expect(u, `${f}: ${u}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/)
    }
  })

  it('ci runs lint, typecheck, tests on 22.18 and 24, browsers, package checks and smoke', () => {
    const ci = wf('ci.yml')
    expect(ci).toContain('permissions:\n  contents: read')
    for (const s of [
      'pnpm lint',
      'pnpm typecheck',
      'node: ["22.18", "24"]',
      'pnpm test --coverage',
      'playwright install --with-deps chromium firefox webkit',
      'pnpm test:browser',
      'git diff --exit-code package.json',
      'pnpm size',
      'pnpm smoke',
    ])
      expect(ci, s).toContain(s)
  })

  it('release runs only after a green ci push, on the tested commit, with OIDC', () => {
    const r = wf('release.yml')
    expect(r).toContain('workflow_run:\n    workflows: [ci]')
    expect(r).toContain(
      "github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'",
    )
    expect(r).toContain('ref: $' + '{{ github.event.workflow_run.head_sha }}')
    expect(r).toContain('id-token: write')
    expect(r).toContain('environment: npm')
    expect(r).toContain('publish-script: pnpm release')
    expect(r.replace(/#.*$/gm, '')).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|registry-url/)
  })

  it('pages copies the playground and the whole dist tree', () => {
    const p = wf('pages.yml')
    expect(p).toContain('pnpm build')
    expect(p).toContain('cp -R playground/. _site/')
    expect(p).toContain('cp -R dist _site/dist')
    expect(p).toContain('pages: write')
  })

  it('package.json is ready for a public release with provenance', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.license).toBe('MIT')
    expect(pkg.author).toBe('heikotroetsch')
    expect(pkg.repository).toEqual({ type: 'git', url: 'git+https://github.com/heikotroetsch/semantic-slugger.git' })
    expect(pkg.homepage).toBe('https://heikotroetsch.github.io/semantic-slugger/')
    expect(pkg.bugs).toBe('https://github.com/heikotroetsch/semantic-slugger/issues')
    // provenance comes from CI only (NPM_CONFIG_PROVENANCE): a hand publish has no OIDC provider
    expect(pkg.publishConfig).toEqual({ access: 'public' })
    expect(wf('release.yml')).toContain('NPM_CONFIG_PROVENANCE: "true"')
    expect(pkg.keywords).not.toContain('procurement')
    expect(pkg.dependencies).toEqual({})
    // no peer: the Prisma adapter imports nothing from @prisma/client
    expect(pkg.peerDependencies).toBeUndefined()
    // any pack or publish builds a fresh dist
    expect((pkg.scripts as Record<string, string>).prepack).toBe('pnpm build')
  })
})
