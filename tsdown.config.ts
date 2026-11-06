import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'adapters/memory': 'src/adapters/memory.ts',
      'adapters/prisma': 'src/adapters/prisma.ts',
      'adapters/sql': 'src/adapters/sql.ts',
      data: 'src/data/index.ts',
    },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    exports: true,
    sourcemap: true,
    clean: false, // cleaning is the prebuild step
    publint: true,
    attw: { profile: 'node16', level: 'error' },
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: false,
    fixedExtension: false, // emits dist/cli.js, the bin path
    banner: { js: '#!/usr/bin/env node' },
  },
])
