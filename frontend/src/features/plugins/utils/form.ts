import type { PluginConfigField } from '@/features/plugins/types/plugins'

export const isVisible = (
  field: PluginConfigField,
  values: Record<string, unknown>,
): boolean => {
  const cond = field.if
  if (!cond) return true
  const current = values[cond.field]
  if (cond.equals !== undefined) return current === cond.equals
  if (cond.not !== undefined) return current !== cond.not
  if (cond.truthy !== undefined) return cond.truthy ? Boolean(current) : !current
  return true
}
