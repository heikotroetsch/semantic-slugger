/**
 * Normalization helpers (SPEC 4.1). M1 holds the fold and canonical form used for hash inputs
 * and list entries. The full title normalizer (markup, noise removal, translit) follows in M2.
 */

/** Ascii fold for display, rungs and the canonical title (SPEC 4.1). */
export function asciiFold(w: string): string {
  return w
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[đð]/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Canonical title: ascii fold, every run of other chars becomes one space (SPEC 4.1). */
export function toCanonical(surface: string): string {
  return asciiFold(surface)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Normalize one list entry (stop words, reserved words, blocklist, deny tokens) "like a title":
 * NFKC, capital sharp s to ß, lowercase, ascii fold, trim. The caller checks `[a-z0-9]+`.
 */
export function normalizeListEntry(raw: string): string {
  return asciiFold(raw.normalize('NFKC').replace(/ẞ/g, 'ß').toLowerCase()).trim()
}
