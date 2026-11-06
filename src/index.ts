/**
 * semantic-slugger: short, readable, unique IDs from titles. Browser-safe core.
 */

export type {
  ConceptClass,
  DefaultConfig,
  DetectedLang,
  Lang,
  LexiconEntry,
  ListOption,
  ResolvedConfig,
  SluggerConfig,
} from './config.ts'
export { DEFAULTS } from './config.ts'
export type {
  AbortSignalLike,
  MaybePromise,
  SlugRecord,
  SlugStore,
  StoreContext,
} from './core/resolve.ts'
export { ALGORITHM_VERSION } from './data/v1/constants.ts'
export type { ConfigErrorDetails, ConflictErrorDetails, ExhaustedErrorDetails, SluggerErrorCode } from './errors.ts'
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
export type { Segment, SlugReason, SlugResult, SlugWarning, StoreTier } from './result.ts'
export { createSlugger, isValidSlug, type Slugger } from './slugger.ts'
