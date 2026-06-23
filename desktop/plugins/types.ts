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
  | 'worker:filesystem'   // NEW — filesystem read access via RPC bridge

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

// ── Services ──
export interface PluginService {
  type: string        // 'downloader' | 'search-provider' | 'arr' | 'downloads-orchestrator'
  protocol?: string   // 'usenet' | 'torrent' | 'any'
}

export interface ServiceInfo {
  pluginId: string
  type: string
  protocol?: string
  methods: string[]
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
  services?: (string | PluginService)[]
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
  'scan:progress': { currentDir: string; progress: number; pluginId?: string }   // NEW
}

export type OtixEventName = keyof OtixEvents

// ── Worker bridge ──
export type MainToWorkerMessage =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'rpc-result'; id: string; result: unknown }
  | { type: 'rpc-error'; id: string; error: string }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'event'; event: string; payload: unknown }
  | { type: 'plugin-call'; id: string; method: string; args: any }

export type WorkerToMainMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'rpc-result'; id: string; result: unknown }
  | { type: 'rpc-error'; id: string; error: string }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; msg: string }
  | { type: 'slot-render'; id: string; location: string }
  | { type: 'handle-action'; id: string; actionKey: string; payload: unknown }
  | { type: 'plugin-call-result'; id: string; result: any }
  | { type: 'plugin-call-error'; id: string; error: string }

// ── Plugin Context (as seen inside worker) ──
export interface PluginContext {
  readonly id: string
  readonly manifest: PluginManifest
  config: PluginConfigStore
  events: EventSubscriber
  fetch: PluginFetch
  db: PluginDatabase
  downloadsDb: {
    all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
    get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null
  }
  notifications: PluginNotifications
  logger: PluginLogger
  api: ApiProxy
  filesystem: PluginFilesystem
  app: PluginApp
  host: PluginHost
  onDestroy: (cb: () => void) => void

  // ── Inter-plugin communication ──
  call: (targetId: string, method: string, args?: Record<string, any>) => Promise<any>
  handle: (method: string, handler: (args: any) => Promise<any>) => () => void
  discover: (serviceType: string) => Promise<ServiceInfo[]>
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

export interface FsEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymbolicLink: boolean
}

export interface FsStat {
  size: number
  mtimeMs: number
  isDirectory: boolean
  isFile: boolean
}

export interface PluginFilesystem {
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<FsEntry[]>
  readFile(path: string, encoding?: string): Promise<string>
  stat(path: string): Promise<FsStat>
  access(path: string): Promise<boolean>
}

export interface PluginApp {
  getFileIcon(path: string, size?: 'small' | 'large'): Promise<string | null>
}

export interface PluginHost {
  emit(event: string, data: unknown): void
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
