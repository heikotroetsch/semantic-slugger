/**
 * Noise words (SPEC 6.3): file and mail words, removed in every language. They replace the rev 2
 * domain words. `version` alone (no number) is noise (SPEC 5.4).
 */
// biome-ignore format: word list, one line per group
export const NOISE_DE: readonly string[] = [
  'dokument', 'dokumente', 'datei', 'dateien', 'kopie', 'anhang', 'nr', 'nummer', 'betreff', 'aw', 'wg',
]

// biome-ignore format: word list, one line per group
export const NOISE_EN: readonly string[] = [
  'document', 'documents', 'file', 'files', 'copy', 'attachment', 'no', 'number', 're', 'fw', 'fwd',
]

// biome-ignore format: word list, one line per group
export const NOISE_SHARED: readonly string[] = [
  'version', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'txt', 'md', 'jpg',
  'jpeg', 'png', 'zip', 'msg', 'eml',
]
