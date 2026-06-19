// desktop/plugins/types.ts

// ── Permissions ──
export type PluginPermission =
  | 'network:external'
  | 'storage:local'
  | 'events:subscribe'
  | 'ui:settings'
  | 'ui:media.actions'
  | 'ui:list.actions'
  | 'ui:nav.item'
  | 'ui:dashboard.widget'
  | 'notifications'
  | 'worker:compute'
  | 'api:proxy'

// ── Manifest ──
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

export interface PluginSlot {
  location: string
  label: string
}

export interface PluginSettingsSection {
  id: string
  label: string
  slot: string
}

export interface PluginSettingsTab {
  id: string
  label: string
  icon: string
  path: string
  sections: PluginSettingsSection[]
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
  settings?: {
    tabs?: PluginSettingsTab[]
  }
  entry: {
    main: string
    renderer?: string
  }
  services?: string[]
}

// ── Runtime ──
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

// ── Permissions ──
export type PermissionDuration = 'once' | 'always'

export interface PermissionGrant {
  pluginId: string
  permission: PluginPermission
  grantedAt: string
  duration: PermissionDuration
}

export interface PermissionRequest {
  requestId: string
  pluginId: string
  pluginName: string
  permission: PluginPermission
  reason: string
}

export type PermissionResponse =
  | { granted: true; duration: PermissionDuration }
  | { granted: false }

// ── Slots ──
export interface SlotRegistration {
  pluginId: string
  location: string
  label: string
}

export interface SlotContribution {
  pluginId: string
  label: string
  data: SlotRenderResult
}

export interface SlotRenderResult {
  widgets: SlotWidget[]
}

export interface SlotWidget {
  type: string
  key?: string
  props: Record<string, unknown>
  children?: SlotWidget[]
  conditions?: {
    feature?: string
    permission?: string
  }
}

// ── Events ──
export interface OtixEvents {
  'otix:list:item_added': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:list:item_removed': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:media:watched': { mediaId: string; mediaType: string; episodeId?: string; seasonNumber?: number | 'all' }
  'otix:interaction:rated': { mediaId: string; mediaType: string; rating: number }
  'otix:user:login': { userId: string }
  'otix:user:logout': { userId: string }
  'plugin:enabled': { pluginId: string }
  'plugin:disabled': { pluginId: string }
  'plugin:slot-suspended': { pluginId: string; location: string }
}

export type OtixEventName = keyof OtixEvents

// ── Worker bridge ──
export type MainToWorkerMessage =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'rpc-result'; id: string; result: unknown }
  | { type: 'rpc-error'; id: string; error: string }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'event'; event: string; payload: unknown }

export type WorkerToMainMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'rpc-result'; id: string; result: unknown }
  | { type: 'rpc-error'; id: string; error: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; msg: string }
  | { type: 'slot-render'; id: string; location: string }
  | { type: 'handle-action'; id: string; actionKey: string; payload: unknown }

// ── Plugin Context (as seen inside worker) ──
export interface PluginContext {
  readonly id: string
  readonly manifest: PluginManifest
  config: PluginConfigStore
  events: EventSubscriber
  fetch: PluginFetch
  db: PluginDatabase
  notifications: PluginNotifications
  logger: PluginLogger
  api: ApiProxy
  onDestroy: (cb: () => void) => void
}

export interface PluginConfigStore {
  getAll(): Record<string, unknown>
  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown): void
}

export interface EventSubscriber {
  on<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): () => void
  off<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): void
}

export type PluginFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface PluginDatabase {
  run(sql: string, params?: unknown[]): void
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
}

export interface PluginNotifications {
  send(title: string, body: string): void
}

export interface PluginLogger {
  info(msg: string, data?: unknown): void
  warn(msg: string, data?: unknown): void
  error(msg: string, data?: unknown): void
}

export interface ApiProxy {
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, data?: unknown): Promise<T>
  put<T = unknown>(path: string, data?: unknown): Promise<T>
  delete<T = unknown>(path: string): Promise<T>
}

export type PluginEntry = (ctx: PluginContext) => void | (() => void)
