/**
 * Version words (SPEC 5.4): a version word followed by a number gives a `version` token and the word
 * is dropped (`Version 2.4`, `Release 3`, `Rev. 2`). Same list in `de` and `en`.
 * Alone, `version` is a noise word; `revision` and `release` are then normal words.
 */
export const VERSION_WORDS: readonly string[] = ['version', 'ver', 'rev', 'revision', 'release', 'rel']
