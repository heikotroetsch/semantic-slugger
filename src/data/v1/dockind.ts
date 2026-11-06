/**
 * Doc-kind words (SPEC 15.6, rev 3.1): words that name the kind of text, not its topic. Lexicon entries
 * with cls `topic`, prior `common`, `weight: -60`, not weak: they stay in the pool and show when there is
 * room, but the content words of the same title rank above them.
 */
import type { LexiconEntry } from '../../config.ts'

export const DOCKIND_DE: readonly LexiconEntry[] = [
  { key: 'leitfaden', lang: 'de', cls: 'topic', weight: -60, pair: 'guide' },
  { key: 'ratgeber', lang: 'de', cls: 'topic', weight: -60 },
  { key: 'anleitung', lang: 'de', cls: 'topic', forms: ['anleitungen'], weight: -60, pair: 'tutorial' },
  { key: 'tipp', lang: 'de', cls: 'topic', forms: ['tipps'], weight: -60, pair: 'tip' },
  { key: 'checkliste', lang: 'de', cls: 'topic', forms: ['checklisten'], weight: -60, pair: 'checklist' },
  { key: 'vorlage', lang: 'de', cls: 'topic', forms: ['vorlagen'], weight: -60, pair: 'template' },
  { key: 'formular', lang: 'de', cls: 'topic', forms: ['formulare'], weight: -60, pair: 'form' },
  { key: 'handbuch', lang: 'de', cls: 'topic', forms: ['handbuecher'], weight: -60, pair: 'handbook' },
  { key: 'auswirkung', lang: 'de', cls: 'topic', forms: ['auswirkungen'], weight: -60, pair: 'effect' },
  { key: 'rezept', lang: 'de', cls: 'topic', forms: ['rezepte'], weight: -60, pair: 'recipe' },
]

export const DOCKIND_EN: readonly LexiconEntry[] = [
  { key: 'guide', lang: 'en', cls: 'topic', forms: ['guides'], weight: -60, pair: 'leitfaden' },
  { key: 'tip', lang: 'en', cls: 'topic', forms: ['tips'], weight: -60, pair: 'tipp' },
  { key: 'checklist', lang: 'en', cls: 'topic', forms: ['checklists'], weight: -60, pair: 'checkliste' },
  { key: 'template', lang: 'en', cls: 'topic', forms: ['templates'], weight: -60, pair: 'vorlage' },
  { key: 'form', lang: 'en', cls: 'topic', forms: ['forms'], weight: -60, pair: 'formular' },
  { key: 'handbook', lang: 'en', cls: 'topic', forms: ['handbooks'], weight: -60, pair: 'handbuch' },
  { key: 'manual', lang: 'en', cls: 'topic', forms: ['manuals'], weight: -60, pair: 'handbuch' },
  { key: 'howto', lang: 'en', cls: 'topic', weight: -60, pair: 'anleitung' },
  { key: 'tutorial', lang: 'en', cls: 'topic', forms: ['tutorials'], weight: -60, pair: 'anleitung' },
  { key: 'effect', lang: 'en', cls: 'topic', forms: ['effects'], weight: -60, pair: 'auswirkung' },
  { key: 'recipe', lang: 'en', cls: 'topic', forms: ['recipes'], weight: -60, pair: 'rezept' },
]
