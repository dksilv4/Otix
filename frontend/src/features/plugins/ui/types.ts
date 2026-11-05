export type AlertTone = 'info' | 'success' | 'warning' | 'error'

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'system'

export type PluginButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type Variant = PluginButtonVariant

export type PluginButtonSize = 'xs' | 'sm' | 'md' | 'lg'
export type Size = PluginButtonSize

export interface SelectOption {
  value: string
  label: string
}
