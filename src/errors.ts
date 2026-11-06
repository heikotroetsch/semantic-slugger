/**
 * Error classes (SPEC 16.5). All extend SluggerError and carry a `code`.
 * `isSluggerError` checks a global symbol brand, so it works across the ESM and CJS copies.
 * The library never logs.
 */

const BRAND_KEY = 'semantic-slugger.error'

export type SluggerErrorCode = 'E_CONFIG' | 'E_INPUT' | 'E_EXHAUSTED' | 'E_CONFLICT' | 'E_STORE' | 'E_INTERNAL'

export interface ConfigErrorDetails {
  field: string
  value: unknown
  reason: string
}
export interface ExhaustedErrorDetails {
  body: string
  tailIndex: number
  tries: number
}
export interface ConflictErrorDetails {
  tried: readonly string[]
}

export class SluggerError extends Error {
  readonly code: SluggerErrorCode
  readonly details: unknown

  constructor(code: SluggerErrorCode, message: string, details?: unknown, options?: { cause?: unknown }) {
    super(message, options && 'cause' in options ? { cause: options.cause } : undefined)
    this.name = 'SluggerError'
    this.code = code
    this.details = details
    Object.defineProperty(this, Symbol.for(BRAND_KEY), { value: true })
  }
}

export class ConfigError extends SluggerError {
  declare readonly details: ConfigErrorDetails | undefined
  constructor(message: string, details?: ConfigErrorDetails) {
    super('E_CONFIG', message, details)
    this.name = 'ConfigError'
  }
}

export class InputError extends SluggerError {
  constructor(message: string, details?: unknown) {
    super('E_INPUT', message, details)
    this.name = 'InputError'
  }
}

export class ExhaustedError extends SluggerError {
  declare readonly details: ExhaustedErrorDetails
  constructor(details: ExhaustedErrorDetails, message?: string) {
    super(
      'E_EXHAUSTED',
      message ??
        `all ${details.tries} tried tail IDs from index ${details.tailIndex} are taken for body "${details.body}". ` +
          'Use a store that implements countBody (tier B or C) for many rows with the same title.',
      details,
    )
    this.name = 'ExhaustedError'
  }
}

export class ConflictError extends SluggerError {
  declare readonly details: ConflictErrorDetails
  constructor(details: ConflictErrorDetails) {
    super('E_CONFLICT', `insert lost ${details.tried.length} races; tried: ${details.tried.join(', ')}`, details)
    this.name = 'ConflictError'
  }
}

export class StoreError extends SluggerError {
  constructor(cause: unknown, message = 'store call failed') {
    super('E_STORE', message, undefined, { cause })
    this.name = 'StoreError'
  }
}

export class InternalError extends SluggerError {
  constructor(message: string, details?: unknown) {
    super('E_INTERNAL', message, details)
    this.name = 'InternalError'
  }
}

/** True when `e` is an error from any copy of this library, and (if given) has this code. */
export function isSluggerError(e: unknown, code?: SluggerErrorCode | string): e is SluggerError {
  if (typeof e !== 'object' || e === null) return false
  if ((e as Record<symbol, unknown>)[Symbol.for(BRAND_KEY)] !== true) return false
  return code === undefined || (e as { code?: unknown }).code === code
}
