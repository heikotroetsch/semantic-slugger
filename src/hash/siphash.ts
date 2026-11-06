/**
 * SipHash-2-4, 64-bit output, 128-bit key (SPEC 13.1).
 * Works on 32-bit halves: every value is a pair of uint32 numbers. No BigInt.
 * Checked against the 64 reference vectors of the SipHash paper (test/unit/siphash.test.ts).
 */

import { hex32 } from './encode.ts'

/** Unsigned 64-bit value as two uint32 halves. */
export interface U64 {
  readonly hi: number
  readonly lo: number
}

function readLe32(b: Uint8Array, o: number): number {
  return (
    ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16) | ((b[o + 3] as number) << 24)) >>> 0
  )
}

/** SipHash-2-4 of `msg` under the 16-byte `key`. */
export function siphash(key: Uint8Array, msg: Uint8Array): U64 {
  if (key.length !== 16) throw new RangeError('siphash key must be 16 bytes')
  const k0l = readLe32(key, 0)
  const k0h = readLe32(key, 4)
  const k1l = readLe32(key, 8)
  const k1h = readLe32(key, 12)
  // v0..v3 as [hi, lo] pairs in one array: v0 = s[0],s[1]; v1 = s[2],s[3]; v2 = s[4],s[5]; v3 = s[6],s[7]
  const s = [
    (k0h ^ 0x736f6d65) >>> 0,
    (k0l ^ 0x70736575) >>> 0,
    (k1h ^ 0x646f7261) >>> 0,
    (k1l ^ 0x6e646f6d) >>> 0,
    (k0h ^ 0x6c796765) >>> 0,
    (k0l ^ 0x6e657261) >>> 0,
    (k1h ^ 0x74656462) >>> 0,
    (k1l ^ 0x79746573) >>> 0,
  ]

  const add = (a: number, b: number): void => {
    const lo = (s[a + 1] as number) + (s[b + 1] as number)
    s[a] = ((s[a] as number) + (s[b] as number) + (lo > 0xffffffff ? 1 : 0)) >>> 0
    s[a + 1] = lo >>> 0
  }
  const xor = (a: number, b: number): void => {
    s[a] = ((s[a] as number) ^ (s[b] as number)) >>> 0
    s[a + 1] = ((s[a + 1] as number) ^ (s[b + 1] as number)) >>> 0
  }
  const rotl = (a: number, n: number): void => {
    const h = s[a] as number
    const l = s[a + 1] as number
    if (n === 32) {
      s[a] = l
      s[a + 1] = h
      return
    }
    s[a] = ((h << n) | (l >>> (32 - n))) >>> 0
    s[a + 1] = ((l << n) | (h >>> (32 - n))) >>> 0
  }
  const round = (): void => {
    add(0, 2)
    rotl(2, 13)
    xor(2, 0)
    rotl(0, 32)
    add(4, 6)
    rotl(6, 16)
    xor(6, 4)
    add(0, 6)
    rotl(6, 21)
    xor(6, 0)
    add(4, 2)
    rotl(2, 17)
    xor(2, 4)
    rotl(4, 32)
  }
  const compress = (mh: number, ml: number): void => {
    s[6] = ((s[6] as number) ^ mh) >>> 0
    s[7] = ((s[7] as number) ^ ml) >>> 0
    round()
    round()
    s[0] = ((s[0] as number) ^ mh) >>> 0
    s[1] = ((s[1] as number) ^ ml) >>> 0
  }

  const len = msg.length
  const end = len - (len % 8)
  for (let o = 0; o < end; o += 8) compress(readLe32(msg, o + 4), readLe32(msg, o))

  // last block: remaining bytes little endian, length byte at the top
  let ml = 0
  let mh = ((len & 0xff) << 24) >>> 0
  for (let j = 0; j < len - end; j++) {
    const v = msg[end + j] as number
    if (j < 4) ml |= v << (8 * j)
    else mh |= v << (8 * (j - 4))
  }
  compress(mh >>> 0, ml >>> 0)

  s[5] = ((s[5] as number) ^ 0xff) >>> 0
  round()
  round()
  round()
  round()
  return {
    hi: ((s[0] as number) ^ (s[2] as number) ^ (s[4] as number) ^ (s[6] as number)) >>> 0,
    lo: ((s[1] as number) ^ (s[3] as number) ^ (s[5] as number) ^ (s[7] as number)) >>> 0,
  }
}

/** 8 bytes, little endian (the byte order of the SipHash reference output). */
export function u64le(w: U64): Uint8Array {
  const out = new Uint8Array(8)
  for (let j = 0; j < 4; j++) {
    out[j] = (w.lo >>> (8 * j)) & 0xff
    out[4 + j] = (w.hi >>> (8 * j)) & 0xff
  }
  return out
}

/** 16 hex chars of the 64-bit value, most significant first. */
export function u64hex(w: U64): string {
  return hex32(w.hi) + hex32(w.lo)
}

/**
 * Divide a 64-bit value by a small integer d (1..65536) on four 16-bit limbs, most significant first.
 * Returns the quotient and the remainder. All steps are exact integer math in doubles.
 */
export function divSmall(w: U64, d: number): [U64, number] {
  const l = [w.hi >>> 16, w.hi & 0xffff, w.lo >>> 16, w.lo & 0xffff]
  let r = 0
  for (let j = 0; j < 4; j++) {
    const cur = r * 65536 + (l[j] as number)
    l[j] = Math.floor(cur / d)
    r = cur % d
  }
  return [
    {
      hi: (((l[0] as number) << 16) | (l[1] as number)) >>> 0,
      lo: (((l[2] as number) << 16) | (l[3] as number)) >>> 0,
    },
    r,
  ]
}
