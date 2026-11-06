/**
 * Polarity parts (docs/DEVIATIONS.md, quality round 2): compound parts that flip the meaning of the
 * other part. A leading negation (`No-Bake`, `Non-Profit`) is never dropped as a weak part, and a cut
 * never shows the other part without it. A privative head (`Gluten-Free`, `zuckerfrei`, `kabellos`)
 * gives no morph, head or cut rung that stops before it (`gluten` alone says the opposite).
 */

// biome-ignore format: word list
export const NEGATION_PARTS: readonly string[] = ['no', 'non', 'not', 'un', 'anti', 'kein', 'keine', 'nicht', 'ohne']

// biome-ignore format: word list
export const PRIVATIVE_HEADS: readonly string[] = ['free', 'less', 'frei', 'freie', 'freier', 'freies', 'freien', 'los', 'lose', 'loser', 'loses', 'losen']
