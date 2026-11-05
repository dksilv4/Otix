export interface DkDropdownOption {
  value: string
  label: string
}

export type FeatureStatusKind = 'beta' | 'wip' | 'alpha'

export interface TabsContextValue {
  value: string
  onChange: (value: string) => void
}
