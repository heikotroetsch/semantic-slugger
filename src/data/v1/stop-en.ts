/**
 * English function words (SPEC 6.3), including the contraction stems left after splitting on the
 * apostrophe. Removed in every title, except the conflict words (`conflict.ts`), which are removed
 * only in `en` titles. Person titles (`dr mr mrs ms prof`) are removed only when the raw token is not
 * all upper case (`MS Teams` keeps `ms`).
 */
// biome-ignore format: word list, one line per group
export const STOP_EN: readonly string[] = [
  'a', 'about', 'above', 'across', 'after', 'against', 'all', 'along', 'also', 'am', 'among', 'an', 'and', 'any',
  'anything', 'are', 'aren', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'but', 'by', 'can', 'cannot', 'could', 'couldn', 'did', 'didn', 'do', 'does', 'doesn', 'don', 'dr', 'during',
  'each', 'either', 'ever', 'every', 'everything', 'for', 'from', 'further', 'had', 'hadn', 'has', 'hasn', 'have',
  'haven', 'he', 'her', 'here', 'his', 'how', 'i', 'if', 'in', 'incl', 'including', 'into', 'is', 'isn', 'it', 'its',
  'just', 'me', 'more', 'most', 'mr', 'mrs', 'ms', 'my', 'never', 'nobody', 'nor', 'not', 'nothing', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'per', 'prof', 'regarding', 'same', 'she', 'should',
  'shouldn', 'so', 'some', 'something', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'upon', 'us', 've', 'very', 'via', 'was',
  'wasn', 'we', 'were', 'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'within', 'without', 'won', 'would', 'wouldn', 'you', 'your',
]

/** English person titles: stop words, kept when the raw token is all upper case (SPEC 6.3). */
export const PERSON_TITLES_EN: readonly string[] = ['dr', 'mr', 'mrs', 'ms', 'prof']
