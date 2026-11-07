/**
 * Timing gates are tuned on a fast dev machine. CI runners are slower and run with coverage, so the
 * bounds are scaled there. Set PERF_FACTOR to override.
 */
export const PERF = Number(process.env.PERF_FACTOR ?? (process.env.CI ? 4 : 1))
