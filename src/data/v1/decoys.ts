/**
 * Decoy words (docs/DEVIATIONS.md, quality round 2): common everyday words that a cut of a longer word
 * must not spell, because the reader then sees the other word (`star` from `startup`, `stock` from
 * `Stockholm`, `schul` from `Schultergelenk`). Cut rungs (coda, syllable, bridge) and fill prefixes
 * that equal one of them are removed, like cuts that are stop words or lexicon words (rule `name`).
 * A word's own full form is never affected.
 */

// biome-ignore format: word list, one line per group
export const DECOYS: readonly string[] = [
  // en
  'art', 'arm', 'back', 'ban', 'bar', 'bus', 'cap', 'car', 'cat', 'check', 'chic', 'chick', 'con', 'cos', 'custom', 'dog',
  'earl', 'edit', 'end', 'hall', 'hot', 'ice', 'inter', 'insta', 'kick', 'leg', 'less', 'liver', 'man', 'mat',
  'mid', 'mig', 'organ', 'pack', 'par', 'pass', 'pat', 'pen', 'pin', 'port', 'pro', 'proper', 'rem', 'sat', 'son',
  'stand', 'star', 'stock', 'sun', 'tea', 'temp', 'tim', 'top', 'train', 'trans', 'uml', 'veg', 'war', 'week', 'wild',
  // de
  'bad', 'hand', 'kind', 'kur', 'lang', 'mal', 'ost', 'rad', 'rat', 'reis', 'schul', 'studie', 'tor',
]
