/**
 * Shared entries (`lang: '*'`, SPEC 15.5): same spelling and meaning in German and English.
 * They add no language score (SPEC 6.1).
 */
import type { LexiconEntry } from '../../config.ts'

export const LEXICON_SHARED: readonly LexiconEntry[] = [
  {
    key: 'international',
    lang: '*',
    cls: 'topic',
    forms: ['internationale', 'internationalen', 'internationaler'],
    abbr: ['intl'],
    known: ['intl'],
  },
  {
    key: 'information',
    lang: '*',
    cls: 'topic',
    forms: ['informationen', 'info', 'infos'],
    abbr: ['info'],
    known: ['info'],
    weak: true,
  },
  { key: 'marketing', lang: '*', cls: 'topic', abbr: ['mktg'], known: ['mktg'] },
  { key: 'software', lang: '*', cls: 'topic', abbr: ['sw'], known: ['sw'] },
  { key: 'hardware', lang: '*', cls: 'topic', abbr: ['hw'], known: ['hw'] },
  { key: 'it', lang: '*', cls: 'topic', abbr: ['it'], known: ['it'], upperOnly: true },
  { key: 'erp', lang: '*', cls: 'topic', abbr: ['erp'], known: ['erp'] },
  { key: 'crm', lang: '*', cls: 'topic', abbr: ['crm'], known: ['crm'], group: 'crm' },
  { key: 'api', lang: '*', cls: 'topic', forms: ['apis'], abbr: ['api'], known: ['api'] },
  { key: 'app', lang: '*', cls: 'topic', forms: ['apps'], abbr: ['app'], known: ['app'], group: 'app' },
  { key: 'email', lang: '*', cls: 'topic', forms: ['mail'], abbr: ['mail'], known: ['mail'] },
  { key: 'onboarding', lang: '*', cls: 'topic', abbr: ['onb'] },
  { key: 'kickoff', lang: '*', cls: 'topic', phrase: ['kick off'], abbr: ['kickoff'], known: ['kickoff'] },
  { key: 'workshop', lang: '*', cls: 'topic', forms: ['workshops'] },
  { key: 'webinar', lang: '*', cls: 'topic' },
  { key: 'newsletter', lang: '*', cls: 'topic' },
  { key: 'podcast', lang: '*', cls: 'topic' },
  { key: 'west', lang: '*', cls: 'direction', prior: 'medium' },
  { key: 'emea', lang: '*', cls: 'region', abbr: ['emea'], known: ['emea'], prior: 'medium' },
  { key: 'apac', lang: '*', cls: 'region', abbr: ['apac'], known: ['apac'], prior: 'medium' },
  { key: 'latam', lang: '*', cls: 'region', abbr: ['latam'], known: ['latam'], prior: 'medium' },
  {
    key: 'dachregion',
    lang: '*',
    cls: 'region',
    forms: ['dach'],
    abbr: ['dach'],
    known: ['dach'],
    prior: 'medium',
    upperOnly: true,
    part: false,
  },
  { key: 'eu', lang: '*', cls: 'region', abbr: ['eu'], known: ['eu'], prior: 'medium', upperOnly: true, group: 'eu' },
  { key: 'us', lang: '*', cls: 'region', abbr: ['us'], known: ['us'], prior: 'medium', upperOnly: true, group: 'us' },
  { key: 'uk', lang: '*', cls: 'region', abbr: ['uk'], known: ['uk'], prior: 'medium', group: 'uk' },
]
