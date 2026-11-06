import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// SPEC 19.5: the golden subset in real browsers. `BROWSERS=chromium pnpm test:browser` runs a subset.
const all = ['chromium', 'firefox', 'webkit'] as const
type Name = (typeof all)[number]
const pick = (process.env.BROWSERS ?? all.join(','))
  .split(',')
  .map((b) => b.trim())
  .filter((b): b is Name => (all as readonly string[]).includes(b))

export default defineConfig({
  test: {
    include: ['test/browser/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: pick.map((browser) => ({ browser })),
    },
  },
})
