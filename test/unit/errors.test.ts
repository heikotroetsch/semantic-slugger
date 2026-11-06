import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  ConflictError,
  ExhaustedError,
  InputError,
  InternalError,
  isSluggerError,
  SluggerError,
  StoreError,
} from '../../src/index.ts'

describe('errors', () => {
  it('codes and names', () => {
    const cases: [SluggerError, string, string][] = [
      [new ConfigError('x', { field: 'length', value: 1, reason: 'out-of-range' }), 'E_CONFIG', 'ConfigError'],
      [new InputError('x'), 'E_INPUT', 'InputError'],
      [new ExhaustedError({ body: 'doc', tailIndex: 0, tries: 64 }), 'E_EXHAUSTED', 'ExhaustedError'],
      [new ConflictError({ tried: ['a', 'b'] }), 'E_CONFLICT', 'ConflictError'],
      [new StoreError(new Error('db down')), 'E_STORE', 'StoreError'],
      [new InternalError('bug'), 'E_INTERNAL', 'InternalError'],
    ]
    for (const [e, code, name] of cases) {
      expect(e).toBeInstanceOf(SluggerError)
      expect(e).toBeInstanceOf(Error)
      expect(e.code).toBe(code)
      expect(e.name).toBe(name)
      expect(isSluggerError(e)).toBe(true)
      expect(isSluggerError(e, code)).toBe(true)
      expect(isSluggerError(e, 'E_OTHER')).toBe(false)
    }
  })

  it('details and cause', () => {
    const cause = new Error('db down')
    expect(new StoreError(cause).cause).toBe(cause)
    const ex = new ExhaustedError({ body: 'doc', tailIndex: 3, tries: 64 })
    expect(ex.details).toEqual({ body: 'doc', tailIndex: 3, tries: 64 })
    expect(ex.message).toContain('countBody')
    expect(new ConflictError({ tried: ['a', 'b'] }).details.tried).toEqual(['a', 'b'])
  })

  it('brand works across copies (global symbol), not on lookalikes', () => {
    const foreign = Object.assign(new Error('x'), { code: 'E_CONFIG', [Symbol.for('semantic-slugger.error')]: true })
    expect(isSluggerError(foreign, 'E_CONFIG')).toBe(true)
    expect(isSluggerError(Object.assign(new Error('x'), { code: 'E_CONFIG' }))).toBe(false)
    expect(isSluggerError(null)).toBe(false)
    expect(isSluggerError('E_CONFIG')).toBe(false)
  })

  it('the brand is not enumerable', () => {
    expect(Object.keys(new InputError('x'))).not.toContain(Symbol.for('semantic-slugger.error'))
    expect(JSON.stringify(new InputError('x', { a: 1 }))).not.toContain('semantic')
  })
})
