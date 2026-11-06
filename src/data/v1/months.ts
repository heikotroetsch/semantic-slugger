/**
 * Month words (SPEC 5.4), ascii. 12 rows per language, January first; row[0] is the display form.
 * Keys are language independent (`m03`), so `März` and `March` merge.
 */
export const MONTHS_DE: readonly (readonly string[])[] = [
  ['jan', 'januar'],
  ['feb', 'februar'],
  ['mrz', 'maerz'],
  ['apr', 'april'],
  ['mai'],
  ['jun', 'juni'],
  ['jul', 'juli'],
  ['aug', 'august'],
  ['sep', 'september', 'sept'],
  ['okt', 'oktober'],
  ['nov', 'november'],
  ['dez', 'dezember'],
]

export const MONTHS_EN: readonly (readonly string[])[] = [
  ['jan', 'january'],
  ['feb', 'february'],
  ['mar', 'march'],
  ['apr', 'april'],
  ['may'],
  ['jun', 'june'],
  ['jul', 'july'],
  ['aug', 'august'],
  ['sep', 'september', 'sept'],
  ['oct', 'october'],
  ['nov', 'november'],
  ['dec', 'december'],
]
