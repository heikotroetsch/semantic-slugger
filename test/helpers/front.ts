import { type ResolvedConfig, resolveConfig, type SluggerConfig } from '../../src/config.ts'
import { analyzeFront, type Front, keptTokens } from '../../src/core/analyze.ts'
import type { Tok } from '../../src/core/tokenize.ts'

const base = resolveConfig()
const cache = new Map<string, ResolvedConfig>()

/** Resolved config for a test (cached by JSON, functions are not cached). */
export function cfgOf(config?: SluggerConfig): ResolvedConfig {
  if (config === undefined) return base
  const k = JSON.stringify(config)
  if (k.includes('"fn"') || Object.values(config).some((v) => typeof v === 'function')) return resolveConfig(config)
  let c = cache.get(k)
  if (!c) {
    c = resolveConfig(config)
    cache.set(k, c)
  }
  return c
}

/** Run steps 1 to 6 on a title. */
export function front(title: string, config?: SluggerConfig, lang?: string): Front {
  return analyzeFront(title, cfgOf(config), lang === undefined ? {} : { lang })
}

/** Kept tokens as `ascii:cls` (words: `ascii:role`), for compact assertions. */
export function kept(title: string, config?: SluggerConfig, lang?: string): string[] {
  return keptTokens(front(title, config, lang)).map(show)
}

export function show(t: Tok): string {
  if (t.cls === 'word') return `${t.ascii}:${t.role ?? 'topic'}${t.weak ? '~weak' : ''}`
  return `${t.key ?? t.ascii}:${t.cls}`
}

/** The kept token with this ascii text. */
export function tok(title: string, ascii: string, config?: SluggerConfig): Tok | undefined {
  return front(title, config).tokens.find((t) => t.ascii === ascii)
}
