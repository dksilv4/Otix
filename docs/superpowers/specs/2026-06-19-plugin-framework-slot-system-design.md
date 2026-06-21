# Plugin Framework & Slot System — Design Spec

**Date**: 2026-06-19
**Status**: Approved
**Branch**: `refactor/auth-feature-flag-migration`

## Overview

Complete rewrite of the plugin framework (currently a viability prototype) into a production-grade system with a data-driven UI slot architecture. Plugins declare their capabilities in a manifest, run sandboxed in worker threads, and contribute UI via a widget catalog that guarantees UX consistency. The Epic Games plugin — currently hardcoded across multiple files — becomes the first consumer of the new slot system.

**Design goals:**
- 50-year maintainability: stable contracts, additive-only schemas, permanent slot names, 10-year deprecation windows
- Crash isolation: no plugin can crash the app or another plugin's UI contributions
- UX consistency: plugins compose UI from a curated widget catalog, never raw React
- No raw SQL outside migration files: centralized migration service, typed repositories

---

## 1. Architecture

### Layer Model

```
┌──────────────────────────────────────────────────────┐
│                  RENDERER (React)                      │
│                                                        │
│  Settings UI  ◄── SlotRenderer ──► WidgetCatalog       │
│       │              │                    │            │
│       │        useSlotData()       DK UI Widgets       │
│       │              │                    │            │
│  PluginSettingsUI ──► PluginAPI (IPC bridge)           │
├──────────────────────────────────────────────────────┤
│                   IPC LAYER                            │
│                                                        │
│  plugin:* handlers  ← validated, typed, sender-gated   │
├──────────────────────────────────────────────────────┤
│              MAIN PROCESS (Node.js)                    │
│                                                        │
│  PluginManager ──► PluginRuntime (per-plugin)          │
│       │                │                               │
│       │           ┌────┴────┐                          │
│       │           │ Worker  │  ← sandboxed via         │
│       │           │ Thread  │    worker_threads        │
│       │           └─────────┘                          │
│       │                                                │
│  SlotRegistry ──► PageSlotMap                          │
│  EventBus (isolated, per-listener error boundaries)    │
│  PermissionManager (real gating in worker bridge)      │
│  MigrationService (all DB schema under management)     │
│  PluginDB (via typed repositories, no raw SQL)         │
└──────────────────────────────────────────────────────┘
```

### New file layout

```
desktop/
  db/
    index.ts                  ← initAllDatabases(), getDb(name)
    connection.ts              ← connection manager, WAL mode
    migration-service.ts       ← sequential migration runner
    migrations/
      downloads/
        001_initial.ts
        002_save_tables.ts
        003_active_installs.ts
        004_scanned_games.ts
        005_game_rejected.ts
        ...                    ← one per migration, timestamp-sequenced
      plugins/
        001_initial.ts
    repositories/
      downloads.ts             ← typed queries, zero raw SQL
      plugins.ts               ← typed queries, zero raw SQL
      games.ts                 ← typed queries, zero raw SQL
  plugins/
    types.ts                   ← rewritten, error classes, stable contracts
    manager.ts                 ← rewritten, state machine, locks
    runtime.ts                 ← NEW: PluginRuntime owns worker, DB, subscriptions
    worker.ts                  ← NEW: worker_threads entry point
    worker-bridge.ts           ← NEW: MessagePort protocol, permission gating
    permissions.ts             ← rewritten, real gating in bridge
    event-bus.ts               ← rewritten, isolated listeners
    slots.ts                   ← NEW: SlotRegistry, PageSlotMap, failure tracking
    api-proxy.ts               ← rewritten with URL validation
    marketplace.ts             ← kept, minor hardening
    index.ts                   ← updated barrel

frontend/src/features/_config/slots/
  SlotRenderer.tsx             ← renders slot data via WidgetCatalog
  WidgetCatalog.ts             ← maps widget types → DK UI components + Zod schemas
  useSlotData.ts               ← React Query hook, single IPC per page
  usePluginTabs.ts             ← dynamic settings tabs from slot registry
  ErrorBoundary.tsx            ← per-plugin, per-widget isolation
  ErrorCard.tsx                ← collapsed error display
  types.ts                     ← SlotRenderResult, SlotWidget, widget prop types

frontend/src/features/settings/
  components/
    PluginSettings.tsx          ← rewritten, no hardcoded plugin IDs
    PluginSettingsPage.tsx      ← NEW: generic page for plugin-defined tabs
  settings.router.ts            ← updated: createPluginRoutes() for dynamic routes
  constants.ts                  ← updated: dynamic nav items from plugins

frontend/src/features/_config/
  types.ts                      ← updated: add slot-related feature flags
  registry.ts                   ← updated: register slot-system feature flag
```

---

## 2. Sandbox Model — worker_threads

Every enabled plugin gets its own `Worker`. Plugin code never touches the main process. All external access goes through `postMessage` → main process validates permissions → executes → returns result.

```
PluginManager.enable()
  → creates PluginRuntime
    → spawns Worker(plugin-worker.js)
    → sets up MessagePort protocol
    → worker loads plugin entry module
    → plugin calls ctx.events.on(...)  → postMessage → main validates → registers
    → plugin calls ctx.fetch(url)      → postMessage → main validates → executes
    → plugin calls ctx.api.get(...)    → postMessage → main validates → proxies
```

**Worker bridge protocol:**

```typescript
// Main → Worker
type MainMessage =
  | { type: 'init'; config: Record<string, unknown> }
  | { type: 'rpc-result'; id: string; result: unknown }
  | { type: 'rpc-error'; id: string; error: string }

// Worker → Main
type WorkerMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'log'; level: 'info'|'warn'|'error'; msg: string }
```

**Permission gating happens in the bridge, not in the plugin code:**

```typescript
// worker-bridge.ts
const GATED_METHODS: Record<string, PluginPermission> = {
  'events.on': 'events:subscribe',
  'events.off': 'events:subscribe',
  'fetch': 'network:external',
  'api.get': 'api:proxy',
  'api.post': 'api:proxy',
  'api.put': 'api:proxy',
  'api.delete': 'api:proxy',
  'db.run': 'storage:local',
  'db.get': 'storage:local',
  'db.all': 'storage:local',
  'notifications.send': 'notifications',
}

function handleRpc(pluginId: string, method: string): void {
  const required = GATED_METHODS[method]
  if (required && !permissionManager.hasPermission(pluginId, required)) {
    permissionManager.requestPermission(pluginId, required)
    // wait for user response before executing
  }
  // execute...
}
```

---

## 3. Plugin Lifecycle — State Machine

```
                    install
  (none) ──────────────────► installed
                                │
                          enable │  ◄── spawn Worker, register slots
                                ▼
                            enabled ◄──────────────┐
                                │                   │
                     disable │  │ enable (retry)    │
                     (error) │  │                   │
                                ▼                   │
                            disabled ──── uninstall ──► (removed)
                                │
                          update │
                                ▼
                            installed (new version, re-enable if was enabled)
```

**State transitions with per-plugin mutex:**

```typescript
class PluginManager {
  private locks: Map<string, Promise<void>> = new Map()

  async enable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      // state machine transition
      const runtime = await this.createRuntime(pluginId)
      await runtime.start()
      this.runtimes.set(pluginId, runtime)
      await dbSetPluginStatus(pluginId, 'enabled')
      this.registerSlots(pluginId, runtime.manifest.slots)
      this.eventBus.emit('plugin:enabled', { pluginId })
    } finally {
      this.releaseLock(pluginId)
    }
  }

  async disable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      const runtime = this.runtimes.get(pluginId)
      if (!runtime) throw new PluginNotRunningError(pluginId)
      await runtime.stop()  // terminate worker, close DB, unsubscribe events
      this.runtimes.delete(pluginId)
      this.unregisterSlots(pluginId)
      await dbSetPluginStatus(pluginId, 'disabled')
      this.eventBus.emit('plugin:disabled', { pluginId })
    } finally {
      this.releaseLock(pluginId)
    }
  }
}
```

**PluginRuntime owns all resources and cleans them up:**

```typescript
class PluginRuntime {
  private worker: Worker
  private db: Database
  private subscriptions: (() => void)[] = []

  async start(): Promise<void> { /* create worker, open DB, init */ }
  async stop(): Promise<void> {
    this.subscriptions.forEach(unsub => unsub())
    this.subscriptions = []
    this.db.close()              // ← SQLite handle properly closed
    await this.worker.terminate() // ← Worker killed
  }
}
```

**Entry function timeout:** Plugin entry has 30s to complete initialization. After timeout, plugin is marked `error` and worker terminated. Timeout is configurable in manifest.

---

## 4. Slot System — Data-Driven UI

### Slot naming

Hierarchical, `/`-separated. Permanent names. Deprecated slots supported for 10 years.

```
settings/plugins/<pluginId>/config        Per-plugin config panel extension
settings/library/extensions               Library settings page extensions
settings/matching/extensions              Matching page extensions
media/<mediaType>/detail/actions          Media detail action bar
launcher/game/<gameId>/actions            Game launcher actions
```

Rendering a parent slot renders all child slots unless exact match requested.

### Slot registration

Plugins declare slots in `manifest.json`:

```json
{
  "slots": [
    { "location": "settings/library/extensions", "label": "Epic Game Scanner" }
  ],
  "settings": {
    "tabs": [
      {
        "id": "epic-games",
        "label": "Epic Games",
        "icon": "gamepad-2",
        "path": "/settings/epic-games",
        "sections": [
          { "id": "auth", "label": "Authentication", "slot": "settings/epic-games/auth" },
          { "id": "library", "label": "Library", "slot": "settings/epic-games/library" }
        ]
      }
    ]
  }
}
```

On enable, `SlotRegistry` records `(location, pluginId, label)`. On disable, removed.

### Data protocol

Plugins implement `data.slotRender(location: string): SlotRenderResult`:

```typescript
interface SlotRenderResult {
  widgets: SlotWidget[]
}

interface SlotWidget {
  type: string                        // widget type from catalog
  key?: string                        // unique key for React reconciliation
  props: Record<string, unknown>      // widget-specific props, Zod-validated
  children?: SlotWidget[]             // nested widgets
  conditions?: {
    feature?: string                  // feature flag name
    permission?: string               // required permission
  }
}
```

### Data flow

Single IPC round-trip per page:

1. Page mounts → `useSlotData(pageId)` fires
2. Hook calls `window.desktopAPI.plugin.getPageSlotData(pageId)` — single IPC call
3. Main process `PluginManager.getPageSlotData(pageId)`:
   - Looks up `PAGE_SLOT_MAP[pageId]` → gets list of slot locations for that page
   - For each location, iterates registered plugins, calls `slot.render` on each
   - Collects results into `Record<location, SlotContribution[]>`
   - Tracks failures per plugin (consecutive failure counter)
4. Returns to renderer, cached in React Query (30s stale time)
5. `SlotRenderer` maps each contribution through `WidgetCatalog` → React elements

### PAGE_SLOT_MAP

```typescript
const PAGE_SLOT_MAP: Record<string, string[]> = {
  'settings/library': ['settings/library/extensions'],
  'settings/matching': ['settings/matching/extensions'],
  'settings/plugins': ['settings/plugins/extensions'],
  'media/detail': ['media/movie/detail/actions', 'media/show/detail/actions', 'media/game/detail/actions'],
}
```

Plugin-defined tabs are discovered via `settings/tabs` slot and merged at query time.

---

## 5. Widget Catalog v1

All existing DK UI components converted to widgets. Plugins return `SlotWidget[]`, SlotRenderer maps to React components through Zod-validated props.

### Atoms (leaf components)

| Widget `type` | Source | Props |
|---|---|---|
| `avatar` | `atoms/avatar.tsx` | src, size, fallback |
| `button` | new widget | label, variant, size, icon, action, disabled, loading |
| `checkbox` | `atoms/checkbox.tsx` | label, checked, onChange action |
| `dropdown` | `atoms/dropdown.tsx` | label, items[], trigger |
| `image` | `atoms/image.tsx` | src, alt, fit, radius |
| `input` | `atoms/input.tsx` | label, placeholder, value, type, error, action |
| `select` | `atoms/select.tsx` | label, options[], value, action |
| `separator` | `atoms/separator.tsx` | label (optional), orientation |
| `skeleton` | `atoms/skeleton.tsx` | width, height, variant |
| `spinner` | `atoms/spinner.tsx` | size |
| `star-rating` | `atoms/star-rating.tsx` | value, max, readonly, action |
| `switch` | `atoms/switch.tsx` | label, checked, action |
| `textarea` | `atoms/textarea.tsx` | label, placeholder, value, rows, action |
| `badge` | new | label, variant (info/success/warn/error), dot |
| `progress` | new | value, max, label, variant |

### Molecules (composite components)

| Widget `type` | Source | Props |
|---|---|---|
| `card` | `molecules/card.tsx` | title, subtitle, children[], padding, shadow |
| `tabs` | `molecules/tabs.tsx` | tabs[{label, id}], activeTab, action |
| `search-field` | `molecules/search-field.tsx` | placeholder, value, action |
| `deferred-section` | `molecules/deferred-section.tsx` | title, children[], collapsed (default) |
| `toast` | `molecules/toast.tsx` | (system-managed) |

### Layout widgets

| Widget `type` | Purpose | Props |
|---|---|---|
| `action-group` | Button row | actions[{label, variant, action, icon}], align |
| `list` | Structured list | items[{key, title, subtitle, badge, actions[]}], emptyText |
| `table` | Data table | columns[{key, label, width}], rows[{key, cells}], sortable |
| `form` | Form container | fields[], submitLabel, action, cancelAction |
| `grid` | Card/resource grid | items[{key, image, title, subtitle, actions[]}], columns |
| `alert` | Info/warning/error | title, message, variant, dismissible, action |
| `stat` | Stat display | label, value, trend, icon |
| `empty-state` | Empty placeholder | icon, title, message, action |

### Widget props are Zod-validated

```typescript
// WidgetCatalog.ts
const schemas: Record<string, ZodSchema> = {
  button: z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).default('secondary'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    icon: z.string().optional(),
    action: z.string(),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  // ... all 25+ widgets
}
```

### Widget actions → callbacks

Widgets declare `action` strings. `SlotRenderer` passes an `onAction(actionKey, payload)` callback through context. Plugin's main-process code handles action dispatch:

```typescript
// Plugin implements:
data.handleAction(actionKey: string, payload: unknown): Promise<void>
```

This keeps plugin logic in the sandboxed worker while UI stays in the renderer.

**Action latency model:**
- Actions are for **discrete user intents**: submit, click, select, toggle. Not for continuous updates (keystrokes, slider drags).
- Each action round-trips: renderer → IPC → main → worker → main → IPC → renderer. Expected latency <50ms on local machine.
- For high-frequency interactions (search-as-you-type, drag), the widget handles UI state locally and fires a single debounced action on completion.
- Action handlers return `Promise<void>`. On error, the widget displays inline error state. On success, the widget may trigger a re-render of its parent slot (configurable per action).

---

## 6. Dynamic Settings Tabs

Plugins declare settings tabs in manifest. Settings router auto-discovers and creates routes.

### Manifest declaration

```json
{
  "settings": {
    "tabs": [
      {
        "id": "epic-games",
        "label": "Epic Games",
        "icon": "gamepad-2",
        "path": "/settings/epic-games",
        "sections": [
          { "id": "auth", "label": "Authentication", "slot": "settings/epic-games/auth" },
          { "id": "library", "label": "Library", "slot": "settings/epic-games/library" }
        ]
      }
    ]
  }
}
```

### Route registration

Routes are computed at router creation time (not dynamically added post-mount). The router queries enabled plugin tabs via IPC during initialization, then builds the full route tree. If plugins are enabled/disabled at runtime, the router re-computes on the next navigation.

```typescript
// settings.router.ts
async function createSettingsRoutes(rootRoute: AnyRoute) {
  // Query enabled plugin tabs (fast, from main process cache)
  const pluginTabs = await window.desktopAPI?.plugin.getPluginTabs() || []

  const settingsRoute = createRoute({ ... })
  const staticRoutes = [ ... ]
  const pluginRoutes = pluginTabs.map(tab =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path: tab.path.replace('/settings/', ''),
      component: () => <PluginSettingsPage tab={tab} />,
    })
  )

  return [settingsRoute, ...staticRoutes, ...pluginRoutes]
}
```

### Nav integration

`NAV_ITEMS` in `constants.ts` becomes dynamic. Static items + plugin-contributed items merged at render time. Plugin items sorted below static items with a divider.

```
Sidebar Nav:
├── Profile          (static)
├── Security         (static)
├── ...
├── Library          (static)
├── Matching         (static)
├── ─────────────
├── Epic Games       (plugin)
├── Radarr           (plugin)
├── ─────────────
├── Plugins          (static)
```

### PluginSettingsPage

Generic page component that reads the tab's sections from slot metadata, renders section header + `SlotRenderer` for each section. Supports tab/sub-navigation when plugin has multiple sections.

---

## 7. Error Handling & Failure Isolation

### Three-layer ErrorBoundary

```
SlotRenderer                ← ErrorBoundary (slot-level — last resort)
├── Plugin A contribution   ← ErrorBoundary (plugin-level)
│   ├── Widget: card        ← ErrorBoundary (widget-level)
│   │   └── children...
│   └── Widget: button      ← ErrorBoundary (widget-level)
├── Plugin B contribution   ← ErrorBoundary (plugin-level)
│   └── Widget: table       ← ErrorBoundary (widget-level)
└── Plugin C (crashed)      ← ErrorBoundary → <ErrorCard /> silently
```

No throw propagates upward. Every boundary catches and renders fallback. Parent components never know a plugin failed. `SlotRenderer` itself never throws synchronously.

### Error states

| Failure | Render output |
|---|---|
| `slot.render()` throws | `<ErrorCard>` with plugin name, "failed to load" message, expand/collapse |
| `slot.render()` times out (5s) | Same error card with timeout message |
| Widget props fail Zod validation | `<ErrorCard>` with "invalid data from plugin" + field path |
| Plugin disabled mid-render | Contribution removed cleanly, no flash |
| 3 consecutive failures for same slot | Plugin auto-suspended from that slot. Notification sent. `<Alert>` with re-enable link. Counter resets on any successful render |

### Dev mode signals

In dev mode, error card shows: exception message, stack trace, invalid prop paths, schema diff. Production mode shows collapsed generic error.

---

## 8. Migration Service

All database schema management centralized in `desktop/db/migration-service.ts`. No raw SQL allowed outside migration files.

### Architecture

```
desktop/db/
  index.ts                  ← initAllDatabases(), getDb(name)
  connection.ts              ← connection manager, WAL mode, singleton per db
  migration-service.ts       ← sequential migration runner with schema_version
  migrations/
    downloads/
      001_initial.ts
      002_save_tables.ts
      ...
    plugins/
      001_initial.ts
  repositories/
    downloads.ts             ← typed queries, zero raw SQL
    plugins.ts               ← typed queries, zero raw SQL
    games.ts                 ← typed queries, zero raw SQL
```

### Migration contract

```typescript
interface Migration {
  id: number
  name: string
  up(sql: SqlRunner): void
}

class MigrationService {
  async runMigrations(migrations: Migration[]): Promise<void> {
    this.ensureSchemaVersionTable()
    const currentVersion = this.getCurrentVersion()

    for (const migration of migrations.sort((a, b) => a.id - b.id)) {
      if (migration.id <= currentVersion) continue
      this.db.transaction(() => {
        migration.up(this.runner)
        this.setVersion(migration.id)
      })()
    }
  }
}
```

### Repository pattern

All runtime data access through typed repository classes. Zero raw SQL strings in feature code:

```typescript
// desktop/db/repositories/downloads.ts
class DownloadsRepository {
  getByUserId(userId: string): Download[] { ... }
  insert(download: CreateDownload): Download { ... }
  updateStatus(id: string, status: DownloadStatus): void { ... }
  getActiveDownloads(): Download[] { ... }
}
```

### Existing DB migration plan

- **`desktop/db.ts`** (19 tables, ~25 inline ALTER TABLE) → extracted into `migrations/downloads/` sequence. Deleted.
- **`desktop/plugins/db.ts`** (4 tables, 1 inline ALTER TABLE) → extracted into `migrations/plugins/`. Deleted.
- **`desktop/plugins/manager.ts:744`** plugin data DBs → `PluginRuntime` uses `MigrationService.openDatabase()`. No raw `new Database()`.
- **`desktop/downloads/index.ts:451`** inline CREATE TABLE → moved to migration or repository. Inline SQL removed.

### schema_version table

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

---

## 9. Error Type Hierarchy

```typescript
class PluginError extends Error {
  constructor(message: string, public readonly pluginId: string) {
    super(message)
    this.name = 'PluginError'
  }
}

class PluginNotFoundError extends PluginError {}
class PluginNotRunningError extends PluginError {}
class PluginIncompatibleError extends PluginError {}
class PluginSandboxError extends PluginError {}
class PluginTimeoutError extends PluginError {}

class SlotError extends Error {
  constructor(message: string, public readonly location: string, public readonly pluginId: string) {
    super(message)
    this.name = 'SlotError'
  }
}

class SlotRenderError extends SlotError {}
class SlotValidationError extends SlotError {}
class SlotSuspendedError extends SlotError {}

class PermissionError extends Error {}
class PermissionDeniedError extends PermissionError {}
class PermissionTimeoutError extends PermissionError {}

class DatabaseError extends Error {}
class MigrationError extends DatabaseError {}
```

---

## 10. IPC Hardening

All IPC handlers must validate sender and input:

```typescript
// desktop/ipc/plugins.ts pattern
ipcMain.handle('plugin:enable', async (event, pluginId: string) => {
  validateSender(event)  // ← only main window can call
  assertString(pluginId) // ← type guard
  return await pluginManager.enable(pluginId)
})

function validateSender(event: IpcMainInvokeEvent): void {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (event.sender !== mainWindow?.webContents) {
    throw new Error('IPC call from unauthorized sender')
  }
}
```

**`execSync('git clone')` → `execFile('git', ['clone', ...])`** to avoid shell injection.

**IPC channel allowlist:** Plugin data calls (`plugin:call-data`) restrict method names to declared exports.

---

## 11. Event Bus Hardening

```typescript
class IsolatedEventBus {
  private emitter: EventEmitter
  private listenerErrors: Map<string, number> = new Map()

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(0)
    this.emitter.on('error', (eventName, error, pluginId) => {
      // Log + track, never crash
      this.listenerErrors.set(
        pluginId,
        (this.listenerErrors.get(pluginId) || 0) + 1
      )
    })
  }

  on(event: string, listener: Function, pluginId: string): () => void {
    const wrapped = (...args: unknown[]) => {
      try {
        listener(...args)
      } catch (error) {
        this.emitter.emit('error', event, error, pluginId)
      }
    }
    this.emitter.on(event, wrapped)
    return () => this.emitter.off(event, wrapped)
  }
}
```

---

## 12. Epic Plugin Migration

All hardcoded Epic references removed:

| Current location | Hardcoded reference | Replacement |
|---|---|---|
| `PluginSettings.tsx:880` | `pluginId === 'otix-epic-games'` → custom field | Removed. Epic config renders via slot |
| `PluginSettings.tsx:888` | `pluginId !== 'otix-radarr'` → guard | Removed. Radarr uses same generic path |
| `PluginSettings.tsx:1037` | `'instances.quality_profile_id'` etc. | Removed. Plugin defines its own config schema |
| `settings.router.ts:94-98` | `SettingsEpicLibraryRoute` | Removed. Created dynamically from manifest |
| `matching.tsx` | Epic Library tab | Removed. Becomes slot `settings/matching/extensions` |

Epic plugin manifest declares its settings tab + sections. `SettingsEpicLibraryPage`, `EpicMatchModal`, `EpicPluginLogin`, `EpicLibrarySection` — all these components remain in the Epic plugin's own codebase (loaded via worker), not in the Otix core.

---

## 13. Forward Compatibility Policy

- **Slot names are permanent.** Never renamed. Deprecated slots render for 10 years after deprecation.
- **Widget schemas are additive-only.** New props are always optional. Never remove or re-type existing props.
- **Migration IDs are permanent and sequential.** Never renumbered.
- **IPC channel names are permanent.** Never renamed.
- **Error types extend a stable hierarchy.** New error classes added as subclasses.
- **Widget catalog versioned** (`catalog/v1`, `catalog/v2`). Old catalog versions remain supported.

---

## 14. What Gets Deleted

| File / Module | Reason |
|---|---|
| `desktop/db.ts` | Replaced by `desktop/db/` migration service + repositories |
| `desktop/plugins/db.ts` | Replaced by `desktop/db/repositories/plugins.ts` + migrations |
| `desktop/plugins/loader.ts` | Replaced by worker-based runtime |
| `desktop/plugins/manager.ts` (current) | Rewritten with state machine + locks |
| `desktop/plugins/permissions.ts` (current) | Rewritten, gating moves to worker bridge |
| `desktop/plugins/event-bus.ts` (current) | Rewritten with isolated listeners |
| `desktop/plugins/api-proxy.ts` (current) | Rewritten with URL validation |
| `frontend/src/features/settings/pages/settings-epic-library-page.tsx` | Replaced by dynamic plugin tab |
| `frontend/src/features/settings/sections/epic-library.tsx` | Moved to Epic plugin |
| `frontend/src/features/settings/sections/matching.tsx` (Epic tab) | Epic tab removed, becomes slot |
| Hardcoded `'otix-epic-games'` / `'otix-radarr'` in PluginSettings.tsx | Replaced by generic slot-based rendering |
| Duplicate type definitions in PluginSettings.tsx + PluginConfigPanel.tsx | Extracted to shared types |
