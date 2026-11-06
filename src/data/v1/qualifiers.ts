/**
 * Qualifiers (SPEC 15.5, rev 3.1): generic words that say which kind of a thing a title is about.
 * Class `qualifier`, slot Q, prior medium, kept in `minimal`. Full word only, no abbr.
 * As a compound modifier a qualifier becomes its own concept (`Onlinekurs` -> `online` + `kurs`).
 */
import type { LexiconEntry } from '../../config.ts'

export const QUALIFIERS: readonly LexiconEntry[] = [
  {
    key: 'intern',
    lang: 'de',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['interne', 'interner', 'internes', 'internen'],
    group: 'intern',
  },
  { key: 'internal', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'intern' },
  {
    key: 'extern',
    lang: 'de',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['externe', 'externer', 'externes', 'externen'],
    group: 'extern',
  },
  { key: 'external', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'extern' },
  {
    key: 'privat',
    lang: '*',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['private', 'privater', 'privates', 'privaten'],
  },
  {
    key: 'oeffentlich',
    lang: 'de',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['oeffentliche', 'oeffentlicher', 'oeffentliches', 'oeffentlichen'],
    group: 'public',
  },
  { key: 'public', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'public' },
  {
    key: 'klein',
    lang: 'de',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['kleine', 'kleiner', 'kleines', 'kleinen'],
    group: 'small',
  },
  { key: 'small', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'small' },
  {
    key: 'gross',
    lang: 'de',
    cls: 'qualifier',
    prior: 'medium',
    forms: ['grosse', 'grosser', 'grosses', 'grossen'],
    group: 'large',
  },
  { key: 'large', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'large' },
  { key: 'big', lang: 'en', cls: 'qualifier', prior: 'medium', group: 'large' },
  { key: 'online', lang: '*', cls: 'qualifier', prior: 'medium' },
  { key: 'offline', lang: '*', cls: 'qualifier', prior: 'medium' },
  { key: 'junior', lang: '*', cls: 'qualifier', prior: 'medium' },
  { key: 'senior', lang: '*', cls: 'qualifier', prior: 'medium' },
  { key: 'basic', lang: '*', cls: 'qualifier', prior: 'medium' },
  { key: 'premium', lang: '*', cls: 'qualifier', prior: 'medium' },
]
