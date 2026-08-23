// frontend/src/features/_config/slots/types.ts
//
// Slot + settings-tab types live in the canonical plugin types module
// (`@/features/plugins/types/plugins`); this file re-exports them for the
// slot renderer feature and keeps its renderer-only error type.

export type {
  SlotWidget,
  SlotRenderResult,
  SlotContribution,
  PluginSettingsTab,
  PluginSettingsSection,
} from '@/features/plugins/types/plugins'

export interface SlotError {
  pluginId: string
  label: string
  location: string
  error: string
  suspended: boolean
}
