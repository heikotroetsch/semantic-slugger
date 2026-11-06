/**
 * Recipe: software (SPEC 15.8). Documentation only: not in the package.
 * The README shows this file; `test/recipes.test.ts` checks the outputs below.
 */
import { createSlugger, type SluggerConfig } from '../../src/index.ts'

export const softwareConfig: SluggerConfig = {
  lexicon: [
    { key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] },
    { key: 'epic', lang: 'en', cls: 'topic', weak: true },
  ],
  reserved: { add: ['tickets', 'board'] },
}

export const software = createSlugger(softwareConfig)

/** Title -> ID with this config, alone (no store). */
export const softwareExamples: Readonly<Record<string, string>> = {
  'Kubernetes Cluster Upgrade Q3 2026': 'k8s-cluster-26q3',
  'Epic: Kubernetes Monitoring Dashboard': 'kubernetes-monit',
}
