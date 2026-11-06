import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config.ts'
import { keyFor, makeTail } from '../../src/core/tail.ts'
import { concatBytes, hex32, hexBytes, utf8 } from '../../src/hash/encode.ts'
import { divSmall, siphash, type U64, u64hex, u64le } from '../../src/hash/siphash.ts'

/** SipHash-2-4 64-bit reference vectors (vectors_sip64 of the reference code): key 00..0f, message 00..(i-1). */
const VECTORS = [
  '310e0edd47db6f72',
  'fd67dc93c539f874',
  '5a4fa9d909806c0d',
  '2d7efbd796666785',
  'b7877127e09427cf',
  '8da699cd64557618',
  'cee3fe586e46c9cb',
  '37d1018bf50002ab',
  '6224939a79f5f593',
  'b0e4a90bdf82009e',
  'f3b9dd94c5bb5d7a',
  'a7ad6b22462fb3f4',
  'fbe50e86bc8f1e75',
  '903d84c02756ea14',
  'eef27a8e90ca23f7',
  'e545be4961ca29a1',
  'db9bc2577fcc2a3f',
  '9447be2cf5e99a69',
  '9cd38d96f0b3c14b',
  'bd6179a71dc96dbb',
  '98eea21af25cd6be',
  'c7673b2eb0cbf2d0',
  '883ea3e395675393',
  'c8ce5ccd8c030ca8',
  '94af49f6c650adb8',
  'eab8858ade92e1bc',
  'f315bb5bb835d817',
  'adcf6b0763612e2f',
  'a5c91da7acaa4dde',
  '716595876650a2a6',
  '28ef495c53a387ad',
  '42c341d8fa92d832',
  'ce7cf2722f512771',
  'e37859f94623f3a7',
  '381205bb1ab0e012',
  'ae97a10fd434e015',
  'b4a31508beff4d31',
  '81396229f0907902',
  '4d0cf49ee5d4dcca',
  '5c73336a76d8bf9a',
  'd0a704536ba93e0e',
  '925958fcd6420cad',
  'a915c29bc8067318',
  '952b79f3bc0aa6d4',
  'f21df2e41d4535f9',
  '87577519048f53a9',
  '10a56cf5dfcd9adb',
  'eb75095ccd986cd0',
  '51a9cb9ecba312e6',
  '96afadfc2ce666c7',
  '72fe52975a4364ee',
  '5a1645b276d592a1',
  'b274cb8ebf87870a',
  '6f9bb4203de7b381',
  'eaecb2a30b22a87f',
  '9924a43cc1315724',
  'bd838d3aafbf8db7',
  '0b1a2a3265d51aea',
  '135079a3231ce660',
  '932b2846e4d70666',
  'e1915f5cb1eca46c',
  'f325965ca16d629f',
  '575ff28e60381be5',
  '724506eb4c328a95',
]

const toBig = (w: U64): bigint => (BigInt(w.hi) << 32n) | BigInt(w.lo)
const fromBig = (b: bigint): U64 => ({ hi: Number((b >> 32n) & 0xffffffffn), lo: Number(b & 0xffffffffn) })
const u64 = fc.record({ hi: fc.nat({ max: 0xffffffff }), lo: fc.nat({ max: 0xffffffff }) })

describe('siphash', () => {
  const key = Uint8Array.from({ length: 16 }, (_, i) => i)

  it('passes the 64 reference vectors', () => {
    expect(VECTORS).toHaveLength(64)
    for (let i = 0; i < 64; i++) {
      const msg = Uint8Array.from({ length: i }, (_, j) => j)
      expect(hexBytes(u64le(siphash(key, msg))), `vector ${i}`).toBe(VECTORS[i])
    }
  })

  it('rejects keys that are not 16 bytes', () => {
    expect(() => siphash(new Uint8Array(15), new Uint8Array(0))).toThrow(RangeError)
  })

  it('u64hex is the big-endian form of the little-endian bytes', () => {
    const w = siphash(key, new Uint8Array(0))
    expect(u64hex(w)).toBe('726fdb47dd0e0e31')
    expect(hexBytes(u64le(w))).toBe('310e0edd47db6f72')
  })

  it('matches a BigInt reference for long random messages', () => {
    // second check of the 32-bit arithmetic: a straight BigInt port, used only in this test
    const M = (1n << 64n) - 1n
    const rotl = (x: bigint, b: bigint) => ((x << b) | (x >> (64n - b))) & M
    const ref = (k: Uint8Array, m: Uint8Array): bigint => {
      const le = (b: Uint8Array, o: number, n: number) => {
        let v = 0n
        for (let j = n - 1; j >= 0; j--) v = (v << 8n) | BigInt(b[o + j] as number)
        return v
      }
      const k0 = le(k, 0, 8)
      const k1 = le(k, 8, 8)
      let v0 = k0 ^ 0x736f6d6570736575n
      let v1 = k1 ^ 0x646f72616e646f6dn
      let v2 = k0 ^ 0x6c7967656e657261n
      let v3 = k1 ^ 0x7465646279746573n
      const round = () => {
        v0 = (v0 + v1) & M
        v1 = rotl(v1, 13n) ^ v0
        v0 = rotl(v0, 32n)
        v2 = (v2 + v3) & M
        v3 = rotl(v3, 16n) ^ v2
        v0 = (v0 + v3) & M
        v3 = rotl(v3, 21n) ^ v0
        v2 = (v2 + v1) & M
        v1 = rotl(v1, 17n) ^ v2
        v2 = rotl(v2, 32n)
      }
      const end = m.length - (m.length % 8)
      for (let o = 0; o < end; o += 8) {
        const w = le(m, o, 8)
        v3 ^= w
        round()
        round()
        v0 ^= w
      }
      const b = (BigInt(m.length & 0xff) << 56n) | le(m, end, m.length - end)
      v3 ^= b
      round()
      round()
      v0 ^= b
      v2 ^= 0xffn
      for (let r = 0; r < 4; r++) round()
      return v0 ^ v1 ^ v2 ^ v3
    }
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), fc.uint8Array({ maxLength: 200 }), (k, m) => {
        expect(toBig(siphash(k, m))).toBe(ref(k, m))
      }),
      { numRuns: 300 },
    )
  })
})

describe('divSmall', () => {
  it('matches a BigInt reference', () => {
    fc.assert(
      fc.property(u64, fc.integer({ min: 1, max: 64 }), (w, d) => {
        const [q, r] = divSmall(w, d)
        const b = toBig(w)
        expect(toBig(q)).toBe(b / BigInt(d))
        expect(r).toBe(Number(b % BigInt(d)))
      }),
      { numRuns: 2000 },
    )
  })

  it('handles the edges', () => {
    const max = fromBig((1n << 64n) - 1n)
    expect(divSmall(max, 1)).toEqual([max, 0])
    const [q, r] = divSmall(max, 28)
    expect(toBig(q)).toBe(((1n << 64n) - 1n) / 28n)
    expect(r).toBe(Number(((1n << 64n) - 1n) % 28n))
    expect(divSmall({ hi: 0, lo: 0 }, 7)).toEqual([{ hi: 0, lo: 0 }, 0])
  })
})

describe('utf8 and hex', () => {
  it('matches TextEncoder (test only), also for lone surrogates', () => {
    const enc = new TextEncoder()
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 64 }), (s) => {
        expect(hexBytes(utf8(s))).toBe(hexBytes(enc.encode(s)))
      }),
      { numRuns: 2000 },
    )
    for (const s of ['', 'ä', 'ẞ', '€', '𝄞', '\uD800', '\uDC00x', 'a\uD83Dz', 'Łódź', '🚚']) {
      expect(hexBytes(utf8(s))).toBe(hexBytes(enc.encode(s)))
    }
  })

  it('K_V1 text is exactly 16 bytes', () => {
    expect(utf8('semantic-slug-v1')).toHaveLength(16)
  })

  it('hex helpers', () => {
    expect(hex32(0)).toBe('00000000')
    expect(hex32(0xdeadbeef)).toBe('deadbeef')
    expect(hexBytes(concatBytes(Uint8Array.of(1, 2), Uint8Array.of(255)))).toBe('0102ff')
  })
})

describe('makeTail pinned outputs', () => {
  // [secret, k, safe tail of 12 after body 'doc', strict opaque tail of 16]
  const PINNED: [string | undefined, number, string, string][] = [
    [undefined, 0, 'k9vkmrxpbhnf', 'my6tyyxxr5x85rqy'],
    ['pin-secret-01-abcdef', 1, 'hmrk7htgk5n2', 'xky8yq4tqq5r46k5'],
    ['pin-secret-02-abcdef', 2, 'yn99pq2fvhw5', 't534q7qktmk6ykt4'],
    ['pin-secret-03-abcdef', 3, 'r3zdk4fbd65z', 'xq5m65qt6tmxm3tq'],
    ['pin-secret-04-abcdef', 4, 'yqdm5cvph8ty', 'yrrm6qkt85357mmm'],
    ['pin-secret-05-abcdef', 5, 'qxt99bqsqzn9', 'mt7ymr6q43x86yx3'],
    ['pin-secret-06-abcdef', 6, 'p2njtqzg4f5k', 'tt485q56yyyk7574'],
    ['pin-secret-07-abcdef', 7, 'r252csvr4c6x', 'txyt38m5rqk6tqqq'],
    ['pin-secret-08-abcdef', 8, 'byvf9f4tft28', 'm48r858k7qqqymm8'],
    ['pin-secret-09-abcdef', 9, 'whndrwqzhkkv', 't733r73r4y4qy634'],
    ['pin-secret-10-abcdef', 10, 'qzskykfhzz84', 'yq83yk6ktt36k64q'],
    ['pin-secret-11-abcdef', 11, 'g2cwn8h5crvd', 'qq37k8kmkrkmr485'],
    ['pin-secret-12-abcdef', 12, 'hr8vm92h92v9', 'qrytqyxrxq7r56k8'],
    ['pin-secret-13-abcdef', 13, 'nxtpf99dd37s', 'y6rrtq3rkx4m67x7'],
    ['pin-secret-14-abcdef', 14, 'pjnkk933hxrh', 'tmqqyxtx3qr5x5rt'],
    ['pin-secret-15-abcdef', 15, 'djrg82t85kyz', 'q3t7qkq6m8qx4tt3'],
    ['pin-secret-16-abcdef', 16, 'q36tm4dxg57n', 'm4q7y86ymx7q4y8x'],
    ['pin-secret-17-abcdef', 17, 'pv79ytwrk2s9', 'krxxr475m7tm8q4x'],
    ['pin-secret-18-abcdef', 18, 'fh7vg383pdzb', 'm74x56qq8t8mx7k8'],
    ['pin-secret-19-abcdef', 19, 'b9dwvjy2ms6s', 'tx86ykyqy773xmrm'],
  ]
  const title = 'rahmenvertrag stromlieferung standorte nord 2026'

  it.each(PINNED)('secret %s, k %i', (secret, k, safe, strict) => {
    const cfg = resolveConfig(secret ? { secret } : {})
    const scfg = resolveConfig(secret ? { secret, tailAlphabet: 'strict' } : { tailAlphabet: 'strict' })
    expect(makeTail(keyFor(cfg), title, k, 12, 'doc', cfg)).toBe(safe)
    expect(makeTail(keyFor(scfg), title, k, 16, '', scfg)).toBe(strict)
  })
})
