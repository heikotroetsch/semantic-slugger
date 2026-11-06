import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/browser/**', 'test/smoke/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: {
        'src/core/**': { lines: 90 },
        'src/hash/**': { lines: 90 },
        'src/adapters/**': { lines: 90 },
      },
    },
  },
})
