/**
 * Weekday words (SPEC 5.4), ascii. 7 rows per language, Monday first; row[0] is the display form.
 * Short forms (`mon`, `sat`, `sun`, ...) count only when the raw token is capitalized and stands next
 * to a time, a date or another weekday. Keys are language independent (`wd5` = Friday).
 */
export const WEEKDAYS_DE: readonly (readonly string[])[] = [
  ['montag', 'montags'],
  ['dienstag', 'dienstags'],
  ['mittwoch', 'mittwochs'],
  ['donnerstag', 'donnerstags'],
  ['freitag', 'freitags'],
  ['samstag', 'samstags', 'sonnabend'],
  ['sonntag', 'sonntags'],
]

export const WEEKDAYS_EN: readonly (readonly string[])[] = [
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
  ['sunday', 'sun'],
]
