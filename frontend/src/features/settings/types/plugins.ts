// frontend/src/features/settings/types/plugins.ts

// Re-export types used by the renderer.
// These mirror desktop/plugins/types.ts to avoid cross-process import issues.
// Canonical source: desktop/plugins/types.ts

export type PluginPermission =
  | 'network:external' | 'storage:local' | 'events:subscribe'
  | 'ui:settings' | 'ui:media.actions' | 'ui:list.actions' | 'ui:nav.item'
  | 'ui:dashboard.widget' | 'notifications' | 'worker:compute' | 'api:proxy'

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error'

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  repository: string
  sourcePath?: string
  status: PluginStatus
  error?: string
  manifest: PluginManifest
  installedAt: string
  enabledAt?: string
}

export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  repository: string
  min_app_version: string
  icon?: string
  permissions: PluginPermission[]
  config?: Record<string, PluginConfigField>
  slots?: PluginSlot[]
  settings?: { tabs?: PluginSettingsTab[] }
  entry: { main: string; renderer?: string }
  services?: string[]
  depends_on?: string[]
}

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'secret' | 'enum' | 'uuid' | 'list'
  label: string
  description?: string
  default?: unknown
  values?: string[]
  items?: Record<string, PluginConfigField>
  required?: boolean
  advanced?: boolean
}

export interface PluginSlot { location: string; label: string }
export interface PluginSettingsSection { id: string; label: string; slot: string }
export interface PluginSettingsTab { id: string; label: string; icon: string; path: string; sections: PluginSettingsSection[] }

export interface SlotContribution { pluginId: string; label: string; data: SlotRenderResult }
export interface SlotRenderResult { widgets: SlotWidget[] }
export interface SlotWidget {
  type: string
  key?: string
  props: Record<string, unknown>
  children?: SlotWidget[]
  conditions?: { feature?: string; permission?: string }
}
