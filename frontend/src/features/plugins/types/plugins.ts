// frontend/src/features/settings/types/plugins.ts

// Re-export types used by the renderer.
// These mirror desktop/plugins/types.ts to avoid cross-process import issues.
// Canonical source: desktop/plugins/types.ts

export type PluginPermission =
  | 'network:external' | 'storage:local' | 'events:subscribe'
  | 'ui:settings' | 'ui:media.actions' | 'ui:list.actions' | 'ui:nav.item'
  | 'ui:dashboard.widget' | 'notifications' | 'api:proxy' | 'ui:command'

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
  connected?: boolean
}

export interface PluginService {
  type: string
  protocol?: string
}

export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  repository: string
  min_app_version: string
  /** Max ms to wait for a plugin RPC (startup + data calls) before timing out. Defaults to 30s startup / 60s calls. */
  timeout?: number
  icon?: string
  stage?: 'alpha' | 'beta' | 'stable'
  /** Packaged system plugin — always enabled, cannot be disabled by the user. */
  system?: boolean
  permissions: PluginPermission[]
  config?: Record<string, PluginConfigField>
  slots?: PluginSlot[]
  settings?: { tabs?: PluginSettingsTab[] }
  entry: { main: string }
  services?: (string | PluginService)[]
  depends_on?: string[]
}

export type PluginConfigFieldType =
  | 'string' | 'number' | 'boolean' | 'secret' | 'enum' | 'select'
  | 'uuid' | 'list' | 'path-list' | 'object' | 'instances' | 'serverUrl'

export interface PluginConfigVisibility {
  field: string
  equals?: unknown
  not?: unknown
  truthy?: boolean
}

export interface PluginConfigField {
  type: PluginConfigFieldType
  label: string
  description?: string
  default?: unknown
  /** Options for `enum` (plain strings) and `select` ({value,label} entries). */
  values?: string[] | Array<{ value: string; label: string }>
  /** `list` item schema (object shape per item); `object` sub-fields. */
  items?: Record<string, PluginConfigField>
  required?: boolean
  advanced?: boolean
  /** Named group this field renders under (e.g. "General", "Connection"). */
  section?: string
  /** Stable sort order within its section. */
  order?: number
  placeholder?: string
  min?: number
  max?: number
  step?: number
  pattern?: string
  /** Mask the value in the UI even when type is not `secret`. */
  sensitive?: boolean
  /** Conditionally show this field based on another field's value. */
  if?: PluginConfigVisibility

  // ── `instances` fields ──
  /** `instances`: which item keys form the connect step, and the data method that probes the server. */
  connection?: { method?: string; fields?: string[] }
  /** `instances` item (`serverUrl`): URL parts this field maps to in the stored instance (host/port/useSsl/baseUrl). */
  parts?: string[]
  /** `instances` item: options for this field are fetched from the probe response, keyed by this item name. */
  fetchable?: boolean
}

export interface PluginSlot { location: string; label: string }
export interface PluginSettingsSection {
  id: string
  label: string
  slot: string
  /** Render the plugin's `manifest.config` as an auto-generated form instead of a slot. */
  config?: boolean
  /** Render a sync-test card that drives the plugin's `sync.now` / `sync.status` data methods. */
  sync?: boolean
  /** Render a browsable list of the plugin's local catalog via its `movies.list` data method. */
  movies?: boolean
  /** Render a list of requested media via the plugin's `requests.list` data method. */
  requests?: boolean
  /** Render per-run sync history via the plugin's `sync.history` data method. */
  syncHistory?: boolean
}
export interface PluginSettingsTab {
  id: string
  label: string
  icon: string
  path: string
  sections: PluginSettingsSection[]
  /** Owning plugin id — populated by the manager when tabs are surfaced to the renderer. */
  pluginId?: string
}

export interface SlotContribution { pluginId: string; label: string; data: SlotRenderResult }
export interface SlotRenderResult { widgets: SlotWidget[] }
export interface SlotWidget {
  type: string
  key?: string
  props: Record<string, unknown>
  children?: SlotWidget[]
  conditions?: { feature?: string; permission?: string }
}
