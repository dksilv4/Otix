// desktop/plugins/errors.ts

export class PluginError extends Error {
  constructor(message: string, public readonly pluginId: string) {
    super(message)
    this.name = 'PluginError'
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`, pluginId)
    this.name = 'PluginNotFoundError'
  }
}

export class PluginNotRunningError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not running: ${pluginId}`, pluginId)
    this.name = 'PluginNotRunningError'
  }
}

export class PluginIncompatibleError extends PluginError {
  constructor(pluginId: string, reason: string) {
    super(`Plugin incompatible: ${pluginId} — ${reason}`, pluginId)
    this.name = 'PluginIncompatibleError'
  }
}

export class PluginSandboxError extends PluginError {
  constructor(pluginId: string, cause: string) {
    super(`Plugin sandbox error: ${pluginId} — ${cause}`, pluginId)
    this.name = 'PluginSandboxError'
  }
}

export class PluginTimeoutError extends PluginError {
  constructor(pluginId: string, phase: string) {
    super(`Plugin ${pluginId} timed out during ${phase}`, pluginId)
    this.name = 'PluginTimeoutError'
  }
}

export class SlotError extends Error {
  constructor(
    message: string,
    public readonly location: string,
    public readonly pluginId: string
  ) {
    super(message)
    this.name = 'SlotError'
  }
}

export class SlotRenderError extends SlotError {
  constructor(location: string, pluginId: string, cause: string) {
    super(`Slot render failed: ${location} — ${cause}`, location, pluginId)
    this.name = 'SlotRenderError'
  }
}

export class SlotValidationError extends SlotError {
  constructor(location: string, pluginId: string, field: string) {
    super(`Slot validation failed: ${location} — invalid field "${field}"`, location, pluginId)
    this.name = 'SlotValidationError'
  }
}

export class SlotSuspendedError extends SlotError {
  constructor(location: string, pluginId: string) {
    super(`Slot suspended for plugin ${pluginId} at ${location} due to repeated failures`, location, pluginId)
    this.name = 'SlotSuspendedError'
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

export class PermissionDeniedError extends PermissionError {
  constructor(pluginId: string, permission: string) {
    super(`Permission denied: ${pluginId} — ${permission}`)
    this.name = 'PermissionDeniedError'
  }
}

export class PermissionTimeoutError extends PermissionError {
  constructor(pluginId: string, permission: string) {
    super(`Permission request timed out: ${pluginId} — ${permission}`)
    this.name = 'PermissionTimeoutError'
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class MigrationError extends DatabaseError {
  constructor(dbName: string, migrationId: number, cause: string) {
    super(`Migration failed for ${dbName} at migration ${migrationId}: ${cause}`)
    this.name = 'MigrationError'
  }
}
