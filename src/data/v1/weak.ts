/**
 * Weak words (SPEC 15.6): generic words that carry no topic in most fields. They are lexicon entries
 * (cls `topic`, prior `common`, `weak: true`), so users override them by key. Weak concepts are never in
 * the pool; the back-off (SPEC 6.5) restores them when nothing else is left.
 * Every `de` and `en` entry names its counterpart in the other language with `pair`, or is on the
 * exception list of the data test.
 */
import type { LexiconEntry } from '../../config.ts'

export const WEAK_DE: readonly LexiconEntry[] = [
  { key: 'bericht', lang: 'de', cls: 'topic', forms: ['berichte'], weak: true, pair: 'report' },
  { key: 'uebersicht', lang: 'de', cls: 'topic', weak: true, pair: 'overview' },
  { key: 'entwurf', lang: 'de', cls: 'topic', forms: ['entwuerfe'], weak: true, pair: 'draft' },
  { key: 'neu', lang: 'de', cls: 'topic', forms: ['neue', 'neuer', 'neues', 'neuen'], weak: true, pair: 'new' },
  { key: 'aktualisierung', lang: 'de', cls: 'topic', weak: true },
  {
    key: 'aktuell',
    lang: 'de',
    cls: 'topic',
    forms: ['aktuelle', 'aktueller', 'aktuelles', 'aktuellen'],
    weak: true,
    pair: 'current',
  },
  { key: 'allgemein', lang: 'de', cls: 'topic', forms: ['allgemeine', 'allgemeines'], weak: true, pair: 'general' },
  { key: 'sonstiges', lang: 'de', cls: 'topic', weak: true, pair: 'misc' },
  { key: 'sonstige', lang: 'de', cls: 'topic', weak: true },
  { key: 'diverses', lang: 'de', cls: 'topic', weak: true },
  { key: 'thema', lang: 'de', cls: 'topic', forms: ['themen'], weak: true, pair: 'topic' },
  { key: 'notiz', lang: 'de', cls: 'topic', forms: ['notizen'], weak: true, pair: 'note' },
  { key: 'hinweis', lang: 'de', cls: 'topic', forms: ['hinweise'], weak: true, pair: 'note' },
  { key: 'zusammenfassung', lang: 'de', cls: 'topic', weak: true, pair: 'summary' },
  { key: 'liste', lang: 'de', cls: 'topic', forms: ['listen'], weak: true, pair: 'list' },
  { key: 'projekt', lang: 'de', cls: 'topic', forms: ['projekte'], abbr: ['proj'], weak: true, pair: 'project' },
  { key: 'planung', lang: 'de', cls: 'topic', weak: true, pair: 'planning' },
  { key: 'besprechung', lang: 'de', cls: 'topic', forms: ['besprechungen'], weak: true, pair: 'meeting' },
  { key: 'sitzung', lang: 'de', cls: 'topic', forms: ['sitzungen'], weak: true, pair: 'session' },
  { key: 'protokoll', lang: 'de', cls: 'topic', forms: ['protokolle'], weak: true, pair: 'minutes' },
  { key: 'wichtig', lang: 'de', cls: 'topic', weak: true, pair: 'important' },
  { key: 'dringend', lang: 'de', cls: 'topic', weak: true, pair: 'urgent' },
  { key: 'woechentlich', lang: 'de', cls: 'topic', weak: true, pair: 'weekly' },
  { key: 'monatlich', lang: 'de', cls: 'topic', weak: true, pair: 'monthly' },
  { key: 'jaehrlich', lang: 'de', cls: 'topic', weak: true, pair: 'annual' },
  { key: 'taeglich', lang: 'de', cls: 'topic', weak: true, pair: 'daily' },
  { key: 'quartalsweise', lang: 'de', cls: 'topic', weak: true, pair: 'quarterly' },
  { key: 'weltweit', lang: 'de', cls: 'topic', weak: true, pair: 'global' },
]

export const WEAK_EN: readonly LexiconEntry[] = [
  { key: 'report', lang: 'en', cls: 'topic', forms: ['reports'], weak: true, pair: 'bericht' },
  { key: 'overview', lang: 'en', cls: 'topic', weak: true, pair: 'uebersicht' },
  { key: 'draft', lang: 'en', cls: 'topic', forms: ['drafts'], weak: true, pair: 'entwurf' },
  { key: 'new', lang: 'en', cls: 'topic', weak: true, pair: 'neu' },
  { key: 'note', lang: 'en', cls: 'topic', forms: ['notes'], weak: true, pair: 'notiz' },
  { key: 'summary', lang: 'en', cls: 'topic', weak: true, pair: 'zusammenfassung' },
  { key: 'general', lang: 'en', cls: 'topic', weak: true, pair: 'allgemein' },
  { key: 'misc', lang: 'en', cls: 'topic', weak: true, pair: 'sonstiges' },
  { key: 'miscellaneous', lang: 'en', cls: 'topic', weak: true },
  { key: 'item', lang: 'en', cls: 'topic', forms: ['items'], weak: true },
  { key: 'list', lang: 'en', cls: 'topic', forms: ['lists'], weak: true, pair: 'liste' },
  { key: 'topic', lang: 'en', cls: 'topic', forms: ['topics'], weak: true, pair: 'thema' },
  { key: 'project', lang: 'en', cls: 'topic', forms: ['projects'], abbr: ['proj'], weak: true, pair: 'projekt' },
  { key: 'planning', lang: 'en', cls: 'topic', weak: true, pair: 'planung' },
  { key: 'minutes', lang: 'en', cls: 'topic', weak: true, pair: 'protokoll' },
  { key: 'session', lang: 'en', cls: 'topic', forms: ['sessions'], weak: true, pair: 'sitzung' },
  { key: 'current', lang: 'en', cls: 'topic', weak: true, pair: 'aktuell' },
  { key: 'weekly', lang: 'en', cls: 'topic', weak: true, pair: 'woechentlich' },
  { key: 'monthly', lang: 'en', cls: 'topic', weak: true, pair: 'monatlich' },
  { key: 'quarterly', lang: 'en', cls: 'topic', weak: true, pair: 'quartalsweise' },
  { key: 'annual', lang: 'en', cls: 'topic', weak: true, pair: 'jaehrlich' },
  { key: 'yearly', lang: 'en', cls: 'topic', weak: true, pair: 'jaehrlich' },
  { key: 'daily', lang: 'en', cls: 'topic', weak: true, pair: 'taeglich' },
  { key: 'global', lang: 'en', cls: 'topic', weak: true, pair: 'weltweit' },
  { key: 'various', lang: 'en', cls: 'topic', weak: true },
  { key: 'important', lang: 'en', cls: 'topic', weak: true, pair: 'wichtig' },
  { key: 'urgent', lang: 'en', cls: 'topic', weak: true, pair: 'dringend' },
]

export const WEAK_SHARED: readonly LexiconEntry[] = [
  { key: 'update', lang: '*', cls: 'topic', forms: ['updates'], weak: true },
  { key: 'final', lang: '*', cls: 'topic', weak: true },
  { key: 'team', lang: '*', cls: 'topic', forms: ['teams'], weak: true },
  { key: 'plan', lang: '*', cls: 'topic', forms: ['plans'], weak: true },
  { key: 'status', lang: '*', cls: 'topic', weak: true },
  { key: 'asap', lang: '*', cls: 'topic', weak: true },
]
