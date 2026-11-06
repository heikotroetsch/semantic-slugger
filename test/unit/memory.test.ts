import { describe, expect, it } from 'vitest'
import { MEMORY_CONFLICT, MemoryConflictError, memoryStore } from '../../src/adapters/memory.ts'
import { isUniqueViolation } from '../../src/index.ts'

const ctx = { scope: '' }
const rec = (id: string, body: string, stems: string[] = []) => ({
  id,
  body,
  stems,
  titleKey: 'k',
  algorithm: 1 as const,
})

describe('memoryStore (SPEC 17.1)', () => {
  it('insert, exists, existsMany; a taken id is a conflict', () => {
    const m = memoryStore()
    expect(m.insert(rec('vertrieb-nord-26', 'vertrieb-nord-26', ['nord', 'vertrieb']), ctx)).toBe('inserted')
    expect(m.insert(rec('vertrieb-nord-26', 'other'), ctx)).toBe('conflict')
    expect(m.exists('vertrieb-nord-26', ctx)).toBe(true)
    expect(m.exists('vertrieb-sued-26', ctx)).toBe(false)
    expect([...m.existsMany(['a', 'vertrieb-nord-26', 'b'], ctx)]).toEqual(['vertrieb-nord-26'])
    expect(m.size).toBe(1)
  })

  it('counts bodies and stems per unique stem; total counts rows', () => {
    const m = memoryStore()
    m.insert(rec('cake-ab', 'cake', ['cake', 'cake', 'choc']), ctx)
    m.insert(rec('cake-cd', 'cake', ['cake']), ctx)
    m.insert(rec('bread', 'bread', ['bread']), ctx)
    expect(m.countBody('cake', ctx)).toBe(2)
    expect(m.countBody('pie', ctx)).toBe(0)
    expect(m.countBodies(['cake', 'bread', 'pie'], ctx)).toEqual(
      new Map([
        ['cake', 2],
        ['bread', 1],
        ['pie', 0],
      ]),
    )
    expect(m.countStem('cake', ctx)).toBe(2)
    expect(m.countStems(['cake', 'choc', 'x'], ctx)).toEqual(
      new Map([
        ['cake', 2],
        ['choc', 1],
        ['x', 0],
      ]),
    )
    expect(m.total(ctx)).toBe(3)
  })

  it('findByBody is sorted by id and honors the limit', () => {
    const m = memoryStore()
    for (const id of ['cake-zz', 'cake-aa', 'cake-mm']) m.insert(rec(id, 'cake', [id]), ctx)
    expect(m.findByBody('cake', ctx, 2)).toEqual([
      { id: 'cake-aa', stems: ['cake-aa'] },
      { id: 'cake-mm', stems: ['cake-mm'] },
    ])
    expect(m.findByBody('none', ctx, 5)).toEqual([])
  })

  it('scopes never mix', () => {
    const m = memoryStore()
    m.insert(rec('nord', 'nord', ['nord']), { scope: 'a' })
    expect(m.exists('nord', { scope: 'b' })).toBe(false)
    expect(m.countBody('nord', { scope: 'b' })).toBe(0)
    expect(m.countStem('nord', { scope: 'b' })).toBe(0)
    expect(m.total({ scope: 'b' })).toBe(0)
    expect(m.insert(rec('nord', 'nord'), { scope: 'b' })).toBe('inserted')
    expect(m.snapshot('a').map((r) => r.id)).toEqual(['nord'])
    expect(m.size).toBe(2)
  })

  it('add: body defaults to the id; a taken id throws a memory conflict', () => {
    const m = memoryStore(['taken-id', { id: 'x-ab', body: 'x', scope: 't' }])
    expect(m.snapshot()).toEqual([{ id: 'taken-id', body: 'taken-id', stems: [], titleKey: '', algorithm: 1 }])
    expect(m.countBody('x', { scope: 't' })).toBe(1)
    let err: unknown
    try {
      m.add('taken-id')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(MemoryConflictError)
    expect((err as MemoryConflictError).code).toBe(MEMORY_CONFLICT)
    expect(m.isConflict(err)).toBe(true)
    expect(isUniqueViolation(err)).toBe(true)
    expect(m.isConflict(new Error('x'))).toBe(false)
  })

  it('retire keeps the id taken and the body count, and leaves df and total', () => {
    const m = memoryStore()
    m.insert(rec('cake-ab', 'cake', ['cake']), ctx)
    expect(m.retire('cake-ab')).toBe(true)
    expect(m.retire('cake-ab')).toBe(true)
    expect(m.retire('none')).toBe(false)
    expect(m.exists('cake-ab', ctx)).toBe(true)
    expect(m.countBody('cake', ctx)).toBe(1)
    expect(m.findByBody('cake', ctx, 5)).toHaveLength(1)
    expect(m.countStem('cake', ctx)).toBe(0)
    expect(m.total(ctx)).toBe(0)
    expect(m.insert(rec('cake-ab', 'cake'), ctx)).toBe('conflict')
    expect(m.size).toBe(1)
  })

  it('snapshot is sorted by code unit and frozen; stems are stored sorted and unique', () => {
    const m = memoryStore()
    for (const id of ['b', 'a', 'B']) m.insert(rec(id, id, ['z', 'a', 'z']), ctx)
    const snap = m.snapshot()
    expect(snap.map((r) => r.id)).toEqual(['B', 'a', 'b'])
    expect(snap[0]?.stems).toEqual(['a', 'z'])
    expect(Object.isFrozen(snap)).toBe(true)
    expect(m.snapshot('missing')).toEqual([])
  })

  it('add rejects non-string ids and scopes', () => {
    const m = memoryStore()
    expect(() => m.add({ id: 3 as unknown as string })).toThrow(TypeError)
    expect(() => m.add('x', 1 as unknown as string)).toThrow(TypeError)
  })
})
