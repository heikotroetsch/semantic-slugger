import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config.ts'
import { assertInvariants, invariantFailure, patternFor } from '../../src/core/invariants.ts'
import { isSluggerError } from '../../src/errors.ts'
import { createSlugger, isValidSlug } from '../../src/index.ts'

const exact = resolveConfig()
const max = resolveConfig({ lengthMode: 'max' })
const joined = resolveConfig({ separator: '' })
const secret = 'test-secret-0123456789'

describe('patterns (I2)', () => {
  it('per separator', () => {
    expect(patternFor('-').test('strom-rv-nord-26')).toBe(true)
    expect(patternFor('-').test('strom--rv')).toBe(false)
    expect(patternFor('-').test('strom-rv-')).toBe(false)
    expect(patternFor('_').test('strom_rv_nord_26')).toBe(true)
    expect(patternFor('_').test('strom-rv')).toBe(false)
    expect(patternFor('').test('stromrvnord26')).toBe(true)
    expect(patternFor('').test('strom-rv')).toBe(false)
    expect(patternFor('-').test('2strom')).toBe(false)
  })
})

describe('invariantFailure', () => {
  it('the opaque example of SPEC 2.1 folds to a blocked short code (4 -> a gives "ah")', () => {
    expect(
      invariantFailure('x7kq2m9dbn4hc8wt', '', 'x7kq2m9dbn4hc8wt', resolveConfig({ leak: 'opaque', secret })),
    ).toBe('I6')
  })

  it('accepts good IDs', () => {
    expect(invariantFailure('strom-rv-nord-26', 'strom-rv-nord-26', '', exact)).toBeNull()
    expect(invariantFailure('doc-k7q9m3xdt2hz', 'doc', 'k7q9m3xdt2hz', exact)).toBeNull()
    expect(
      invariantFailure('x7kq2m9dbn3hc8wt', '', 'x7kq2m9dbn3hc8wt', resolveConfig({ leak: 'opaque', secret })),
    ).toBeNull()
    expect(invariantFailure('strom-k3', 'strom', 'k3', max)).toBeNull()
    expect(invariantFailure('docbnz', 'doc', 'bnz', resolveConfig({ separator: '', lengthMode: 'max' }))).toBeNull()
  })

  it('shape: id must be body + sep + tail', () => {
    expect(invariantFailure('strom-k3', 'strom', 'k4', max)).toBe('shape')
    expect(invariantFailure('strom-k3', 'strom', 'k3', max, [{ text: 'stro', verbatim: true }])).toBe('shape')
  })

  it('I1 length', () => {
    expect(invariantFailure('strom-rv-nord', 'strom-rv-nord', '', exact)).toBe('I1')
    expect(invariantFailure('strom-rv-nord-2026', 'strom-rv-nord-2026', '', max)).toBe('I1')
  })

  it('I2 pattern', () => {
    expect(invariantFailure('strom_rv_nord_26', 'strom_rv_nord_26', '', exact)).toBe('I2')
    expect(invariantFailure('Strom-rv', 'Strom-rv', '', max)).toBe('I2')
  })

  it('I3/I4: first char letter, not all digits', () => {
    expect(invariantFailure('2026-strom', '2026-strom', '', max)).toBe('I2')
    // I2 already catches a digit first; I3 and I4 stay as separate checks for clarity
    expect(invariantFailure('26', '26', '', max)).toBe('I2')
  })

  it('I5 tail alphabet and first char', () => {
    expect(invariantFailure('strom-2k', 'strom', '2k', max)).toBe('I5')
    expect(invariantFailure('strom-ka', 'strom', 'ka', max)).toBe('I5')
    expect(
      invariantFailure('strom-k2', 'strom', 'k2', resolveConfig({ lengthMode: 'max', tailAlphabet: 'strict' })),
    ).toBe('I5')
  })

  it('I6 blocklist in segments, body, tail and across the boundary', () => {
    expect(invariantFailure('strom-sd', 'strom-sd', '', max)).toBe('I6')
    expect(invariantFailure('nazi-rv', 'nazi-rv', '', max)).toBe('I6')
    expect(invariantFailure('strom-s4x', 'strom', 's4x', max)).toBe('I6')
    expect(invariantFailure('doc-fo-tz3', 'doc-fo', 'tz3', max)).toBe('I6')
    expect(invariantFailure('analyse-it', 'analyse-it', '', max)).toBe('I6')
    expect(
      invariantFailure('analyse-it', 'analyse-it', '', max, [
        { text: 'analyse', verbatim: true },
        { text: 'it', verbatim: true },
      ]),
    ).toBeNull()
  })

  it('I6 non-soft list words of 4+ chars, also with verbatim segments and separator ""', () => {
    const verb = (...t: string[]) => t.map((text) => ({ text, verbatim: true }))
    expect(invariantFailure('gewicht-v14-88kg', 'gewicht-v14-88kg', '', max, verb('gewicht', 'v14', '88kg'))).toBe('I6')
    const plain = resolveConfig({ separator: '', lengthMode: 'max' })
    expect(invariantFailure('rainsdapper', 'rainsdapper', '', plain, verb('rains', 'dapper'))).toBe('I6')
  })

  it('I7 reserved', () => {
    expect(invariantFailure('new', 'new', '', max)).toBe('I7')
    expect(invariantFailure('help-k3', 'help', 'k3', max)).toBeNull()
    const c = resolveConfig({ lengthMode: 'max', reserved: { add: ['strom-k3'.replace('-', '')] } })
    expect(
      invariantFailure('strom', 'strom', '', resolveConfig({ lengthMode: 'max', reserved: { add: ['strom'] } })),
    ).toBe('I7')
    expect(c.reserved).toContain('stromk3')
  })

  it('I8 look-alike pairs per segment, and on the joined body with separator ""', () => {
    expect(invariantFailure('lo1-strom', 'lo1-strom', '', max)).toBe('I8')
    expect(invariantFailure('strom-l0s', 'strom-l0s', '', max)).toBe('I8')
    expect(invariantFailure('rho-1x', 'rho-1x', '', max)).toBeNull()
    const j = resolveConfig({ separator: '', lengthMode: 'max' })
    expect(
      invariantFailure('rho1x', 'rho1x', '', j, [
        { text: 'rho', verbatim: true },
        { text: '1x', verbatim: false },
      ]),
    ).toBe('I8')
  })

  it('I9 ascii (also caught by I2)', () => {
    expect(invariantFailure('strömrv', 'strömrv', '', resolveConfig({ separator: '', lengthMode: 'max' }))).toBe('I2')
  })

  it('I10 segment count and empty segments', () => {
    const c = resolveConfig({ lengthMode: 'max', length: 32, maxSegments: 2 })
    expect(invariantFailure('ka-km-kr', 'ka-km-kr', '', c)).toBe('I10')
    expect(invariantFailure('aa-cc', 'aa-cc', '', c)).toBeNull()
    const j = resolveConfig({ separator: '', lengthMode: 'max' })
    const segs = [
      { text: 'aacc', verbatim: true },
      { text: '', verbatim: true },
    ]
    expect(invariantFailure('aacc', 'aacc', '', j, segs)).toBe('I10')
    expect(joined.separator).toBe('')
  })

  it('assertInvariants throws InternalError', () => {
    expect(() => assertInvariants('x', 'x', '', exact)).toThrow()
    try {
      assertInvariants('x', 'x', '', exact)
    } catch (e) {
      expect(isSluggerError(e, 'E_INTERNAL')).toBe(true)
    }
    expect(() => assertInvariants('doc-k7q9m3xdt2hz', 'doc', 'k7q9m3xdt2hz', exact)).not.toThrow()
  })
})

describe('isValidSlug', () => {
  it('default config: exact 16, "-"', () => {
    expect(isValidSlug('strom-rv-nord-26')).toBe(true)
    expect(isValidSlug('doc-k7q9m3xdt2hz')).toBe(true)
    expect(isValidSlug('strom-rv-nord')).toBe(false) // length
    expect(isValidSlug('Strom-rv-nord-26')).toBe(false)
    expect(isValidSlug('strom-rv-nord-2ö')).toBe(false)
    expect(isValidSlug('strom-rv--ord-26')).toBe(false)
    expect(isValidSlug('1234567890123456')).toBe(false)
    expect(isValidSlug(42 as unknown as string)).toBe(false)
  })

  it('blocklist: segments and hard words in the joined id', () => {
    expect(isValidSlug('strom-sd-nord-26')).toBe(false)
    expect(isValidSlug('strom-fi-ck-2026')).toBe(false)
    expect(isValidSlug('analyse-plt-2026')).toBe(true)
  })

  it('blocklist: non-soft list words of 4+ chars across boundaries (iabb, nsdap), like B3', () => {
    expect(isValidSlug('gewicht-v14-88kg')).toBe(false)
    expect(isValidSlug('gewichtv1488kgxx', { separator: '' })).toBe(false)
    expect(isValidSlug('rainsdappcoatnjk', { separator: '' })).toBe(false)
    expect(isValidSlug('gewicht-v14-p8jn')).toBe(true)
  })

  it('with a config', () => {
    const cfg = { separator: '_', lengthMode: 'max' } as const
    expect(isValidSlug('strom_rv', cfg)).toBe(true)
    expect(isValidSlug('strom-rv', cfg)).toBe(false)
    expect(isValidSlug('stromrv', { separator: '', lengthMode: 'max' })).toBe(true)
    expect(isValidSlug('a'.repeat(17), { lengthMode: 'max' })).toBe(false)
    expect(isValidSlug('', { lengthMode: 'max' })).toBe(false)
  })

  it('Slugger.isValid and pattern', () => {
    const s = createSlugger({ separator: '_' })
    expect(s.pattern.test('strom_rv')).toBe(true)
    expect(s.isValid('strom_rv_nord_26')).toBe(true)
    expect(s.isValid('strom-rv-nord-26')).toBe(false)
  })
})
