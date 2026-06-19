// ── Plugin type definitions ──

/** All permissions a plugin can request. */
export type PluginPermission =
  | 'network:external'    // Call external APIs
  | 'storage:local'       // Own SQLite tables
  | 'events:subscribe'    // Listen to Otix event bus
  | 'ui:settings'         // Register a settings page
  | 'ui:media.actions'    // Inject into media detail actions
  | 'ui:list.actions'     // Inject into list header
  | 'ui:nav.item'         // Add navigation item
  | 'ui:dashboard.widget' // Add dashboard widget
  | 'notifications'       // Send desktop notifications
  | 'worker:compute'     // Contribute compute as a worker
  | 'api:proxy'           // Call Otix API through authenticated proxy

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'secret' | 'enum' | 'uuid' | 'list';
  label: string;
  description?: string;
  default?: unknown;
  values?: string[];       // for enum
  items?: Record<string, PluginConfigField>;  // Sub-fields for list items
  required?: boolean;
  advanced?: boolean;      // Hidden until connection test succeeds
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  min_app_version: string;
  icon?: string;
  permissions: PluginPermission[];
  config?: Record<string, PluginConfigField>;
  entry: {
    main: string;          // relative path, runs in main process
    renderer?: string;     // relative path, runs in renderer (pre-built bundle)
  };
  services?: string[];     // service names this plugin provides (e.g. ['radarr', 'sonarr'])
}

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  sourcePath?: string;  // Subdirectory path within repo (for monorepo plugins)
  status: PluginStatus;
  error?: string;
  manifest: PluginManifest;
  installedAt: string;
  enabledAt?: string;
}

export type PermissionDuration = 'once' | 'always';

export interface PermissionGrant {
  pluginId: string;
  permission: PluginPermission;
  grantedAt: string;
  duration: PermissionDuration;
}

export interface PermissionRequest {
  requestId: string;
  pluginId: string;
  pluginName: string;
  permission: PluginPermission;
  reason: string;
}

export type PermissionResponse =
  | { granted: true; duration: PermissionDuration }
  | { granted: false };

export interface SlotRegistration {
  pluginId: string;
  slotName: string;
  componentId: string;
  props?: Record<string, unknown>;
}

/** Events that can be emitted on the Otix event bus. */
export interface OtixEvents {
  'otix:list:item_added':    { listId: string; item: { mediaItemId: string; mediaType?: string } };
  'otix:list:item_removed':  { listId: string; item: { mediaItemId: string; mediaType?: string } };
  'otix:media:watched':      { mediaId: string; mediaType: string; episodeId?: string; seasonNumber?: number | 'all' };
  'otix:interaction:rated':  { mediaId: string; mediaType: string; rating: number };
  'otix:user:login':         { userId: string };
  'otix:user:logout':        { userId: string };
}

export type OtixEventName = keyof OtixEvents;

/** The sandboxed context provided to each plugin. */
export interface PluginContext {
  readonly id: string;
  readonly manifest: PluginManifest;

  /** Plugin configuration store. */
  config: PluginConfigStore;

  /** Subscribe to Otix events. Triggers permission request if not granted. */
  events: EventSubscriber;

  /** External network access. Triggers permission request if not granted. */
  fetch: PluginFetch;

  /** Local SQLite storage (namespaced per plugin). */
  db: PluginDatabase;

  /** Desktop notifications. */
  notifications: PluginNotifications;

  /** Structured logger. */
  logger: PluginLogger;

  /** Otix API proxy (authenticated). */
  api: ApiProxy;

  /** Lifecycle callback. */
  onDestroy: (cb: () => void) => void;
}

export interface PluginConfigStore {
  getAll(): Record<string, unknown>;
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

export interface EventSubscriber {
  on<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): () => void;
  off<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): void;
}

export type PluginFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface PluginDatabase {
  run(sql: string, params?: unknown[]): void;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
}

export interface PluginNotifications {
  send(title: string, body: string): void;
}

export interface PluginLogger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export interface ApiProxy {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, data?: unknown): Promise<T>;
  put<T = unknown>(path: string, data?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

/** A Plugin is a function that receives its context and optionally returns a cleanup function. */
export type PluginEntry = (ctx: PluginContext) => void | (() => void);
