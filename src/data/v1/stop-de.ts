/**
 * German function words (SPEC 6.3). Removed in every title, except the conflict words
 * (`conflict.ts`), which are removed only in `de` titles.
 * Person titles (`dr frau herr prof`) are removed only when the raw token is not all upper case.
 */
// biome-ignore format: word list, one line per group
export const STOP_DE: readonly string[] = [
  'ab', 'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am', 'an', 'andere', 'anderem', 'anderen',
  'anderer', 'anderes', 'auch', 'auf', 'aus', 'bei', 'beim', 'bin', 'binnen', 'bis', 'bzgl', 'bzw', 'bezueglich', 'ca',
  'da', 'damit', 'dann', 'darf', 'das', 'dass', 'dein', 'deine', 'dem', 'den', 'denen', 'der', 'des', 'dessen',
  'deshalb', 'die', 'dies', 'diese', 'diesem', 'diesen', 'dieser', 'dieses', 'doch', 'dort', 'dr', 'du', 'durch',
  'duerfen', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'einige', 'einigen', 'einschl', 'einschliesslich', 'er',
  'es', 'etc', 'etwas', 'euer', 'eure', 'fast', 'frau', 'fuer', 'gegen', 'gem', 'gemaess', 'ggf', 'habe', 'haben',
  'hast', 'hat', 'hatte', 'hatten', 'herr', 'hier', 'hin', 'hinter', 'ich', 'ihr', 'ihre', 'im', 'immer', 'in', 'indem',
  'inkl', 'inklusive', 'ins', 'ist', 'je', 'jede', 'jedem', 'jeden', 'jeder', 'jedes', 'jetzt', 'kann', 'kein', 'keine',
  'koennen', 'laut', 'man', 'mehr', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'mit', 'moechte', 'muss', 'muessen',
  'nach', 'neben', 'nicht', 'nie', 'noch', 'nur', 'ob', 'oder', 'ohne', 'per', 'pro', 'prof', 'samt', 'schon', 'seit',
  'sehr', 'sein', 'seine', 'sich', 'sie', 'sind', 'so', 'soll', 'sollen', 'sowie', 'trotz', 'ueber', 'um', 'und', 'uns',
  'unser', 'unsere', 'unserem', 'unseren', 'unserer', 'unter', 'usw', 'vom', 'von', 'vor', 'waehrend', 'wann', 'war',
  'warum', 'was', 'wegen', 'weil', 'welche', 'wenn', 'wer', 'werden', 'weshalb', 'wie', 'wieder', 'wieso', 'will',
  'wir', 'wird', 'worden', 'wurde', 'wurden', 'wo', 'zu', 'zum', 'zur', 'zwar', 'zwischen', 'zzgl',
]

/** German person titles: stop words, kept when the raw token is all upper case (SPEC 6.3). */
export const PERSON_TITLES_DE: readonly string[] = ['dr', 'frau', 'herr', 'prof']
