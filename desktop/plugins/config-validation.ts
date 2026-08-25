// desktop/plugins/config-validation.ts
//
// Schema-driven validation for plugin config. The plugin manifest declares a
// `config` schema (PluginConfigField). These helpers coerce and validate raw
// values against that schema so the UI can surface typed errors and plugins
// receive values matching their declared types.

import type { PluginConfigField, PluginManifest } from './types'

export interface FieldValidationResult {
  ok: boolean
  value?: unknown
  error?: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ key: string; error: string }>
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/** Coerce + validate a single raw value against its declared field schema. */
export function validateConfigValue(
  field: PluginConfigField,
  value: unknown,
): FieldValidationResult {
  if (isBlank(value)) {
    if (field.required) {
      return { ok: false, error: `${field.label} is required` }
    }
    if (field.type === 'list' || field.type === 'path-list' || field.type === 'instances') {
      return { ok: true, value: [] }
    }
    return { ok: true, value: value ?? field.default ?? undefined }
  }

  switch (field.type) {
    case 'string':
    case 'secret':
    case 'uuid': {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be text` }
      }
      if (field.pattern && !new RegExp(field.pattern).test(value)) {
        return { ok: false, error: `${field.label} does not match the required format` }
      }
      return { ok: true, value }
    }

    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(n)) {
        return { ok: false, error: `${field.label} must be a number` }
      }
      if (field.min !== undefined && n < field.min) {
        return { ok: false, error: `${field.label} must be at least ${field.min}` }
      }
      if (field.max !== undefined && n > field.max) {
        return { ok: false, error: `${field.label} must be at most ${field.max}` }
      }
      return { ok: true, value: n }
    }

    case 'boolean':
      return {
        ok: true,
        value: value === true || value === 'true' || value === 1 || value === '1',
      }

    case 'enum': {
      const allowed = (field.values as string[] | undefined) || []
      if (typeof value !== 'string' || !allowed.includes(value)) {
        return {
          ok: false,
          error: `${field.label} must be one of: ${allowed.join(', ')}`,
        }
      }
      return { ok: true, value }
    }

    case 'select': {
      const allowed = (field.values as Array<{ value: string; label: string }> | undefined) || []
      const raw = typeof value === 'string' ? value : (value as { value?: string } | null)?.value
      if (typeof raw !== 'string' || !allowed.some((o) => o.value === raw)) {
        return { ok: false, error: `${field.label} has an invalid value` }
      }
      return { ok: true, value: raw }
    }

    case 'path-list': {
      if (typeof value === 'string') {
        return { ok: true, value: [value] }
      }
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        return { ok: true, value }
      }
      return { ok: false, error: `${field.label} must be a path or list of paths` }
    }

    case 'list': {
      if (!Array.isArray(value)) {
        return { ok: false, error: `${field.label} must be a list` }
      }
      if (field.items) {
        for (const item of value) {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return { ok: false, error: `${field.label} items must be objects` }
          }
        }
      } else {
        for (const item of value) {
          if (typeof item !== 'string') {
            return { ok: false, error: `${field.label} items must be text` }
          }
        }
      }
      return { ok: true, value }
    }

    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false, error: `${field.label} must be an object` }
      }
      return { ok: true, value }
    }

    case 'serverUrl': {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be a URL string` }
      }
      return { ok: true, value }
    }

    case 'instances': {
      // Instances are managed through the plugin's own data methods, so the
      // stored value is just an opaque array of per-server objects.
      if (!Array.isArray(value)) {
        return { ok: false, error: `${field.label} must be a list` }
      }
      if (field.items) {
        for (const item of value) {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return { ok: false, error: `${field.label} items must be objects` }
          }
        }
      }
      return { ok: true, value }
    }

    default:
      return { ok: true, value }
  }
}

/** Validate every declared field present in a full config object. */
export function validateConfig(
  manifest: Pick<PluginManifest, 'config'>,
  config: Record<string, unknown>,
): ConfigValidationResult {
  const errors: ConfigValidationResult['errors'] = []
  const fields = manifest.config || {}
  for (const [key, field] of Object.entries(fields)) {
    const result = validateConfigValue(field, config[key])
    if (!result.ok) {
      errors.push({ key, error: result.error! })
    }
  }
  return { valid: errors.length === 0, errors }
}

/** True when the manifest declares a config schema for this key. */
export function hasConfigField(
  manifest: Pick<PluginManifest, 'config'>,
  key: string,
): boolean {
  return Boolean(manifest.config?.[key])
}
