import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalJson,
  defaultConfig,
  fingerprint,
  type LexiconEntry,
  resolveConfig,
  type SluggerConfig,
} from '../../src/config.ts'
import { ConfigError, createSlugger, DEFAULTS, isSluggerError } from '../../src/index.ts'

const secret = 'config-test-secret-01'
const pack = (code: string) => ({ code, id: `${code}@1`, stopWords: ['le', 'la'], stem: (s: string) => s })

function reasonOf(cfg: unknown): string | undefined {
  try {
    resolveConfig(cfg as SluggerConfig)
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    expect(isSluggerError(e, 'E_CONFIG')).toBe(true)
    return (e as ConfigError).details?.reason
  }
  return undefined
}

describe('DEFAULTS', () => {
  it('is frozen and matches SPEC 16.2', () => {
    expect(Object.isFrozen(DEFAULTS)).toBe(true)
    expect(Object.isFrozen(DEFAULTS.languages)).toBe(true)
    expect(DEFAULTS).toMatchObject({
      length: 16,
      lengthMode: 'exact',
      separator: '-',
      maxSegments: 4,
      tailMin: 2,
      tailAlphabet: 'safe',
      consistentRungs: false,
      languages: ['de', 'en'],
      defaultLang: 'de',
      leak: 'normal',
      storeStems: 'plain',
      rarity: 'store',
      corpusSize: 1000,
      fallbackWord: 'doc',
      onEmpty: 'fallback',
      maxPlans: 16,
      maxAttempts: 8,
      maxScan: 64,
      maxInputLength: 4096,
      algorithm: 1,
    })
  })

  it('resolved default config is deep frozen and has the safe alphabet', () => {
    const c = defaultConfig()
    expect(Object.isFrozen(c)).toBe(true)
    expect(Object.isFrozen(c.blocklist.hard)).toBe(true)
    expect(c.tailFirst).toBe('bcdfghjkmnpqrstvwxyz')
    expect(c.tailAlphabet).toBe('bcdfghjkmnpqrstvwxyz23456789')
    expect(c.reserved).toContain('admin')
    expect(c.languagePacks).toEqual([])
    expect(Object.isFrozen(c.languagePacks)).toBe(true)
    expect(defaultConfig()).toBe(c)
  })
})

describe('ConfigError reasons', () => {
  it.each<[string, unknown]>([
    ['not-object', 'x'],
    ['not-object', [1]],
    ['not-object', null],
    ['unknown-key', { lenght: 16 }],
    ['unknown-key', JSON.parse('{"__proto__": {"length": 99}}')],
    ['not-integer', { length: 16.5 }],
    ['not-integer', { length: '16' }],
    ['out-of-range', { length: 7 }],
    ['out-of-range', { length: 65 }],
    ['out-of-range', { maxSegments: 0 }],
    ['out-of-range', { maxSegments: 6 }],
    ['out-of-range', { tailMin: 0 }],
    ['out-of-range', { length: 8, tailMin: 6 }],
    ['out-of-range', { maxPlans: 0 }],
    ['out-of-range', { maxAttempts: 0 }],
    ['out-of-range', { maxScan: 0 }],
    ['out-of-range', { maxInputLength: 0 }],
    ['out-of-range', { corpusSize: 0 }],
    ['invalid-enum', { lengthMode: 'min' }],
    ['invalid-enum', { separator: '.' }],
    ['invalid-enum', { leak: 'full' }],
    ['invalid-enum', { storeStems: 'raw' }],
    ['invalid-enum', { rarity: 'dynamic' }],
    ['invalid-enum', { onEmpty: 'ignore' }],
    ['unknown-language', { defaultLang: 'fr' }],
    ['not-string', { defaultLang: 1 }],
    ['not-boolean', { consistentRungs: 1 }],
    ['not-boolean', { consistentRungs: 'yes' }],
    // removed in rev 3 (SPEC 16.2)
    ['unknown-key', { domainStopWords: { add: ['vertrag'] } }],
    ['unknown-key', { weakWords: { add: ['bericht'] } }],
    ['unknown-key', { dropPersonNames: false }],
    ['not-function', { detectLanguage: 'de' }],
    ['not-function', { transliterate: {} }],
    ['invalid-languages', { languages: [] }],
    ['unknown-language', { languages: ['de', 'fr'] }],
    ['unknown-language', { languages: ['fr'] }],
    ['invalid-languages', { languages: 'de' }],
    ['invalid-languages', { languages: [1] }],
    ['default-lang-not-enabled', { languages: ['en'] }],
    ['invalid-list', { stopWords: ['a'] }],
    ['invalid-list', { stopWords: { add: 'a' } }],
    ['invalid-list', { stopWords: () => 'a' }],
    ['invalid-list', { blocklist: [] }],
    ['unknown-key', { stopWords: { add: [], drop: [] } }],
    ['unknown-key', { blocklist: { medium: { add: [] } } }],
    ['invalid-list-entry', { stopWords: { add: ['two words'] } }],
    ['invalid-list-entry', { reserved: { add: ['a-b'] } }],
    ['invalid-list-entry', { denyTokens: ['Müller-GmbH'] }],
    ['invalid-list', { denyTokens: 'x' }],
    ['not-string', { secret: 1234567890 }],
    ['secret-too-short', { secret: 'short' }],
    ['opaque-needs-secret', { leak: 'opaque' }],
    ['hashed-needs-secret', { storeStems: 'hashed' }],
    ['invalid-fallback-word', { fallbackWord: 'd' }],
    ['invalid-fallback-word', { fallbackWord: 'document1' }],
    ['invalid-fallback-word', { fallbackWord: 'Doc' }],
    ['invalid-fallback-word', { fallbackWord: 3 }],
    ['fallback-blocked', { fallbackWord: 'nazi' }],
    ['fallback-blocked', { fallbackWord: 'ss' }],
    ['fallback-blocked', { fallbackWord: 'anal' }],
    ['fallback-reserved', { fallbackWord: 'admin' }],
    ['fallback-too-long', { length: 8, fallbackWord: 'dokument' }],
    ['fallback-too-long', { length: 10, fallbackWord: 'dokument' }],
    ['alphabet-duplicate-char', { tailAlphabet: 'bbcdfghjkmnp' }],
    ['alphabet-invalid-char', { tailAlphabet: 'BCDFGHJKMNPQ' }],
    ['alphabet-forbidden-char', { tailAlphabet: 'bcdfghjkmnpa' }],
    ['alphabet-forbidden-char', { tailAlphabet: 'bcdfghjkmnp1' }],
    ['alphabet-forbidden-char', { tailAlphabet: 'bcdfghjkmnpl' }],
    ['alphabet-too-short', { tailAlphabet: 'bcdfghjkmn' }],
    ['alphabet-too-few-letters', { tailAlphabet: 'bcdfg23456789' }],
    ['not-string', { tailAlphabet: 5 }],
    ['invalid-lexicon', { lexicon: {} }],
    ['invalid-lexicon', { lexicon: [{ key: 'x' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'Strom', cls: 'topic' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'attr' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'org' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'doctype' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'year' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'acronym' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'topic', lang: 1 }] }],
    ['unknown-language', { lexicon: [{ key: 'strom', cls: 'topic', lang: 'fr' }] }],
    ['unknown-language', { languages: ['de'], lexicon: [{ key: 'strom', cls: 'topic', lang: 'en' }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'topic', group: 1 }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'strom', cls: 'topic', pair: 1 }] }],
    ['invalid-lexicon', { lexicon: [{ key: 'links', cls: 'direction', upperOnly: true, lowerOnly: true }] }],
    ['not-boolean', { lexicon: [{ key: 'eu', cls: 'region', upperOnly: 'yes' }] }],
    ['not-boolean', { lexicon: [{ key: 'links', cls: 'direction', lowerOnly: 1 }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'ticket', cls: 'marker' }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'ticket', cls: 'marker', abbr: [] }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'volume', cls: 'marker', abbr: ['vol'] }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'teil', cls: 'marker', abbr: ['teil'] }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'ticket', cls: 'marker', abbr: ['tickets'] }] }],
    ['invalid-marker-prefix', { lexicon: [{ key: 'ticket', cls: 'marker', abbr: ['tk1'] }] }],
    ['invalid-lexicon', { lexicon: ['strom'] }],
    ['invalid-list', { lexicon: [{ key: 'strom', cls: 'topic', abbr: 'st' }] }],
    ['out-of-range', { lexicon: [{ key: 'strom', cls: 'topic', weight: 101 }] }],
    ['invalid-enum', { lexicon: [{ key: 'strom', cls: 'topic', prior: 'often' }] }],
    ['not-boolean', { lexicon: [{ key: 'strom', cls: 'topic', weak: 1 }] }],
    ['unknown-key', { lexicon: [{ key: 'strom', cls: 'topic', color: 'red' }] }],
    ['invalid-algorithm', { algorithm: 2 }],
    // language packs (SPEC 6.7, minimal M1.5 validation)
    ['invalid-language-pack', { languagePacks: {} }],
    ['invalid-language-pack', { languagePacks: ['fr'] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), code: 'FR' }] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), code: 'fren' }] }],
    ['invalid-language-pack', { languagePacks: [pack('und')] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), id: '' }] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), stopWords: 'le' }] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), stopWords: [1] }] }],
    ['invalid-language-pack', { languagePacks: [{ ...pack('fr'), stem: 'x' }] }],
    ['invalid-language-pack', { languagePacks: [pack('fr'), pack('fr')] }],
    ['builtin-pack', { languagePacks: [pack('de')] }],
    ['builtin-pack', { languagePacks: [pack('en')] }],
  ])('%s: %j', (reason, cfg) => {
    expect(reasonOf(cfg)).toBe(reason)
  })

  it('details carry field and value; the secret value is hidden', () => {
    try {
      resolveConfig({ length: 99 })
    } catch (e) {
      expect((e as ConfigError).details).toEqual({ field: 'length', value: 99, reason: 'out-of-range' })
    }
    try {
      resolveConfig({ secret: 'short-secret' })
    } catch (e) {
      expect((e as ConfigError).details?.value).toBe('<hidden>')
    }
  })
})

describe('valid configs', () => {
  it('accepts every documented option', () => {
    const cfg = resolveConfig({
      length: 24,
      lengthMode: 'max',
      separator: '_',
      maxSegments: 5,
      tailMin: 3,
      tailAlphabet: 'strict',
      consistentRungs: true,
      languages: ['en', 'de', 'en'],
      defaultLang: 'en',
      detectLanguage: () => 'de',
      transliterate: (s) => s,
      stopWords: { add: ['Über', 'foo'], remove: ['bar'] },
      reserved: { remove: ['admin'], add: ['ADMIN2'] },
      blocklist: { hard: { add: ['B4dw0rd'] }, soft: { remove: ['butt'] } },
      lexicon: [
        {
          key: 'strom',
          cls: 'topic',
          lang: 'de',
          abbr: ['st'],
          known: [],
          weight: 10,
          prior: 'rare',
          part: true,
          group: 'energie',
        },
        { key: 'acme', lang: '*', cls: 'name', abbr: ['acm'] },
        { key: 'intern', cls: 'qualifier', lang: 'de', lowerOnly: true, pair: 'internal' },
        { key: 'eu', lang: '*', cls: 'region', upperOnly: true },
        { key: 'ticket', lang: '*', cls: 'marker', abbr: ['tkt'] },
      ],
      denyTokens: ['Fickenscher', 'Müller'],
      leak: 'opaque',
      secret,
      storeStems: 'hashed',
      rarity: 'static',
      corpusSize: 5000,
      fallbackWord: 'item',
      onEmpty: 'throw',
      maxPlans: 32,
      maxAttempts: 16,
      maxScan: 128,
      maxInputLength: 1000,
      algorithm: 1,
    })
    expect(cfg.languages).toEqual(['en', 'de'])
    expect(cfg.stopWords).toContain('foo')
    expect(cfg.stopWords).toContain('ueber')
    expect(cfg.stopWords).toContain('the') // built-in function words stay (SPEC 6.3)
    expect([...cfg.stopWords].sort()).toEqual(cfg.stopWords)
    expect(cfg.reserved).not.toContain('admin')
    expect(cfg.reserved).toContain('admin2')
    expect(cfg.blocklist.hard).toContain('badword') // normalized and leet-folded
    expect(cfg.blocklist.soft).not.toContain('butt')
    expect(cfg.denyTokens).toEqual(['fickenscher', 'mueller'])
    expect(cfg.tailFirst).toBe('kmqrtxy')
    expect(cfg.tailAlphabetName).toBe('strict')
    expect(cfg.lexicon[0]).toMatchObject({ key: 'strom', abbr: ['st'] })
    expect(cfg.lexicon[2]).toMatchObject({ key: 'intern', cls: 'qualifier', lowerOnly: true, pair: 'internal' })
    expect(cfg.lexicon[3]).toMatchObject({ key: 'eu', upperOnly: true })
    expect(Object.isFrozen(cfg.lexicon[0])).toBe(true)
    expect(cfg).not.toHaveProperty('domainStopWords')
    expect(cfg).not.toHaveProperty('weakWords')
    expect(cfg).not.toHaveProperty('dropPersonNames')
  })

  it('keeps the given language order', () => {
    expect(resolveConfig({ languages: ['en', 'de'] }).languages).toEqual(['en', 'de'])
    expect(resolveConfig({ languages: ['de', 'en'] }).languages).toEqual(['de', 'en'])
    expect(resolveConfig({ languages: ['en'], defaultLang: 'en' }).languages).toEqual(['en'])
  })

  it('accepts lexicon classes name, qualifier and marker with a valid prefix', () => {
    const entries: LexiconEntry[] = [
      { key: 'acme', lang: '*', cls: 'name' },
      { key: 'premium', lang: '*', cls: 'qualifier' },
      { key: 'ticket', lang: '*', cls: 'marker', abbr: ['tkt'] },
      { key: 'band', lang: '*', cls: 'marker', abbr: ['bd'] },
      { key: 'los', lang: 'de', cls: 'marker', abbr: ['los', 'l'] },
      { key: 'x', lang: '*', cls: 'marker', abbr: ['x'] },
    ]
    for (const e of entries) expect(resolveConfig({ lexicon: [e] }).lexicon[0]?.cls).toBe(e.cls)
  })

  it('languagePacks: enables pack codes, keeps order, copies and freezes the data', () => {
    const fr = { ...pack('fr'), lexicon: [{ key: 'chat', lang: 'fr', cls: 'topic' as const }] }
    const cfg = resolveConfig({
      languagePacks: [fr],
      languages: ['fr', 'de'],
      defaultLang: 'fr',
      lexicon: [{ key: 'velo', cls: 'topic', lang: 'fr' }],
    })
    expect(cfg.languages).toEqual(['fr', 'de'])
    expect(cfg.defaultLang).toBe('fr')
    expect(cfg.languagePacks).toHaveLength(1)
    expect(cfg.languagePacks[0]).toMatchObject({ code: 'fr', id: 'fr@1', stopWords: ['le', 'la'] })
    expect(cfg.languagePacks[0]?.stem('abc')).toBe('abc')
    expect(Object.isFrozen(cfg.languagePacks)).toBe(true)
    expect(Object.isFrozen(cfg.languagePacks[0]?.stopWords)).toBe(true)
    expect(Object.isFrozen(fr)).toBe(false) // the caller's object is not frozen
    expect(Object.isFrozen(fr.stopWords)).toBe(false)
    // a pack alone does not enable its language
    expect(reasonOf({ languagePacks: [pack('fr')], lexicon: [{ key: 'velo', cls: 'topic', lang: 'fr' }] })).toBe(
      'unknown-language',
    )
    expect(reasonOf({ languagePacks: [pack('fr')], defaultLang: 'fr' })).toBe('default-lang-not-enabled')
  })

  it('custom alphabet: first chars are the letters', () => {
    const cfg = resolveConfig({ tailAlphabet: 'bcdfghkmnp2345' })
    expect(cfg.tailAlphabetName).toBe('custom')
    expect(cfg.tailFirst).toBe('bcdfghkmnp')
    expect(cfg.tailAlphabet).toBe('bcdfghkmnp2345')
  })

  it('user lexicon entries default to lang "*"', () => {
    expect(resolveConfig({ lexicon: [{ key: 'strom', cls: 'topic' } as never] }).lexicon[0]?.lang).toBe('*')
  })

  it('ignores inherited (prototype) keys', () => {
    const proto = { length: 99, leak: 'opaque' }
    const cfg = resolveConfig(Object.create(proto) as SluggerConfig)
    expect(cfg.length).toBe(16)
    expect(cfg.leak).toBe('normal')
  })

  it('ignores a polluted Object.prototype', () => {
    const P = Object.prototype as Record<string, unknown>
    P.leak = 'opaque'
    P.length = 99
    try {
      const cfg = resolveConfig({ separator: '_' })
      expect(cfg.leak).toBe('normal')
      expect(cfg.length).toBe(16)
    } finally {
      delete P.leak
      delete P.length
    }
  })

  it('reads own keys of class instances', () => {
    class C {
      length = 20
    }
    expect(resolveConfig(new C() as SluggerConfig).length).toBe(20)
  })

  it('ignores non-enumerable own keys', () => {
    const o = {}
    Object.defineProperty(o, 'length', { value: 99, enumerable: false })
    expect(resolveConfig(o).length).toBe(16)
  })

  it('accepts a null-prototype object and undefined values', () => {
    const o = Object.assign(Object.create(null), { length: 20, secret: undefined })
    expect(resolveConfig(o).length).toBe(20)
  })

  it('does not let a list function mutate the defaults', () => {
    const cfg = resolveConfig({ reserved: (d) => d.filter((w) => w !== 'new') })
    expect(cfg.reserved).not.toContain('new')
    expect(resolveConfig().reserved).toContain('new')
    expect(() => resolveConfig({ reserved: (d) => (d as string[]).splice(0) })).toThrow(TypeError)
  })
})

describe('runtime check', () => {
  afterEach(() => vi.restoreAllMocks())

  it('throws runtime-no-normalize when normalize is broken', () => {
    vi.spyOn(String.prototype, 'normalize').mockImplementation(function (this: string) {
      return String(this)
    })
    expect(reasonOf({})).toBe('runtime-no-normalize')
  })
})

describe('fingerprint', () => {
  it('is 16 hex chars, stable, and changes with output-relevant config', () => {
    const a = createSlugger().fingerprint
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(createSlugger({}).fingerprint).toBe(a)
    expect(createSlugger({ length: 16 }).fingerprint).toBe(a) // same resolved config
    expect(createSlugger({ length: 20 }).fingerprint).not.toBe(a)
    expect(createSlugger({ blocklist: { hard: { add: ['zzq'] } } }).fingerprint).not.toBe(a)
  })

  it('records language pack code, id and data', () => {
    const base = { languages: ['de', 'en', 'fr'] }
    const a = createSlugger({ ...base, languagePacks: [pack('fr')] }).fingerprint
    expect(a).not.toBe(createSlugger().fingerprint)
    expect(createSlugger({ ...base, languagePacks: [pack('fr')] }).fingerprint).toBe(a)
    expect(createSlugger({ ...base, languagePacks: [{ ...pack('fr'), id: 'fr@2' }] }).fingerprint).not.toBe(a)
    expect(createSlugger({ ...base, languagePacks: [{ ...pack('fr'), stopWords: ['le'] }] }).fingerprint).not.toBe(a)
    expect(
      createSlugger({ ...base, languagePacks: [{ ...pack('fr'), stem: (s: string) => s.trim() }] }).fingerprint,
    ).toBe(a) // functions are recorded as "fn": change `id` when `stem` changes
  })

  it('records functions as "fn"', () => {
    const f1 = createSlugger({ transliterate: (s) => s }).fingerprint
    const f2 = createSlugger({ transliterate: (s) => s.trim() }).fingerprint
    expect(f1).toBe(f2)
    expect(f1).not.toBe(createSlugger().fingerprint)
  })

  it('does not contain the secret in plain form, but changes with it', () => {
    const cfg = resolveConfig({ secret })
    const a = fingerprint(cfg)
    expect(a).not.toBe(fingerprint(resolveConfig({ secret: `${secret}-x` })))
    expect(a).not.toBe(fingerprint(resolveConfig()))
  })

  it('canonicalJson sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: [1, undefined, 'x'], c: undefined, d: () => 1, e: null })).toBe(
      '{"a":[1,null,"x"],"b":1,"d":"fn","e":null}',
    )
  })
})

describe('createSlugger', () => {
  it('returns a frozen instance', () => {
    const s = createSlugger({ length: 20 })
    expect(Object.isFrozen(s)).toBe(true)
    expect(s.config.length).toBe(20)
  })
})
