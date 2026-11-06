/**
 * semantic-slugger: short, readable, unique IDs from any title. Browser-safe core.
 */

export type {
  ConceptClass,
  DefaultConfig,
  DetectedLang,
  Lang,
  LexiconClass,
  LexiconEntry,
  ListOption,
  ResolvedConfig,
  SluggerConfig,
} from './config.ts'
export { DEFAULTS } from './config.ts'
export type { Analysis, AnalysisConcept, AnalysisToken } from './core/analyze.ts'
export type { Concept } from './core/concepts.ts'
export type { RankRow } from './core/rank.ts'
export type {
  AbortSignalLike,
  MaybePromise,
  SlugRecord,
  SlugStore,
  StoreContext,
} from './core/resolve.ts'
export { isUniqueViolation } from './core/unique.ts'
export { ALGORITHM_VERSION } from './data/v1/constants.ts'
export type {
  ConfigErrorDetails,
  ConflictErrorDetails,
  ExhaustedErrorDetails,
  ExhaustedErrorOptions,
  SluggerErrorCode,
} from './errors.ts'
export {
  ConfigError,
  ConflictError,
  ExhaustedError,
  InputError,
  InternalError,
  isSluggerError,
  SluggerError,
  StoreError,
} from './errors.ts'
/** @experimental (SPEC 6.7) */
export type { LanguagePack } from './lang/pack.ts'
export type { Segment, SlugReason, SlugResult, SlugWarning, StoreTier } from './result.ts'
export {
  type AnalyzeOptions,
  analyze,
  type CreateUniqueOptions,
  type CreateUniqueResult,
  createSlugger,
  createUnique,
  type GenerateOptions,
  generate,
  isValidSlug,
  type Slugger,
  type SuggestOptions,
  slug,
  slugMany,
  suggest,
} from './slugger.ts'
