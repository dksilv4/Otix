// desktop/plugins/errors.ts

import { AppError } from '../app-errors'

export { AppError, isAppError, toAppError, type ErrorCategory, type AppErrorOptions } from '../app-errors'

export class PluginError extends AppError {
  constructor(message: string, public readonly pluginId: string, code = 'PLUGIN_ERROR') {
    super(message, { code, category: 'plugin', details: { pluginId } })
    this.name = 'PluginError'
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`, pluginId, 'PLUGIN_NOT_FOUND')
    this.name = 'PluginNotFoundError'
  }
}

export class PluginNotRunningError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not running: ${pluginId}`, pluginId, 'PLUGIN_NOT_RUNNING')
    this.name = 'PluginNotRunningError'
  }
}

export class PluginIncompatibleError extends PluginError {
  constructor(pluginId: string, reason: string) {
    super(`Plugin incompatible: ${pluginId} — ${reason}`, pluginId, 'PLUGIN_INCOMPATIBLE')
    this.name = 'PluginIncompatibleError'
  }
}

export class PluginSandboxError extends PluginError {
  constructor(pluginId: string, cause: string) {
    super(`Plugin sandbox error: ${pluginId} — ${cause}`, pluginId, 'PLUGIN_SANDBOX_ERROR')
    this.name = 'PluginSandboxError'
  }
}

export class PluginTimeoutError extends PluginError {
  constructor(pluginId: string, phase: string) {
    super(`Plugin ${pluginId} timed out during ${phase}`, pluginId, 'PLUGIN_TIMEOUT')
    this.name = 'PluginTimeoutError'
  }
}

export class SlotError extends AppError {
  constructor(
    message: string,
    public readonly location: string,
    public readonly pluginId: string,
    code = 'SLOT_ERROR'
  ) {
    super(message, { code, category: 'slot', details: { location, pluginId } })
    this.name = 'SlotError'
  }
}

export class SlotRenderError extends SlotError {
  constructor(location: string, pluginId: string, cause: string) {
    super(`Slot render failed: ${location} — ${cause}`, location, pluginId, 'SLOT_RENDER_FAILED')
    this.name = 'SlotRenderError'
  }
}

export class SlotValidationError extends SlotError {
  constructor(location: string, pluginId: string, field: string) {
    super(`Slot validation failed: ${location} — invalid field "${field}"`, location, pluginId, 'SLOT_VALIDATION_FAILED')
    this.name = 'SlotValidationError'
  }
}

export class SlotSuspendedError extends SlotError {
  constructor(location: string, pluginId: string) {
    super(`Slot suspended for plugin ${pluginId} at ${location} due to repeated failures`, location, pluginId, 'SLOT_SUSPENDED')
    this.name = 'SlotSuspendedError'
  }
}

export class PermissionError extends AppError {
  constructor(message: string, code = 'PERMISSION_ERROR', details?: Record<string, unknown>) {
    super(message, { code, category: 'permission', details })
    this.name = 'PermissionError'
  }
}

export class PermissionDeniedError extends PermissionError {
  constructor(public readonly pluginId: string, public readonly permission: string) {
    super(`Permission denied: ${pluginId} — ${permission}`, 'PERMISSION_DENIED', { pluginId, permission })
    this.name = 'PermissionDeniedError'
  }
}

export class PermissionTimeoutError extends PermissionError {
  constructor(public readonly pluginId: string, public readonly permission: string) {
    super(`Permission request timed out: ${pluginId} — ${permission}`, 'PERMISSION_TIMEOUT', { pluginId, permission })
    this.name = 'PermissionTimeoutError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, code = 'DATABASE_ERROR', details?: Record<string, unknown>) {
    super(message, { code, category: 'database', details })
    this.name = 'DatabaseError'
  }
}

export class MigrationError extends DatabaseError {
  constructor(dbName: string, migrationId: number, cause: string) {
    super(`Migration failed for ${dbName} at migration ${migrationId}: ${cause}`, 'MIGRATION_FAILED', { dbName, migrationId, cause })
    this.name = 'MigrationError'
  }
}
