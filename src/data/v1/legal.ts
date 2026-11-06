/**
 * Legal forms (SPEC 6.3), removed in every language as generic noise. A legal form is also a name
 * signal for the token directly before it (SPEC 6.6).
 */

/** Always a legal form. */
// biome-ignore format: word list, one line per group
export const LEGAL_ALWAYS: readonly string[] = [
  'gmbh', 'mbh', 'ggmbh', 'kgaa', 'ohg', 'gbr', 'ltd', 'llc', 'llp', 'plc', 'inc', 'corp', 'bv', 'nv', 'sarl', 'sas',
  'srl', 'pty', 'oy',
]

/** Multi-token legal forms (after splitting: `GmbH & Co. KG`, `e.V.`). Always legal. */
export const LEGAL_MULTI: readonly (readonly string[])[] = [
  ['gmbh', 'co', 'kg'],
  ['e', 'v'],
]

/**
 * Ambiguous: a legal form only when the raw text is upper case or dotted (`AG`, `S.A.`, `e.K.`, `Co.`;
 * `Limited` and `Spa` also in title case after a capitalized word), and the token is the last token or is
 * followed by `&`, `co`, another legal form, punctuation or a year.
 */
export const LEGAL_AMBIGUOUS: readonly string[] = ['ag', 'kg', 'se', 'ug', 'eg', 'ek', 'sa', 'spa', 'co', 'limited']

/** Ambiguous forms that also count in title case after a capitalized word. */
export const LEGAL_TITLE_CASE: readonly string[] = ['limited', 'spa']
