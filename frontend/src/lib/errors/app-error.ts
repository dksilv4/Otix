// frontend/src/lib/errors/app-error.ts

export type ErrorCategory = 'plugin' | 'slot' | 'permission' | 'database' | 'system' | 'network' | 'auth' | 'api'

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

    const ErrorCtor = Error as unknown as { captureStackTrace?: (target: object, constructorOpt?: Function) => void }
    if (typeof ErrorCtor.captureStackTrace === 'function') {
      ErrorCtor.captureStackTrace(this, this.constructor)
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

export class PluginError extends AppError {
  public readonly pluginId: string

  constructor(message: string, pluginId: string, code = 'PLUGIN_ERROR') {
    super(message, { code, category: 'plugin', details: { pluginId } })
    this.name = 'PluginError'
    this.pluginId = pluginId
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`, pluginId, 'PLUGIN_NOT_FOUND')
    this.name = 'PluginNotFoundError'
  }
}

export class SlotError extends AppError {
  public readonly location: string
  public readonly pluginId: string

  constructor(
    message: string,
    location: string,
    pluginId: string,
    code = 'SLOT_ERROR'
  ) {
    super(message, { code, category: 'slot', details: { location, pluginId } })
    this.name = 'SlotError'
    this.location = location
    this.pluginId = pluginId
  }
}

export class PermissionError extends AppError {
  constructor(message: string, code = 'PERMISSION_ERROR', details?: Record<string, unknown>) {
    super(message, { code, category: 'permission', details })
    this.name = 'PermissionError'
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
