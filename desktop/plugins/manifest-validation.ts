// desktop/plugins/manifest-validation.ts
//
// Structural validation of a plugin manifest's declared surface: required
// top-level fields, permission tokens, and — the important part — the
// `config` field *schema* itself.
//
// The value validators in config-validation.ts coerce stored values against a
// field's schema, but a malformed schema (typo'd field type, select with no
// options, invalid regex) currently slips through: unknown field types hit
// validateConfigValue's `default` branch and pass silently, and the settings
// UI renders nothing for them. This module catches those authoring mistakes
// up front so they fail loudly at load/enable instead of silently misbehaving.
//
// Errors are load-blocking. Warnings are surfaced (dev reload / author
// tooling) but never block — tolerated for forward-compat with plugin
// manifests that declare richer fields than the host currently understands.

import { validateConfigValue } from './config-validation'
import type { PluginConfigField, PluginPermission } from './types'

export interface ManifestIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface ManifestValidationResult {
  /** True when there are no error-severity issues. */
  valid: boolean
  issues: ManifestIssue[]
}

/** Field `type` tokens the host can render + validate (mirror of PluginConfigFieldType). */
const FIELD_TYPES: string[] = [
  'string',
  'number',
  'boolean',
  'secret',
  'enum',
  'select',
  'uuid',
  'list',
  'path-list',
  'object',
  'instances',
  'serverUrl',
]
const FIELD_TYPES_SET = new Set(FIELD_TYPES)

/** Declared permission tokens (mirror of PluginPermission). `table:<name>` is a pattern. */
const BASE_PERMISSIONS: PluginPermission[] = [
  'network:external',
  'storage:local',
  'events:subscribe',
  'ui:settings',
  'ui:media.actions',
  'ui:list.actions',
  'ui:nav.item',
  'ui:dashboard.widget',
  'notifications',
  'api:proxy',
  'worker:filesystem',
  'ui:command',
]

/** Every property PluginConfigField declares (unknown props become warnings). */
const FIELD_PROP_KEYS = new Set([
  'type',
  'label',
  'description',
  'default',
  'values',
  'items',
  'required',
  'advanced',
  'section',
  'order',
  'placeholder',
  'min',
  'max',
  'step',
  'pattern',
  'sensitive',
  'if',
  'connection',
  'parts',
  'fetchable',
])

const STAGES = new Set(['alpha', 'beta', 'stable'])

const error = (path: string, message: string): ManifestIssue => ({
  path,
  message,
  severity: 'error',
})
const warn = (path: string, message: string): ManifestIssue => ({
  path,
  message,
  severity: 'warning',
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isKnownPermission(p: string): boolean {
  if ((BASE_PERMISSIONS as string[]).includes(p)) return true
  return /^table:.+/.test(p)
}

/** Validate a plugin manifest's loadable surface. `raw` is the parsed manifest.json. */
export function validateManifestSchema(raw: unknown): ManifestValidationResult {
  const issues: ManifestIssue[] = []

  if (!isRecord(raw)) {
    issues.push(error('', 'manifest must be a JSON object'))
    return { valid: false, issues }
  }

  // Required identity fields. description/author stay warnings to match
  // discoverPlugins's own leniency (it falls back to '' for both).
  for (const key of ['name', 'version'] as const) {
    const v = raw[key]
    if (typeof v !== 'string' || !v.trim()) {
      issues.push(error(key, `must be a non-empty string`))
    }
  }
  for (const key of ['description', 'author', 'repository', 'icon'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      issues.push(warn(key, 'should be a string'))
    }
  }

  const entry = raw.entry
  if (!isRecord(entry) || typeof entry.main !== 'string' || !entry.main) {
    issues.push(error('entry.main', 'must name a plugin entry file'))
  }

  if (raw.min_app_version !== undefined && typeof raw.min_app_version !== 'string') {
    issues.push(warn('min_app_version', 'should be a string'))
  }
  if (raw.system !== undefined && typeof raw.system !== 'boolean') {
    issues.push(warn('system', 'should be a boolean'))
  }
  if (raw.stage !== undefined && (typeof raw.stage !== 'string' || !STAGES.has(raw.stage))) {
    issues.push(warn('stage', 'should be one of alpha|beta|stable'))
  }
  if (raw.timeout !== undefined && typeof raw.timeout !== 'number') {
    issues.push(warn('timeout', 'should be a number (ms)'))
  }

  // Permissions
  if (raw.permissions === undefined) {
    issues.push(warn('permissions', 'no permissions declared'))
  } else if (!Array.isArray(raw.permissions) || raw.permissions.some((p) => typeof p !== 'string')) {
    issues.push(error('permissions', 'must be an array of permission tokens'))
  } else {
    for (const p of raw.permissions as string[]) {
      if (!isKnownPermission(p)) {
        issues.push(
          error(
            `permissions.${p}`,
            `unknown permission token — it can never be granted at runtime`,
          ),
        )
      }
    }
  }

  // Config schema — the part that silently breaks today.
  if (raw.config !== undefined) {
    if (!isRecord(raw.config)) {
      issues.push(error('config', 'must be an object of named config fields'))
    } else {
      validateFieldMap(raw.config, 'config', issues, 0)
    }
  }

  checkTopLevelShape(raw, issues)

  return { valid: issues.every((i) => i.severity !== 'error'), issues }
}

/** Validate a record of named config fields (top-level `config` or an `items`/`object` body). */
function validateFieldMap(
  map: Record<string, unknown>,
  path: string,
  issues: ManifestIssue[],
  depth: number,
): void {
  if (depth > 6) {
    issues.push(error(path, 'config schema nests too deeply'))
    return
  }
  const siblingKeys = new Set(Object.keys(map))
  for (const [key, fieldRaw] of Object.entries(map)) {
    const fieldPath = `${path}.${key}`
    if (!isRecord(fieldRaw)) {
      issues.push(error(fieldPath, 'config field must be an object'))
      continue
    }
    validateField(fieldRaw, fieldPath, issues, depth, siblingKeys)
  }
}

function validateField(
  field: Record<string, unknown>,
  path: string,
  issues: ManifestIssue[],
  depth: number,
  siblingKeys: Set<string>,
): void {
  const type = field.type
  if (typeof type !== 'string' || !type) {
    issues.push(error(`${path}.type`, 'config field must declare a string `type`'))
    return
  }
  if (!FIELD_TYPES_SET.has(type)) {
    issues.push(
      error(
        `${path}.type`,
        `unsupported config field type "${type}" (supported: ${FIELD_TYPES.join(', ')})`,
      ),
    )
    return
  }
  if (typeof field.label !== 'string' || !field.label) {
    issues.push(error(`${path}.label`, `config field requires a human-readable \`label\``))
  }

  // Unknown properties are forward-compat noise, not load blockers.
  for (const key of Object.keys(field)) {
    if (!FIELD_PROP_KEYS.has(key)) {
      issues.push(warn(`${path}.${key}`, `unknown config field property — ignored by the host`))
    }
  }

  // Numeric bounds sanity
  for (const key of ['min', 'max', 'step'] as const) {
    if (field[key] !== undefined && typeof field[key] !== 'number') {
      issues.push(warn(`${path}.${key}`, 'should be a number'))
    }
  }
  if (
    typeof field.min === 'number' &&
    typeof field.max === 'number' &&
    field.min > field.max
  ) {
    issues.push(warn(`${path}`, '`min` is greater than `max`'))
  }

  switch (type) {
    case 'enum': {
      if (field.values === undefined) {
        issues.push(warn(`${path}.values`, 'enum has no options'))
      } else if (
        !Array.isArray(field.values) ||
        field.values.some((v) => typeof v !== 'string')
      ) {
        issues.push(error(`${path}.values`, 'enum `values` must be an array of strings'))
      }
      break
    }

    case 'select': {
      const values = field.values
      if (!Array.isArray(values) || values.length === 0) {
        issues.push(error(`${path}.values`, 'select requires non-empty `values` of { value, label } entries'))
      } else {
        for (const [i, v] of values.entries()) {
          if (!isRecord(v) || typeof v.value !== 'string' || typeof v.label !== 'string') {
            issues.push(error(`${path}.values[${i}]`, 'select entries must be { value, label } objects'))
          }
        }
      }
      break
    }

    case 'string':
    case 'secret': {
      checkPattern(field, path, issues)
      break
    }

    case 'list': {
      checkNestedItems(field, path, issues, depth, true)
      break
    }

    case 'object': {
      const items = field.items
      if (!isRecord(items) || Object.keys(items).length === 0) {
        issues.push(error(`${path}.items`, 'object field requires non-empty `items` sub-schema'))
      } else {
        validateFieldMap(items, `${path}.items`, issues, depth + 1)
      }
      break
    }

    case 'instances': {
      if (field.items !== undefined) {
        if (!isRecord(field.items)) {
          issues.push(error(`${path}.items`, 'instances `items` must be an object of per-instance fields'))
        } else {
          validateFieldMap(field.items, `${path}.items`, issues, depth + 1)
        }
      }
      const connection = field.connection
      if (connection !== undefined) {
        if (!isRecord(connection)) {
          issues.push(error(`${path}.connection`, 'must be an object with optional method/fields'))
        } else {
          if (connection.method !== undefined && typeof connection.method !== 'string') {
            issues.push(warn(`${path}.connection.method`, 'should be a string'))
          }
          if (
            connection.fields !== undefined &&
            (!Array.isArray(connection.fields) ||
              connection.fields.some((f) => typeof f !== 'string'))
          ) {
            issues.push(error(`${path}.connection.fields`, 'must be an array of instance item keys'))
          } else if (Array.isArray(connection.fields) && isRecord(field.items)) {
            for (const f of connection.fields as string[]) {
              if (!(f in (field.items as Record<string, unknown>))) {
                issues.push(
                  warn(
                    `${path}.connection.fields`,
                    `"${f}" does not name an instance item — the connect form cannot render it`,
                  ),
                )
              }
            }
          }
        }
      }
      break
    }

    case 'serverUrl': {
      const parts = field.parts
      if (
        parts !== undefined &&
        (!Array.isArray(parts) || parts.some((p) => typeof p !== 'string'))
      ) {
        issues.push(warn(`${path}.parts`, 'should be an array of URL part keys'))
      }
      break
    }

    default:
      break
  }

  // Conditional visibility must reference a sibling field.
  if (field.if !== undefined) {
    const ifSpec = field.if
    if (!isRecord(ifSpec)) {
      issues.push(error(`${path}.if`, 'must be an object referencing another field'))
    } else {
      if (typeof ifSpec.field !== 'string' || !ifSpec.field) {
        issues.push(error(`${path}.if.field`, 'must name the controlling field'))
      } else if (!siblingKeys.has(ifSpec.field)) {
        issues.push(
          warn(`${path}.if.field`, `references missing field "${ifSpec.field}" — condition never applies`),
        )
      }
      if (ifSpec.truthy !== undefined && typeof ifSpec.truthy !== 'boolean') {
        issues.push(warn(`${path}.if.truthy`, 'should be a boolean'))
      }
    }
  }

  // A `default` should be something the field's own validator would accept.
  if (field.default !== undefined && field.default !== null) {
    const coerced = validateConfigValue(field as unknown as PluginConfigField, field.default)
    if (!coerced.ok) {
      issues.push(warn(`${path}.default`, `does not satisfy the field schema (${coerced.error})`))
    }
  }
}

function checkPattern(
  field: Record<string, unknown>,
  path: string,
  issues: ManifestIssue[],
): void {
  const pattern = field.pattern
  if (pattern === undefined) return
  if (typeof pattern !== 'string') {
    issues.push(warn(`${path}.pattern`, 'should be a string regex'))
    return
  }
  try {
    new RegExp(pattern)
  } catch (err) {
    issues.push(error(`${path}.pattern`, `invalid regular expression: ${(err as Error).message}`))
  }
}

function checkNestedItems(
  field: Record<string, unknown>,
  path: string,
  issues: ManifestIssue[],
  depth: number,
  itemsAreFields: boolean,
): void {
  const items = field.items
  if (items === undefined) return
  if (!itemsAreFields) return
  if (!isRecord(items)) {
    issues.push(error(`${path}.items`, '`items` must be an object of per-item fields'))
    return
  }
  validateFieldMap(items, `${path}.items`, issues, depth + 1)
}

/** Lightweight shape checks for the remaining optional top-level structures (warning-only). */
function checkTopLevelShape(
  manifest: Record<string, unknown>,
  issues: ManifestIssue[],
): void {
  const services = manifest.services
  if (services !== undefined) {
    if (!Array.isArray(services)) {
      issues.push(warn('services', 'should be an array'))
    } else {
      for (const [i, s] of services.entries()) {
        if (typeof s === 'string') continue
        if (!isRecord(s) || typeof s.type !== 'string') {
          issues.push(warn(`services[${i}]`, 'each service should be a type string or { type } object'))
        }
      }
    }
  }

  if (manifest.depends_on !== undefined) {
    if (
      !Array.isArray(manifest.depends_on) ||
      manifest.depends_on.some((d) => typeof d !== 'string')
    ) {
      issues.push(warn('depends_on', 'should be an array of plugin ids'))
    }
  }

  const slots = manifest.slots
  if (slots !== undefined) {
    if (!Array.isArray(slots)) {
      issues.push(warn('slots', 'should be an array'))
    } else {
      for (const [i, slot] of slots.entries()) {
        if (!isRecord(slot) || typeof slot.location !== 'string' || typeof slot.label !== 'string') {
          issues.push(warn(`slots[${i}]`, 'each slot should declare a `location` and `label`'))
        }
      }
    }
  }

  const db = manifest.db
  if (db !== undefined) {
    if (!isRecord(db)) {
      issues.push(warn('db', 'should be an object'))
    } else if (db.tables !== undefined) {
      if (!isRecord(db.tables)) {
        issues.push(warn('db.tables', 'should be an object keyed by table name'))
      } else {
        for (const [table, def] of Object.entries(db.tables)) {
          if (!isRecord(def)) continue
          if (def.columns !== undefined) {
            if (!isRecord(def.columns)) {
              issues.push(warn(`db.tables.${table}.columns`, 'should map column name -> SQLite type'))
            } else {
              for (const [col, sqlType] of Object.entries(def.columns)) {
                if (typeof sqlType !== 'string' || !sqlType) {
                  issues.push(warn(`db.tables.${table}.columns.${col}`, 'column type should be a non-empty string'))
                }
              }
            }
          }
          if (def.indexes !== undefined && (!Array.isArray(def.indexes) || def.indexes.some((i) => typeof i !== 'string'))) {
            issues.push(warn(`db.tables.${table}.indexes`, 'should be an array of index expressions'))
          }
        }
      }
    }
  }

  const tabs = (manifest.settings as Record<string, unknown> | undefined)?.tabs
  if (tabs !== undefined) {
    if (!Array.isArray(tabs)) {
      issues.push(warn('settings.tabs', 'should be an array'))
    } else {
      for (const [ti, tab] of tabs.entries()) {
        if (!isRecord(tab)) {
          issues.push(warn(`settings.tabs[${ti}]`, 'tab should be an object'))
          continue
        }
        for (const key of ['id', 'label', 'icon', 'path'] as const) {
          if (tab[key] !== undefined && typeof tab[key] !== 'string') {
            issues.push(warn(`settings.tabs[${ti}].${key}`, 'should be a string'))
          }
        }
        const sections = tab.sections
        if (sections !== undefined && Array.isArray(sections)) {
          for (const [si, section] of sections.entries()) {
            if (!isRecord(section)) {
              issues.push(warn(`settings.tabs[${ti}].sections[${si}]`, 'each section should be an object'))
            } else if (typeof section.label !== 'string') {
              issues.push(
                warn(`settings.tabs[${ti}].sections[${si}]`, 'each section should declare a `label`'),
              )
            }
          }
        }
      }
    }
  }
}
