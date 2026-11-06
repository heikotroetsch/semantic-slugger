import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config.ts'
import { drawTail, keyFor, keyV1, makeTail, tailCapacity, tailNeed, titleKeyOf } from '../../src/core/tail.ts'
import { hexBytes } from '../../src/hash/encode.ts'

const safe = resolveConfig()
const strict = resolveConfig({ tailAlphabet: 'strict' })

describe('tail capacity and length', () => {
  it('K(t) for safe', () => {
    expect([2, 3, 4, 5, 6].map((t) => tailCapacity(t, safe))).toEqual([560, 15_680, 439_040, 12_293_120, 344_207_360])
  })

  it('K(t) for strict', () => {
    expect(tailCapacity(2, strict)).toBe(91)
    expect(tailCapacity(3, strict)).toBe(1183)
  })

  it('tailNeed keeps load <= 1/16: grows at n = 35 and n = 980 (safe)', () => {
    expect(tailNeed(0, safe)).toBe(2)
    expect(tailNeed(34, safe)).toBe(2)
    expect(tailNeed(35, safe)).toBe(3)
    expect(tailNeed(979, safe)).toBe(3)
    expect(tailNeed(980, safe)).toBe(4)
  })

  it('tailNeed respects tailMin and is capped by the length', () => {
    expect(tailNeed(0, resolveConfig({ tailMin: 4 }))).toBe(4)
    expect(tailNeed(1e15, resolveConfig({ length: 8 }))).toBe(8)
  })

  it('tailNeed for strict grows sooner', () => {
    expect(tailNeed(4, strict)).toBe(2)
    expect(tailNeed(5, strict)).toBe(3)
  })
})

describe('keys', () => {
  it('K_V1 is the utf8 of the v1 key text', () => {
    expect(hexBytes(keyV1())).toBe(hexBytes(Uint8Array.from('semantic-slug-v1', (c) => c.charCodeAt(0))))
    expect(keyFor(safe)).toBe(keyV1())
  })

  it('a secret derives a different, stable 16-byte key', () => {
    const a = keyFor({ secret: 'tenant-a-secret-0001' })
    const b = keyFor({ secret: 'tenant-b-secret-0001' })
    expect(a).toHaveLength(16)
    expect(hexBytes(a)).not.toBe(hexBytes(keyV1()))
    expect(hexBytes(a)).not.toBe(hexBytes(b))
    expect(hexBytes(keyFor({ secret: 'tenant-a-secret-0001' }))).toBe(hexBytes(a))
  })

  it('keeps working when the key cache is cleared', () => {
    const first = hexBytes(keyFor({ secret: 'cache-test-secret-00' }))
    for (let i = 0; i < 70; i++) keyFor({ secret: `cache-fill-secret-${i}-xx` })
    expect(hexBytes(keyFor({ secret: 'cache-test-secret-00' }))).toBe(first)
  })

  it('titleKey is 16 hex chars and keyed by the secret', () => {
    const plain = titleKeyOf('rahmenvertrag strom', safe)
    expect(plain).toMatch(/^[0-9a-f]{16}$/)
    expect(titleKeyOf('rahmenvertrag strom', { secret: 'tenant-a-secret-0001' })).not.toBe(plain)
    expect(titleKeyOf('rahmenvertrag strom', safe)).toBe(plain)
  })
})

describe('drawTail and makeTail', () => {
  it('uses only the alphabet, first char from the consonants', () => {
    for (const cfg of [safe, strict, resolveConfig({ tailAlphabet: 'bcdfghkmnp2345' })]) {
      for (let k = 0; k < 200; k++) {
        const t = drawTail(keyFor(cfg), `title ${k}`, k, 0, 1 + (k % 30), cfg)
        expect(t).toHaveLength(1 + (k % 30))
        expect(cfg.tailFirst).toContain(t[0])
        for (const c of t) expect(cfg.tailAlphabet).toContain(c)
      }
    }
  })

  it('is deterministic and depends on canonical, k and draw', () => {
    const K = keyFor(safe)
    expect(drawTail(K, 'a', 0, 0, 8, safe)).toBe(drawTail(K, 'a', 0, 0, 8, safe))
    const variants = new Set([
      drawTail(K, 'a', 0, 0, 8, safe),
      drawTail(K, 'b', 0, 0, 8, safe),
      drawTail(K, 'a', 1, 0, 8, safe),
      drawTail(K, 'a', 0, 1, 8, safe),
    ])
    expect(variants.size).toBe(4)
  })

  it('a longer tail starts with the shorter one (same word stream)', () => {
    const K = keyFor(safe)
    expect(drawTail(K, 'x', 3, 0, 20, safe).startsWith(drawTail(K, 'x', 3, 0, 12, safe))).toBe(true)
  })

  it('returns "" when every draw is blocked', () => {
    // block every first char: each draw fails B5
    const cfg = resolveConfig({ fallbackWord: 'ae', blocklist: { hard: { add: [...'bcdfghjkmnpqrstvwxyz'] } } })
    expect(makeTail(keyFor(cfg), 'x', 0, 4, '', cfg)).toBe('')
  })

  it('redraws when the first draw is blocked', () => {
    const K = keyFor(safe)
    let found = false
    for (let k = 0; k < 2000 && !found; k++) {
      const d0 = drawTail(K, 'redraw', k, 0, 3, safe)
      const cfg = resolveConfig({ blocklist: { hard: { add: [d0] } } })
      const t = makeTail(K, 'redraw', k, 3, '', cfg)
      if (t !== '' && t !== d0) {
        expect(t).toBe(drawTail(K, 'redraw', k, 1, 3, safe))
        found = true
      }
    }
    expect(found).toBe(true)
  })
})
