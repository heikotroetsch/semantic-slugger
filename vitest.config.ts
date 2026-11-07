import { defineConfig } from 'vitest/config'

const exclude = ['test/browser/**', 'test/smoke/**', 'node_modules/**']

export default defineConfig({
  test: {
    // CI runners are slower and run with coverage; the property tests need more than the 5 s default there.
    testTimeout: process.env.CI ? 60_000 : 5_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/cli/**'],
      thresholds: {
        'src/core/**': { lines: 90 },
        'src/hash/**': { lines: 90 },
        'src/adapters/**': { lines: 90 },
      },
    },
    // The PGlite integration tests run after the other tests, so their CPU load does not disturb the
    // timing gates of the unit tests (fit worst case, ReDoS harness).
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: [...exclude, 'test/integration/**'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'integration', include: ['test/integration/**/*.test.ts'], exclude, sequence: { groupOrder: 1 } },
      },
    ],
  },
})
