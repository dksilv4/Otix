// desktop/app-errors.ts

export type ErrorCategory = 'plugin' | 'slot' | 'permission' | 'database' | 'system' | 'network'

export interface AppErrorOptions {
  code?: string
  category?: ErrorCategory
  details?: Record<string, unknown>
  cause?: Error | unknown
}

export class AppError extends Error {
  public readonly code: string
  public readonly category: ErrorCategory
  public readonly details: Record<string, unknown>
  public readonly timestamp: string

  constructor(message: string, options?: AppErrorOptions) {
    super(message)
    this.name = 'AppError'
    this.code = options?.code || 'ERR_INTERNAL'
    this.category = options?.category || 'system'
    this.details = options?.details || {}
    this.timestamp = new Date().toISOString()

    if (options?.cause) {
      this.cause = options.cause
    }

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      details: this.details,
      timestamp: this.timestamp,
    }
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError || (typeof err === 'object' && err !== null && 'code' in err && 'category' in err)
}

export function toAppError(err: unknown, defaultMessage = 'An unexpected error occurred'): AppError {
  if (isAppError(err)) return err
  if (err instanceof Error) {
    return new AppError(err.message, { cause: err })
  }
  return new AppError(typeof err === 'string' ? err : defaultMessage, { details: { raw: err } })
}
