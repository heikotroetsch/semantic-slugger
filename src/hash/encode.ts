/**
 * Own UTF-8 encoder and hex helpers (SPEC 4.1). No TextEncoder, so the core type-checks
 * with lib ES2022 and runs in every engine. Lone surrogates are encoded as U+FFFD.
 */

export function utf8(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00)
        i++
      } else c = 0xfffd
    } else if (c >= 0xdc00 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

const HEX = '0123456789abcdef'

/** Lowercase hex of a byte array. */
export function hexBytes(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) {
    const v = b[i] as number
    s += HEX[v >> 4] + (HEX[v & 15] as string)
  }
  return s
}

/** 8 hex chars of a uint32, most significant first. */
export function hex32(v: number): string {
  let s = ''
  for (let sh = 28; sh >= 0; sh -= 4) s += HEX[(v >>> sh) & 15]
  return s
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
