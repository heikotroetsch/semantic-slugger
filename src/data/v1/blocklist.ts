/**
 * Why this file exists: IDs end up in URLs, emails, logs and on the phone. A generated ID must never
 * spell an insult, a slur or extremist code, not even by accident across segment boundaries or in
 * the random tail. These lists are checked by the rules B1 to B7 of SPEC 9.2.
 *
 * Sources: curated from LDNOOBW de/en (CC-BY-4.0) and sqids-blocklist (MIT). Entries that are common
 * inside normal German or English words (for example "wank" in "Schwankung", "butt" in
 * "Butter") are soft, not hard.
 *
 * Every entry is stored already leet-folded (4->a 3->e 0->o 1->i 5->s 7->t 8->b) and lowercase ascii.
 * A unit test checks that each entry equals its fold and that each list has no duplicates.
 * Users extend the lists with `blocklist: { hard: { add }, soft: { add } }`.
 *
 * This is v1 data: any change changes IDs (SPEC 14.2). Adding words is allowed in a minor release.
 */

/** Never allowed anywhere, not even inside a verbatim user word. */
export const BLOCK_HARD: readonly string[] = [
  // de
  'arschloch',
  'fick',
  'ficker',
  'fotze',
  'hitler',
  'hurensohn',
  'judensau',
  'kanake',
  'missgeburt',
  'moese',
  'nazi',
  'neger',
  'nutte',
  'pimmel',
  'porno',
  'scheisse',
  'schlampe',
  'schwuchtel',
  'spast',
  'titten',
  'untermensch',
  'votze',
  'wichser',
  'wixer',
  // en
  'bitch',
  'cunt',
  'dyke',
  'faggot',
  'fuck',
  'jizz',
  'kike',
  'nigga',
  'nigger',
  'porn',
  'pussy',
  'slut',
  'tranny',
  'twat',
  'wetback',
  'whore',
]

/** Allowed only strictly inside a verbatim user word ("analyse", "cockpit", "butter"). */
export const BLOCK_SOFT: readonly string[] = [
  'anal',
  'anus',
  'arsch',
  'ass',
  'boob',
  'bdsm',
  'butt',
  'cock',
  'crap',
  'cum',
  'damn',
  'dick',
  'fag',
  'hure',
  'kacke',
  'piss',
  'pisse',
  'poop',
  'rape',
  'retard',
  'sex',
  'shit',
  'sperm',
  'tit',
  'wank',
]

/**
 * Short German codes, blocked as whole segments and in the tail.
 * Folded forms: 88 -> bb, 18 -> ib, 1488 -> iabb, 444 -> aaa.
 */
export const BLOCK_SHORT_DE: readonly string[] = [
  'ss',
  'sa',
  'sd',
  'kz',
  'hj',
  'ns',
  'nsdap',
  'hh',
  'bb',
  'ib',
  'iabb',
  'aaa',
  'ah',
]

/** Extra entries checked only in tails (SPEC 9.1). TAIL_BLOCK = BLOCK_SHORT_DE + these. */
export const TAIL_BLOCK_EXTRA: readonly string[] = ['kkk', 'fck', 'fkk', 'wtf', 'stfu', 'nzs']

export const TAIL_BLOCK: readonly string[] = [...BLOCK_SHORT_DE, ...TAIL_BLOCK_EXTRA]
