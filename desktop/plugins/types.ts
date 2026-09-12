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
  | 'api:proxy'
  | 'worker:filesystem'   // filesystem read access via RPC bridge
  | 'ui:command'          // register commands in the Cmd+K command hub
  | `table:${string}`     // access to a specific database table (e.g. table:downloads)

// ── Manifest ──
export type PluginConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'secret'
  | 'enum'
  | 'select'
  | 'uuid'
  | 'list'
  | 'path-list'
  | 'object'
  | 'instances'
  | 'serverUrl'

/** Conditionally show a field based on another field's value. */
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
  /** `instances` item (`serverUrl`): the canonical URL parts (host/port/useSsl/baseUrl) this field maps to in the stored instance. */
  parts?: string[]
  /** `instances` item: options for this field are fetched from the probe response, keyed by this item name. */
  fetchable?: boolean
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
  /** Render the plugin's `manifest.config` as an auto-generated form instead of a slot. */
  config?: boolean
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
  settings?: {
    tabs?: PluginSettingsTab[]
  }
  entry: {
    main: string
  }
  services?: (string | PluginService)[]
  depends_on?: string[]
  /** Shared database schema — tables auto-created on plugin enable */
  db?: {
    tables: Record<string, {
      columns: Record<string, string>
      indexes?: string[]
    }>
  }
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
  connected?: boolean
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
export interface ReviewEventPayload {
  title?: string | null
  content?: string | null
  isSpoiler?: boolean
  isPrivate?: boolean
}

export interface OtixEvents {
  // ── Media interactions ──
  // Fires for every media interaction toggle (liked/watchlisted/watched/played/started/listened).
  // `otix:media:watched` is a convenience alias for { type: 'watched', active: true }.
  'otix:media:interaction': { type: string; mediaId: string; mediaType: string; active: boolean }
  'otix:media:watched': { mediaId: string; mediaType: string; episodeId?: string; seasonNumber?: number | 'all' }
  'otix:episode:watched': { mediaId: string; mediaType: string; episodeId?: string; active: boolean; seasonNumber?: number | 'all' }
  'otix:interaction:rated': { mediaId: string; mediaType: string; rating: number }

  // ── Reviews ──
  'otix:review:created': { mediaId: string; mediaType: string; review: ReviewEventPayload }
  'otix:review:updated': { mediaId: string; mediaType: string; review: ReviewEventPayload }
  'otix:review:deleted': { mediaId: string; mediaType: string }
  'otix:review:voted': { mediaItemId: string; userId: string; voteType: 'up' | 'down'; active: boolean }

  // ── Lists ──
  'otix:list:item_added': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:list:item_removed': { listId: string; item: { mediaItemId: string; mediaType?: string } }
  'otix:list:created': { list: { id: string; name: string; isPublic: boolean } }
  'otix:list:updated': { listId: string; list: { name?: string | null; isPublic?: boolean | null } }
  'otix:list:deleted': { listId: string }
  'otix:list:liked': { listId: string }
  'otix:list:unliked': { listId: string }

  // ── Social ──
  'otix:user:followed': { username: string }
  'otix:user:unfollowed': { username: string }
  'otix:user:login': { userId: string }
  'otix:user:logout': { userId: string }
  'otix:user:mood_checkin': { mood: string; feeling: string }

  // ── Proposals ──
  'otix:proposal:voted': { proposalId: string; voteType: 'up' | 'down'; active: boolean }

  'plugin:enabled': { pluginId: string }
  'plugin:disabled': { pluginId: string }
  'plugin:slot-suspended': { pluginId: string; location: string }
  'plugin:config-changed': { pluginId: string; key?: string; config: Record<string, unknown> }
  'plugin:status-changed': { pluginId: string; status: Record<string, unknown> }
  'plugin:slots-changed': { pluginId?: string }
  'scan:progress': { currentDir: string; progress: number; pluginId?: string }   // NEW

  // ── Game lifecycle (emitted by GameDetector, consumed by plugins) ──
  'game:started': { gameId: string; gameTitle: string; pid: number; launchedByOtix: boolean }
  'game:ended': { gameId: string; gameTitle: string; startTime: number; endTime: number; launchedByOtix: boolean }

  // ── FPS capture (emitted by fps-capture plugin) ──
  'fps:live': { currentFps: number; frameCount: number; captureDurationMs: number; gameId: string }
  'fps:stats': { gameId: string; fpsStats: { avgFps: number; onePercentLow: number; zeroPointOnePercentLow: number; maxFps: number; minFps: number; totalFrames: number; captureDurationMs: number } | null }
  'fps:permission-needed': { pid: number; gameId: string }
}

export type OtixEventName = keyof OtixEvents

// ── Worker bridge ──
export type MainToWorkerMessage =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'config-changed'; config: Record<string, unknown> }
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
  downloads: PluginDownloads
  notifications: PluginNotifications
  logger: PluginLogger
  api: ApiProxy
  filesystem: PluginFilesystem
  app: PluginApp
  host: PluginHost
  onDestroy: (cb: () => void) => void
  /** Publish activity items shown in the Otix activity manager panel. */
  activity: PluginActivity

  // ── Inter-plugin communication ──
  call: (targetId: string, method: string, args?: Record<string, any>) => Promise<any>
  handle: (method: string, handler: (args: any) => Promise<any>) => () => void
  discover: (serviceType: string) => Promise<ServiceInfo[]>
}

export interface PluginActivityItem {
  id: string
  type: 'scan' | 'download' | 'sync' | 'info' | 'warning' | 'error' | 'notification'
  title: string
  subtitle?: string
  progress?: number
  status?: 'active' | 'completed' | 'error' | 'pending'
  icon?: string
  timestamp?: number
  action?: { label: string; method: string }
}

export interface PluginActivity {
  /** Insert or replace an item with the same id. */
  publish(item: PluginActivityItem): void
  remove(id: string): void
  clear(): void
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

export interface PluginDownloads {
  getHistory(): Promise<Record<string, unknown>[]>
  getDownload(id: string): Promise<Record<string, unknown> | null>
  getConfig(): Promise<Record<string, unknown> | null>
  queueItem(data: {
    userId?: string
    mediaItemId?: string | null
    mediaItemTitle?: string | null
    nzbTitle: string
    nzbSize: number
    nzbUrl: string
    sabnzbdNzoId?: string | null
  }): Promise<Record<string, unknown>>
  updateStatus(id: string, status: string, errorMessage?: string, percentage?: number): Promise<void>
  updateIsoPath(id: string, isoPath: string): Promise<void>
  delete(id: string): Promise<void>
  getPathMappings(configId: string): Promise<Record<string, unknown>[]>
  getWishlistTracking(userId: string): Promise<Record<string, unknown>[]>
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
