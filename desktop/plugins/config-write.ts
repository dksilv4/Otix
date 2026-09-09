// desktop/plugins/config-write.ts
//
// Policy for a plugin's runtime `config.set` call. Config is a user-facing,
// schema-declared store: the manifest `config` schema is what drives the
// settings UI, value validation and reload. A plugin writing an undeclared
// key would silently bypass that schema (and never surface in the UI), so:
//
//   - declared key + valid value   -> store the coerced value
//   - declared key + invalid value -> store the raw value anyway (never lose
//     a plugin's value mid-flight; the strict UI path still rejects it)
//   - undeclared key               -> ignore, don't persist

import { validateConfigValue } from './config-validation'
import type { PluginConfigField } from './types'

export type ConfigWriteOutcome =
  | { action: 'set'; value: unknown }
  | { action: 'set-raw'; reason: string; value: unknown }
  | { action: 'ignore'; reason: string }

export function resolveConfigWrite(
  schema: Record<string, PluginConfigField> | undefined,
  key: string,
  value: unknown,
): ConfigWriteOutcome {
  const field = schema?.[key]
  if (!field) {
    return {
      action: 'ignore',
      reason: `config key "${key}" is not declared in the manifest`,
    }
  }
  const result = validateConfigValue(field, value)
  if (result.ok) return { action: 'set', value: result.value }
  return {
    action: 'set-raw',
    reason: `config key "${key}" failed validation (${result.error ?? 'invalid'})`,
    value,
  }
}
