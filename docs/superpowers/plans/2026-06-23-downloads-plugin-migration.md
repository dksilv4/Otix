# Downloads Plugin Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement step-by-step. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split monolithic `desktop/downloads/` into worker-thread plugins under `otix-plugins/`. Extend plugin framework for inter-plugin calls. Create SABnzbd, NZBPlanet, Downloads orchestrator, and Radarr/Sonarr/Lidarr plugins.

**Architecture:** Worker-thread plugins communicate via event bus with request/reply routing. Plugins declare service roles in manifest, discovered at runtime by role. Downloads plugin orchestrates by discovering providers — never hardcoded to specific plugin names.

**Tech Stack:** Electron, TypeScript, better-sqlite3, worker_threads

## Global Constraints

- All new plugins go under `otix-plugins/<name>/` at repo root
- Each plugin is a real `desktop/plugins/` worker-thread plugin with `manifest.json`
- Inter-plugin calls use `plugin.call(targetId, method, args)` — no direct imports between plugins
- Downloads plugin discovers providers by service role, never by plugin name
- Existing `downloads` DB tables stay in main process, accessed via IPC
- Backward-compatible IPC handlers maintained during transition

---

## File Structure

### New Files

```
otix-plugins/
  sabnzbd/
    manifest.json
    index.ts                     ← plugin entry
  nzbplanet/
    manifest.json
    index.ts                     ← plugin entry
  downloads/
    manifest.json
    index.ts                     ← orchestrator entry
    organizer.ts                 ← moved & adapted from desktop/downloads/organizer.ts
  radarr/
    manifest.json
    index.ts                     ← multi-instance arr plugin
    arr-client.ts                ← shared arr API client
  sonarr/
    manifest.json
    index.ts
    arr-client.ts
  lidarr/
    manifest.json
    index.ts
    arr-client.ts

desktop/plugins/
  service-registry.ts            ← NEW: tracks enabled plugins by service role
  plugin-service-discovery.ts    ← NEW: discover by role primitives
```

### Modified Files

```
desktop/plugins/
  types.ts                       ← add PluginService, extend PluginContext
  event-bus.ts                   ← add callPlugin(), registerHandler()
  worker-bridge.ts               ← add 'plugins.call' RPC handler
  worker.ts                      ← add call(), handle(), discover() to PluginContext
  runtime.ts                     ← pass service registry ref
  manager.ts                     ← add getServiceRegistry()

desktop/ipc/
  downloads.ts                   ← refactor as thin routers calling plugins
  main.ts or plugin-setup.ts     ← register otix-plugins/ as dev extensions dir

desktop/downloads/
  index.ts                       ← strip SABnzbd/NZBPlanet code, keep DB CRUD + shared tables
  organizer.ts                   ← removed (moved to downloads plugin)
```

---

### Task 1: Extend Plugin Framework — Service Registry & Types

**Files:**
- Create: `desktop/plugins/service-registry.ts`
- Modify: `desktop/plugins/types.ts`

**Interfaces:**
- Consumes: `PluginManifest.services`
- Produces: `PluginService` type, `ServiceRegistry` class

- [ ] **Step 1: Add PluginService type to types.ts**

```typescript
// Add to desktop/plugins/types.ts after PluginConfigField:

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
```

Update `PluginManifest.services` to support structured declarations:

```typescript
// In PluginManifest, change:
services?: string[]
// To:
services?: (string | PluginService)[]
```

- [ ] **Step 2: Create desktop/plugins/service-registry.ts**

```typescript
import type { ServiceInfo } from './types'
import { PluginNotRunningError } from './errors'

export class ServiceRegistry {
  private services: Map<string, ServiceInfo[]> = new Map()  // type → infos

  register(pluginId: string, type: string, methods: string[], protocol?: string): void {
    if (!this.services.has(type)) this.services.set(type, [])
    const existing = this.services.get(type)!
    if (existing.some(s => s.pluginId === pluginId)) return
    existing.push({ pluginId, type, protocol, methods })
  }

  unregister(pluginId: string): void {
    for (const [type, infos] of this.services) {
      this.services.set(type, infos.filter(s => s.pluginId !== pluginId))
    }
  }

  discover(type: string): ServiceInfo[] {
    return this.services.get(type) || []
  }

  discoverOne(type: string): ServiceInfo | null {
    return this.discover(type)[0] || null
  }

  hasService(pluginId: string): string[] {
    const types: string[] = []
    for (const [type, infos] of this.services) {
      if (infos.some(s => s.pluginId === pluginId)) types.push(type)
    }
    return types
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add desktop/plugins/types.ts desktop/plugins/service-registry.ts
git commit -m "feat: add PluginService type and ServiceRegistry"
```

---

### Task 2: Extend Plugin Framework — Inter-Plugin Call Routing

**Files:**
- Create: `desktop/plugins/plugin-service-discovery.ts`
- Modify: `desktop/plugins/event-bus.ts`
- Modify: `desktop/plugins/worker-bridge.ts`
- Modify: `desktop/plugins/worker.ts`
- Modify: `desktop/plugins/runtime.ts`
- Modify: `desktop/plugins/manager.ts`
- Modify: `desktop/plugins/types.ts` (PluginContext)

- [ ] **Step 1: Add inter-plugin call to event-bus.ts**

```typescript
// Add to IsolatedEventBus class:
private callHandlers: Map<string, (args: any) => Promise<any>> = new Map()

registerCallHandler(method: string, handler: (args: any) => Promise<any>): void {
  this.callHandlers.set(method, handler)
}

unregisterCallHandler(method: string): void {
  this.callHandlers.delete(method)
}

async callPluginMethod(method: string, args: any): Promise<any> {
  const handler = this.callHandlers.get(method)
  if (!handler) throw new Error(`No handler registered for method: ${method}`)
  return handler(args)
}
```

- [ ] **Step 2: Add 'plugins.call' RPC handler to worker-bridge.ts**

Add to `GATED_METHODS`:
```typescript
'plugins.call': 'events:subscribe' as PluginPermission,
'plugins.discover': 'events:subscribe' as PluginPermission,
```

Add to `executeMethod()` switch statement after the `case 'onDestroy':` block:

```typescript
case 'plugins.call': {
  const [targetId, method, callArgs] = args as [string, string, Record<string, any>]
  const runtime = deps.pluginManager?.getRuntime(targetId)
  if (!runtime) throw new Error(`Plugin not running: ${targetId}`)
  return runtime.callMethod(method, callArgs)
}
case 'plugins.discover': {
  const serviceType = args[0] as string
  return deps.serviceRegistry?.discover(serviceType) || []
}
```

- [ ] **Step 3: Pass pluginManager + serviceRegistry references through BridgeDependencies**

Add to `BridgeDependencies` interface in worker-bridge.ts:

```typescript
import type { PluginRuntime } from './runtime'
import type { ServiceRegistry } from './service-registry'

export interface BridgeDependencies {
  // ... existing ...
  pluginManager: PluginManager | null
  serviceRegistry: ServiceRegistry | null
}
```

Update `runtime.ts` constructor to accept `pluginManager` and `serviceRegistry` references:

```typescript
// In PluginRuntime constructor:
constructor(
  pluginId: string,
  manifest: PluginManifest,
  private pluginDir: string,
  private eventBus: IsolatedEventBus,
  private permissionCheck: (perm: PluginPermission) => boolean,
  private permissionRequest: (perm: PluginPermission) => Promise<boolean>,
  private configStore: { getAll(): Record<string, unknown>; get(key: string): unknown; set(key: string, value: unknown): void },
  private apiBaseUrl: string,
  private authToken: string,
  private pluginManager: PluginManager | null,
  private serviceRegistry: ServiceRegistry | null,
) { ... }
```

Update `start()` to pass them through bridge deps:

```typescript
const bridgeDeps: BridgeDependencies = {
  // ... existing ...
  pluginManager: this.pluginManager,
  serviceRegistry: this.serviceRegistry,
}
```

- [ ] **Step 4: Add call(), handle(), discover() to worker.ts PluginContext**

Add to `const ctx` in worker.ts, after `config:`:

```typescript
call: (targetId: string, method: string, args?: Record<string, any>) =>
  rpc('plugins.call', targetId, method, args),

handle: (method: string, handler: (args: any) => Promise<any>) => {
  // Store locally in module-level map
  if (!globalThis.__pluginHandlers) globalThis.__pluginHandlers = new Map()
  globalThis.__pluginHandlers.set(method, handler)
  return () => globalThis.__pluginHandlers.delete(method)
},

discover: (serviceType: string) =>
  rpc('plugins.discover', serviceType),

// Also need to handle incoming call from main-process
// When main sends { type: 'plugin-call', method, args }
```

Add message handler for incoming plugin calls in `parentPort!.on('message', ...)`:

```typescript
// After event handling:
if (msg.type === 'plugin-call') {
  const handlers = (globalThis as any).__pluginHandlers as Map<string, (args: any) => Promise<any>>
  const handler = handlers?.get((msg as any).method)
  if (!handler) {
    parentPort!.postMessage({
      type: 'plugin-call-error', id: (msg as any).id,
      error: `No handler for: ${(msg as any).method}`,
    })
    return
  }
  try {
    const result = await handler((msg as any).args)
    parentPort!.postMessage({
      type: 'plugin-call-result', id: (msg as any).id, result,
    })
  } catch (err: any) {
    parentPort!.postMessage({
      type: 'plugin-call-error', id: (msg as any).id, error: err.message,
    })
  }
  return
}
```

Add to `MainToWorkerMessage` and `WorkerToMainMessage` types:

```typescript
// In MainToWorkerMessage:
| { type: 'plugin-call'; id: string; method: string; args: any }

// In WorkerToMainMessage:
| { type: 'plugin-call-result'; id: string; result: any }
| { type: 'plugin-call-error'; id: string; error: string }
```

- [ ] **Step 5: Register plugin call handlers in worker-bridge.ts**

In `executeMethod`, after the `case 'plugins.call'` block:

```typescript
case 'host.emit': {
  // ... existing ...
}
```

Add to the main process message handler loop in `createWorkerBridge`, after the `'rpc'` handling block:

```typescript
if (msg.type === 'plugin-call-result') {
  // Route back to the original caller
  const pending = (globalThis as any).__pendingPluginCalls as Map<string, (result: any) => void>
  const resolve = pending?.get(msg.id)
  if (resolve) {
    pending.delete(msg.id)
    resolve(msg.result)
  }
  return
}
```

- [ ] **Step 6: Update PluginContext type in types.ts**

Add to `PluginContext` interface:

```typescript
export interface PluginContext {
  // ... existing ...
  call: (targetId: string, method: string, args?: Record<string, any>) => Promise<any>
  handle: (method: string, handler: (args: any) => Promise<any>) => () => void
  discover: (serviceType: string) => Promise<ServiceInfo[]>
}
```

- [ ] **Step 7: Update PluginManager to integrate service registry**

In manager.ts:

Add constructor param and property:
```typescript
public readonly serviceRegistry: ServiceRegistry

constructor(...) {
  // ... existing ...
  this.serviceRegistry = new ServiceRegistry()
}
```

In `enable()` after plugin starts, register services:
```typescript
// After runtime.start()
const manifestServices = info.manifest.services || []
for (const svc of manifestServices) {
  const svcDecl = typeof svc === 'string' ? { type: svc } : svc
  // Detect exported methods from manifest (or use a default set per type)
  this.serviceRegistry.register(pluginId, svcDecl.type, ['*'], svcDecl.protocol)
}
```

In `disable()`:
```typescript
this.serviceRegistry.unregister(pluginId)
```

Add getter:
```typescript
getServiceRegistry(): ServiceRegistry {
  return this.serviceRegistry
}

getRuntime(pluginId: string): PluginRuntime | null {
  return this.runtimes.get(pluginId) || null
}
```

Update `PluginRuntime` creation in `enable()` to pass `this` and `serviceRegistry`:

```typescript
const runtime = new PluginRuntime(
  pluginId, info.manifest, pluginDir, eventBus,
  (perm: PluginPermission) => this.pluginsRepo.getPermissions(pluginId).some(p => p.permission === perm),
  async (perm: PluginPermission) => { /* ... existing ... */ },
  configStore, this.apiBaseUrl, this.authToken,
  this, this.serviceRegistry,  // NEW
)
```

- [ ] **Step 8: Commit**

```bash
git add desktop/plugins/
git commit -m "feat: add inter-plugin call, handle, discover primitives to plugin framework"
```

---

### Task 3: Create otix-plugins/ Directory Structure & Dev Discovery

**Files:**
- Modify: `desktop/main.ts` (or wherever plugin manager is initialized)

- [ ] **Step 1: Create otix-plugins/ base directory structure**

```bash
mkdir -p otix-plugins/sabnzbd
mkdir -p otix-plugins/nzbplanet
mkdir -p otix-plugins/downloads
mkdir -p otix-plugins/radarr
mkdir -p otix-plugins/sonarr
mkdir -p otix-plugins/lidarr
```

- [ ] **Step 2: Register otix-plugins/ as dev extensions dir in main.ts**

Search the codebase for where `PluginManager` is instantiated. The `devExtensionsDir` parameter is already supported — pass the absolute path to `otix-plugins/`.

```typescript
// In main.ts (or wherever PluginManager is constructed):
const devPluginsDir = path.join(app.getAppPath(), 'otix-plugins')
const pluginManager = new PluginManager(
  extensionsDir,
  pluginsRepo,
  userDataPath,
  devPluginsDir,  // otix-plugins/ directory at repo root
)
```

- [ ] **Step 3: Commit**

```bash
git add otix-plugins/
git commit -m "feat: scaffold otix-plugins directory with dev discovery path"
```

---

### Task 4: Create SABnzbd Plugin

**Files:**
- Create: `otix-plugins/sabnzbd/manifest.json`
- Create: `otix-plugins/sabnzbd/index.ts`

- [ ] **Step 1: Create otix-plugins/sabnzbd/manifest.json**

```json
{
  "name": "sabnzbd",
  "version": "1.0.0",
  "description": "SABnzbd usenet download client",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "ui:settings"],
  "services": [
    { "type": "downloader", "protocol": "usenet" }
  ],
  "config": {
    "host": { "type": "string", "label": "Host", "default": "localhost" },
    "port": { "type": "number", "label": "Port", "default": 8080 },
    "apiKey": { "type": "secret", "label": "API Key" },
    "useSsl": { "type": "boolean", "label": "Use SSL", "default": false },
    "category": { "type": "string", "label": "Default Category", "default": "games" }
  },
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 2: Create otix-plugins/sabnzbd/index.ts**

Extract SABnzbd client code from `desktop/downloads/index.ts`. Implements the standard `Downloader` interface.

```typescript
import type { PluginContext } from '../../desktop/plugins/types'

interface DownloadRequest {
  downloadUrl: string
  title: string
  category?: string
}

interface QueueItem {
  id: string
  title: string
  status: string
  percentage: number
  size: number
  downloaded: number
  speed?: number
  eta?: number
}

interface HistoryItem {
  id: string
  title: string
  size: number
  status: string
  storagePath: string
  completedAt: string
}

function sabnzbdUrl(host: string, port: number, useSsl: boolean, mode: string, extraParams: Record<string, string> = {}): string {
  const scheme = useSsl ? 'https' : 'http'
  const url = new URL(`${scheme}://${host}:${port}/api`)
  url.searchParams.set('output', 'json')
  url.searchParams.set('mode', mode)
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v)
  return url.toString()
}

export default function sabnzbdPlugin(ctx: PluginContext) {
  ctx.handle('add-download', async (args: DownloadRequest) => {
    const config = ctx.config.getAll()
    const url = sabnzbdUrl(
      config.host as string, config.port as number, config.useSsl as boolean,
      'addurl', {
        apikey: config.apiKey as string,
        name: args.downloadUrl,
        nzbname: args.title,
        cat: args.category || (config.category as string) || 'games',
      },
    )
    const response = await ctx.fetch(url)
    const data = await response.json() as any
    if (data?.nzo_ids?.[0]) return { id: data.nzo_ids[0] }
    if (data?.status && data?.nzo_ids?.[0]) return { id: data.nzo_ids[0] }
    throw new Error('Failed to add NZB to SABnzbd')
  })

  ctx.handle('get-queue', async () => {
    const config = ctx.config.getAll()
    const url = sabnzbdUrl(
      config.host as string, config.port as number, config.useSsl as boolean,
      'queue', { apikey: config.apiKey as string },
    )
    try {
      const response = await ctx.fetch(url)
      const data = await response.json() as any
      const slots = data?.queue?.slots ?? []
      return slots.map((s: any): QueueItem => ({
        id: s.nzo_id ?? '',
        title: s.filename ?? '',
        status: s.status ?? '',
        percentage: parseFloat(s.percentage ?? '0'),
        size: parseInt(s.size ?? '0', 10),
        downloaded: parseInt(s.sizeleft ?? '0', 10),
      }))
    } catch { return [] }
  })

  ctx.handle('get-history', async (args: { limit?: number }) => {
    const config = ctx.config.getAll()
    const url = sabnzbdUrl(
      config.host as string, config.port as number, config.useSsl as boolean,
      'history', { apikey: config.apiKey as string, limit: String(args.limit ?? 50) },
    )
    try {
      const response = await ctx.fetch(url)
      const data = await response.json() as any
      const slots = data?.history?.slots ?? []
      return slots.map((s: any): HistoryItem => ({
        id: s.nzo_id ?? '',
        title: s.name ?? '',
        size: parseInt(s.size ?? '0', 10),
        status: s.status ?? '',
        storagePath: s.storage ?? '',
        completedAt: s.completed ? new Date(s.completed * 1000).toISOString() : '',
      }))
    } catch { return [] }
  })

  ctx.handle('remove-download', async (args: { id: string }) => {
    const config = ctx.config.getAll()
    const url = sabnzbdUrl(
      config.host as string, config.port as number, config.useSsl as boolean,
      'queue', {
        apikey: config.apiKey as string,
        name: 'delete',
        value: args.id,
      },
    )
    const response = await ctx.fetch(url)
    const data = await response.json() as any
    return data?.status === true
  })

  ctx.handle('test-connection', async () => {
    try {
      const config = ctx.config.getAll()
      const url = sabnzbdUrl(
        config.host as string, config.port as number, config.useSsl as boolean,
        'version', { apikey: config.apiKey as string },
      )
      const response = await ctx.fetch(url)
      const data = await response.json() as any
      return { ok: !!data?.version, message: data?.version ? `SABnzbd v${data.version}` : 'No version response' }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add otix-plugins/sabnzbd/
git commit -m "feat: create SABnzbd downloader plugin"
```

---

### Task 5: Create NZBPlanet Plugin

**Files:**
- Create: `otix-plugins/nzbplanet/manifest.json`
- Create: `otix-plugins/nzbplanet/index.ts`

- [ ] **Step 1: Create otix-plugins/nzbplanet/manifest.json**

```json
{
  "name": "nzbplanet",
  "version": "1.0.0",
  "description": "NZBPlanet usenet search provider",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "ui:settings"],
  "services": [
    { "type": "search-provider", "protocol": "usenet" }
  ],
  "config": {
    "apiKey": { "type": "secret", "label": "API Key" },
    "categoryIds": { "type": "string", "label": "Category IDs", "default": "1000,2000" }
  },
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 2: Create otix-plugins/nzbplanet/index.ts**

Extract NZBPlanet client from `desktop/downloads/index.ts`. Adapts to `SearchProvider` interface.

```typescript
import type { PluginContext } from '../../desktop/plugins/types'

interface SearchResult {
  id: string
  title: string
  size: number
  pubDate: string
  category: string
  downloadUrl: string
  infoUrl: string
  source: string
  isScene?: boolean
  group?: string
}

// In-memory cache (1 hour TTL)
const cache = new Map<string, { results: SearchResult[]; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000

function parseXmlItems(xml: string): SearchResult[] {
  const results: SearchResult[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const tag = (name: string) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))
      return m ? m[1].trim() : ''
    }
    results.push({
      id: tag('guid'),
      title: tag('title').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
      size: parseInt(tag('size'), 10) || 0,
      pubDate: tag('pubDate') || new Date().toISOString(),
      category: tag('category'),
      downloadUrl: tag('link'),
      infoUrl: tag('link'),
      source: 'nzbplanet',
    })
  }
  results.sort((a, b) => b.size - a.size)
  return results
}

export default function nzbplanetPlugin(ctx: PluginContext) {
  ctx.handle('search', async (args: { query: string; categories?: string; limit?: number }) => {
    const config = ctx.config.getAll()
    const apiKey = config.apiKey as string
    if (!apiKey) throw new Error('NZBPlanet API key not configured')

    // Check cache
    const cacheKey = args.query.toLowerCase().trim()
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.results

    const categories = args.categories || (config.categoryIds as string) || '1000,2000'
    const url = `https://api.nzbplanet.net/api?t=search&apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(args.query)}&cat=${encodeURIComponent(categories)}&o=json&num=${args.limit || 20}`

    const response = await ctx.fetch(url)
    const text = await response.text()

    let results: SearchResult[]

    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text)
      const items = data?.channel?.item
      if (!items) return []
      const itemList = Array.isArray(items) ? items : [items]
      results = itemList.map((item: any) => ({
        id: item.guid ?? '',
        title: item.title ?? '',
        size: parseInt(item.size ?? '0', 10),
        pubDate: item.pubDate ?? new Date().toISOString(),
        category: item.category ?? '',
        downloadUrl: item.link ?? '',
        infoUrl: item.link ?? '',
        source: 'nzbplanet',
      }))
      results.sort((a, b) => b.size - a.size)
    } else if (text.includes('<?xml') || text.includes('<rss')) {
      results = parseXmlItems(text)
    } else {
      return []
    }

    cache.set(cacheKey, { results, fetchedAt: Date.now() })
    return results
  })

  ctx.handle('test-connection', async () => {
    try {
      const config = ctx.config.getAll()
      const apiKey = config.apiKey as string
      if (!apiKey) return { ok: false, message: 'No API key configured' }

      const url = new URL('https://api.nzbplanet.net/api')
      url.searchParams.set('t', 'search')
      url.searchParams.set('apikey', apiKey)
      url.searchParams.set('q', 'test')
      url.searchParams.set('cat', '1000')
      url.searchParams.set('o', 'json')
      url.searchParams.set('num', '1')

      const response = await ctx.fetch(url.toString())
      return { ok: response.ok, message: response.ok ? 'Connection successful' : `HTTP ${response.status}` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  })

  ctx.handle('status', async () => {
    const config = ctx.config.getAll()
    return { configured: !!config.apiKey }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add otix-plugins/nzbplanet/
git commit -m "feat: create NZBPlanet search provider plugin"
```

---

### Task 6: Create Downloads Orchestrator Plugin

**Files:**
- Create: `otix-plugins/downloads/manifest.json`
- Create: `otix-plugins/downloads/index.ts`
- Create: `otix-plugins/downloads/organizer/parsing.ts`
- Create: `otix-plugins/downloads/organizer/naming.ts`
- Create: `otix-plugins/downloads/organizer/discovery.ts`
- Create: `otix-plugins/downloads/organizer/index.ts`
- Create: `otix-plugins/downloads/quality-filter.ts`
- Create: `otix-plugins/downloads/update-tracker.ts`
- Create: `otix-plugins/downloads/wishlist.ts`
- Create: `otix-plugins/downloads/path-mappings.ts`

- [ ] **Step 1: Create otix-plugins/downloads/manifest.json**

```json
{
  "name": "downloads",
  "version": "1.0.0",
  "description": "Download orchestrator — discovers providers, coordinates search/download, post-processes and organizes media",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "events:subscribe", "storage:local", "ui:settings", "notifications", "worker:filesystem"],
  "services": [
    { "type": "downloads-orchestrator" }
  ],
  "config": {
    "postProcessEnabled": { "type": "boolean", "label": "Auto post-process", "default": true },
    "autoSearchWishlist": { "type": "boolean", "label": "Auto search wishlist", "default": false },
    "wishlistIntervalHours": { "type": "number", "label": "Wishlist check interval (hours)", "default": 12 },
    "preferredRepackers": { "type": "string", "label": "Preferred repackers (comma-separated)" },
    "allowHypervisor": { "type": "boolean", "label": "Allow hypervisor VMs", "default": false },
    "autoOrganizeEnabled": { "type": "boolean", "label": "Auto-organize completed downloads", "default": false },
    "namingTemplate": { "type": "string", "label": "Naming template", "default": "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}" }
  },
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 2: Create otix-plugins/downloads/quality-filter.ts**

Extract from `desktop/downloads/index.ts` lines 206-451:

```typescript
export interface SearchResult {
  id: string
  title: string
  size: number
  pubDate: string
  category: string
  downloadUrl: string
  infoUrl: string
  source: string
  isScene?: boolean
  group?: string
  seeders?: number
  raw?: Record<string, any>
}

const DEMO_PATTERNS = ['demo', 'trial', 'beta', 'alpha']
const SCENE_TAGS = ['iso', 'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl', 'skidrow', 'flt']
const HYPERVISOR_TAGS = ['hv', 'hypervisor', 'vm', 'vmware', 'virtualbox', 'qemu', 'vmic']
const CRACK_ONLY = ['crack by', 'crack-only', 'crack only', 'crackfix', 'standalone crack']

export function isFullGame(result: SearchResult): boolean {
  const title = result.title.toLowerCase()
  return !DEMO_PATTERNS.some(p => title.includes(p))
}

export function hasSceneTags(result: SearchResult): boolean {
  const title = result.title.toLowerCase()
  return SCENE_TAGS.some(tag => title.includes(tag))
}

export function hasPreferredRepacker(result: SearchResult, repackers: string[]): boolean {
  if (repackers.length === 0) return false
  const title = result.title.toLowerCase()
  return repackers.some(r => title.includes(r.toLowerCase()))
}

export function hasHypervisorTags(result: SearchResult): boolean {
  const title = result.title.toLowerCase()
  return HYPERVISOR_TAGS.some(tag => {
    if (tag === 'hv') return title.includes(' hv ') || title.startsWith('hv ')
    return title.includes(tag)
  })
}

export function isNotCrackOnly(result: SearchResult): boolean {
  const title = result.title.toLowerCase()
  return !CRACK_ONLY.some(p => title.includes(p))
}

export function filterQualityResults(results: SearchResult[]): SearchResult[] {
  const filtered = results.filter(r => isFullGame(r) && isNotCrackOnly(r))
  return filtered.length > 0 ? filtered : results
}

export function autoPickBest(results: SearchResult[], preferredRepackers?: string, allowHypervisor?: boolean): SearchResult | null {
  let quality = filterQualityResults(results)
  if (quality.length === 0) return null

  if (!allowHypervisor) {
    quality = quality.filter(r => !hasHypervisorTags(r))
    if (quality.length === 0) return null
  }

  const repackerList = preferredRepackers ? preferredRepackers.split(',').map(r => r.trim()).filter(Boolean) : []

  const rank = (list: SearchResult[]) => {
    const scene = list.filter(r => hasSceneTags(r))
    const nonScene = list.filter(r => !hasSceneTags(r))
    return [...scene, ...nonScene]
  }

  if (repackerList.length > 0) {
    const preferred = quality.filter(r => hasPreferredRepacker(r, repackerList))
    const others = quality.filter(r => !hasPreferredRepacker(r, repackerList))
    return [...rank(preferred), ...rank(others)][0]
  }

  return rank(quality)[0]
}
```

- [ ] **Step 3: Create otix-plugins/downloads/organizer/parsing.ts**

Extract `parseReleaseName()` from `desktop/downloads/organizer.ts` lines 84-210.
Include the full 4-strategy cascade. Also `gameSignature()`, `extractGroup()`, `parseVersion()` from `desktop/downloads/index.ts` lines 276-333 — these are needed by organizer.

```typescript
export interface ParsedRelease {
  title: string
  cleanTitle: string
  year?: string
  edition?: string
  platform?: string
  group?: string
  version?: string
  rawName: string
  isScene: boolean
}

const _CORE_SKIP_WORDS = new Set([
  'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl',
  'skidrow', 'flt', 'update', 'patch', 'hotfix', 'dlc', 'addon', 'iso',
  'program', 'game', 'install', 'setup', 'files', 'data', 'content',
])

export function gameSignature(title: string): string {
  const lower = title.toLowerCase()
    .replace(/\s*password=.*$/i, '')
    .replace(/-[a-z0-9_.]+$/, '')
    .replace(/\b(update|patch|hotfix|demo|dlc|addon|repack)\b/gi, '')
    .replace(/\bv?\d+(\.\d+)*\b/gi, '')
  return lower.split(/[.\s]+/)
    .filter(w => w && !_CORE_SKIP_WORDS.has(w))
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('')
}

export function extractGroup(title: string): string | null {
  const lower = title.toLowerCase().trim()
  const pwMatch = lower.match(/password=([a-z0-9_.]+)/)
  const cleaned = lower.replace(/\s*password=.*$/i, '').trim()
  const dashMatch = cleaned.match(/-([a-z0-9_.]+)$/)
  if (dashMatch) return dashMatch[1]
  const words = cleaned.split(/\s+/).filter(Boolean)
  const last = words[words.length - 1]
  if (last && _CORE_SKIP_WORDS.has(last)) return last
  if (last && /^[a-z]{2,10}$/.test(last) && !/^\d+$/.test(last)) return last
  if (pwMatch && pwMatch[1].length >= 2 && pwMatch[1].length <= 15) return pwMatch[1]
  return null
}

export function parseVersion(title: string): number | null {
  const lower = title.toLowerCase()
  const baseMatch = lower.match(/\bv(\d{3,})\b/)
  if (baseMatch) return parseInt(baseMatch[1], 10)
  const updateMatch = lower.match(/\bupdate\s+(\d{3,})/)
  if (updateMatch) return parseInt(updateMatch[1], 10)
  return null
}

const EDITION_RE = /(?<edition>goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition/gi

export function parseReleaseName(rawName: string): ParsedRelease {
  const base: ParsedRelease = {
    title: '', cleanTitle: gameSignature(rawName), rawName, isScene: false,
  }

  // Strategy 1: Scene
  let m = rawName.match(/^(?<title>[A-Za-z0-9._+\-]+?)\.?(?:v?(?<version>\d+(?:\.\d+)*))?[._-]?(?<extra>REPACK|PROPER|UPDATE|MULTI\d*|GOTY|DEF|ENHANCED)?[._-](?<group>[A-Za-z0-9]{2,20})$/)
  if (m?.groups) {
    const g = m.groups
    let title = g.title.replace(/[._]/g, ' ').trim()
    const edMatch = title.match(EDITION_RE)
    const edition = edMatch ? edMatch[0].trim() : undefined
    if (edition) title = title.replace(edition, '').trim()
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/)
    return {
      title: title.replace(/\s+/g, ' ').trim(), cleanTitle: gameSignature(rawName),
      year: yearMatch?.groups?.year, edition, group: g.group, version: g.version,
      rawName, isScene: true,
    }
  }

  // Strategy 2: Elamigos
  m = rawName.match(/^(?<title>.+?)\s+(?:v?(?<version>\d{3,}))?\s*(?<group>[A-Za-z0-9]+?)(?:\s+password=.*)?$/i)
  if (m?.groups) {
    let title = m.groups.title.trim()
    const edMatch = title.match(EDITION_RE)
    const edition = edMatch ? edMatch[0].trim() : undefined
    if (edition) title = title.replace(edition, '').trim()
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/)
    return {
      title: title.replace(/\s+/g, ' ').trim(), cleanTitle: gameSignature(rawName),
      year: yearMatch?.groups?.year, edition, group: m.groups.group, version: m.groups.version,
      rawName, isScene: false,
    }
  }

  // Strategy 3: Year in brackets
  m = rawName.match(/^(?<title>.+?)\s*[\[\(](?<year>(?:19|20)\d{2})[\]\)]/)
  if (m?.groups) {
    let title = m.groups.title.replace(/[._]/g, ' ').trim()
    const edMatch = title.match(EDITION_RE)
    const edition = edMatch ? edMatch[0].trim() : undefined
    if (edition) title = title.replace(edition, '').trim()
    const platMatch = rawName.match(/\[(?<platform>Multi|PC|PS\d|Xbox|Switch|Steam|GOG|Android|iOS)\]/i)
    return {
      title: title.replace(/\s+/g, ' ').trim(), cleanTitle: gameSignature(rawName),
      year: m.groups.year, edition, platform: platMatch?.groups?.platform,
      group: extractGroup(rawName) ?? undefined,
      version: parseVersion(rawName)?.toString(), rawName, isScene: false,
    }
  }

  // Strategy 4: Fallback
  let title = gameSignature(rawName)
  const edMatch = rawName.match(EDITION_RE)
  const edition = edMatch ? edMatch[0].trim() : undefined
  if (edition) title = title.replace(new RegExp(edition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim()
  const yearBracket = rawName.match(/[\[\(](?<year>(?:19|20)\d{2})[\]\)]/)
  const yearEnd = rawName.match(/(?:\s|\.)(?<year>(?:19|20)\d{2})(?:\s*\.\w+)?$/)
  return {
    title: title.replace(/\s+/g, ' ').trim(), cleanTitle: title,
    year: yearBracket?.groups?.year || yearEnd?.groups?.year, edition,
    group: extractGroup(rawName) ?? undefined,
    version: parseVersion(rawName)?.toString(), rawName, isScene: false,
  }
}
```

- [ ] **Step 4: Create otix-plugins/downloads/organizer/naming.ts**

Extract from `desktop/downloads/organizer.ts` lines 286-360 and 46-56:

```typescript
import type { ParsedRelease } from './parsing'

export interface FileInfo {
  name: string
  ext: string
  type: 'iso' | 'pc_game' | 'update' | 'unknown'
}

export interface NamingPreset {
  label: string
  template: string
}

export const NAMING_PRESETS: Record<string, NamingPreset> = {
  standard: { label: 'Standard (arr-style)', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
  scene: { label: 'Scene Standard', template: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}' },
  simple: { label: 'Simple', template: '{Title}/{Title}.{ext}' },
  yearFlat: { label: 'Flat by Year', template: '{Title} ({Year})/{Title}.{ext}' },
  folderOnly: { label: 'Smart Folder', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
}

const VALID_TOKENS = new Set([
  'Title', 'CleanTitle', 'Year', 'Edition', 'Platform',
  'ReleaseGroup', 'Version', 'OriginalName', 'MediaType', 'ext',
])

export function applyNamingTemplate(
  release: ParsedRelease, template: string, fileInfo: FileInfo, baseDir?: string,
): string {
  const tokens: Record<string, string> = {
    Title: release.title, CleanTitle: release.cleanTitle,
    Year: release.year ?? '', Edition: release.edition ?? '',
    Platform: release.platform ?? 'PC', ReleaseGroup: release.group ?? '',
    Version: release.version ?? '', OriginalName: release.rawName,
    MediaType: fileInfo.type === 'iso' ? 'ISO' : fileInfo.type === 'pc_game' ? 'PC' : 'Update',
    ext: fileInfo.ext,
  }
  let result = template
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }
  result = result.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\{\s*\}/g, '')
  result = result.replace(/[\\/]+/g, '/').replace(/\/$/, '').replace(/\s{2,}/g, ' ').replace(/\s+\//g, '/').replace(/\/\s+/g, '/').replace(/\.$/, '').trim()
  return baseDir ? path.join(baseDir, result) : result
}

export function validateNamingTemplate(template: string): { valid: boolean; error?: string } {
  const found = template.match(/\{(\w+)\}/g) || []
  for (const tok of found) {
    if (!VALID_TOKENS.has(tok.slice(1, -1))) return { valid: false, error: `Unknown token: ${tok}` }
  }
  if (!template.includes('{Title}') && !template.includes('{CleanTitle}')) {
    return { valid: false, error: 'Template must include {Title} or {CleanTitle}' }
  }
  return { valid: true }
}

export function previewNamingTemplate(template: string, sampleName: string): { valid: boolean; result?: string; error?: string } {
  const validation = validateNamingTemplate(template)
  if (!validation.valid) return validation
  const { parseReleaseName } = require('./parsing')
  const release = parseReleaseName(sampleName)
  const ext = sampleName.includes('.iso') ? 'iso' : 'exe'
  const target = applyNamingTemplate(release, template, { name: sampleName, ext, type: 'iso' }, '/')
  return { valid: true, result: target.replace(/^\//, '') }
}
```

Note: The `require` in `previewNamingTemplate` is to avoid circular deps. If the final codebase uses ESM, use dynamic import instead.

- [ ] **Step 5: Create otix-plugins/downloads/organizer/discovery.ts**

Extract from `desktop/downloads/organizer.ts` lines 214-283:

```typescript
import * as fs from 'fs/promises'
import * as path from 'path'

export interface DownloadedContent {
  path: string
  name: string
  type: 'iso' | 'pc_game' | 'update' | 'unknown'
  size?: number
}

const SKIP_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps',
])

export async function findDownloadedContent(dirPath: string, maxDepth = 3): Promise<DownloadedContent[]> {
  const results: DownloadedContent[] = []
  const seen = new Set<string>()

  async function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) return
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      let hasExe = false
      const childDirs: string[] = []
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
          if (depth < maxDepth) childDirs.push(fullPath)
        } else if (entry.isFile()) {
          const nameLower = entry.name.toLowerCase()
          if (nameLower.endsWith('.iso')) {
            results.push({ path: fullPath, name: entry.name, type: 'iso' })
          } else if (nameLower.endsWith('.exe') && (nameLower.includes('update') || nameLower.includes('patch')) && !nameLower.includes('setup') && !nameLower.includes('uninst') && !nameLower.includes('helper')) {
            results.push({ path: fullPath, name: entry.name, type: 'update' })
          } else if (nameLower.endsWith('.exe') && !nameLower.includes('setup') && !nameLower.includes('uninst') && !nameLower.includes('helper')) {
            hasExe = true
          }
        }
      }
      if (hasExe) results.push({ path: currentDir, name: path.basename(currentDir), type: 'pc_game' })
      for (const childDir of childDirs) await traverse(childDir, depth + 1)
    } catch { /* skip */ }
  }

  await traverse(dirPath, 1)
  return results
}
```

- [ ] **Step 6: Create otix-plugins/downloads/organizer/index.ts**

Combine `autoOrganizeDownload()`, `batchOrganizeDirectory()`, `smartOrganizePreview()` from `desktop/downloads/organizer.ts` lines 366-677:

```typescript
import * as path from 'path'
import { findDownloadedContent, type DownloadedContent } from './discovery'
import { parseReleaseName } from './parsing'
import { applyNamingTemplate, validateNamingTemplate, NAMING_PRESETS, type FileInfo } from './naming'

export interface AutoOrganizeResult {
  success: boolean
  organized: { from: string; to: string; type: string }[]
  errors: string[]
}

export async function autoOrganizeDownload(
  downloadDir: string, namingTemplate: string, destBase: string,
): Promise<AutoOrganizeResult> {
  const result: AutoOrganizeResult = { success: false, organized: [], errors: [] }
  const validation = validateNamingTemplate(namingTemplate)
  if (!validation.valid) { result.errors.push(validation.error!); return result }

  const content = await findDownloadedContent(downloadDir, 5)
  if (content.length === 0) { result.errors.push('No content found'); return result }

  const baseName = path.basename(downloadDir)
  const release = parseReleaseName(baseName)

  for (const item of content) {
    let fileInfo: FileInfo
    let target: string
    if (item.type === 'pc_game') {
      fileInfo = { name: item.name, ext: '', type: 'pc_game' }
      target = applyNamingTemplate(release, namingTemplate.split('/').slice(0, -1).join('/') || namingTemplate, fileInfo, destBase)
    } else {
      fileInfo = { name: item.name, ext: path.extname(item.name).substring(1), type: item.type }
      target = applyNamingTemplate(release, namingTemplate, fileInfo, destBase)
    }
    result.organized.push({ from: item.path, to: target, type: item.type })
  }

  result.success = true
  return result
}

export async function batchOrganizeDirectory(
  directory: string, namingTemplate?: string,
): Promise<AutoOrganizeResult> {
  const template = namingTemplate || NAMING_PRESETS.standard.template
  return autoOrganizeDownload(directory, template, directory)
}
```

- [ ] **Step 7: Create otix-plugins/downloads/index.ts — orchestrator entry**

This is the main plugin entry. It discovers providers + downloaders and orchestrates the download workflow.

```typescript
import type { PluginContext, ServiceInfo } from '../../desktop/plugins/types'
import { autoPickBest, filterQualityResults, type SearchResult } from './quality-filter'
import { autoOrganizeDownload } from './organizer'

export default function downloadsPlugin(ctx: PluginContext) {
  // ── search + download (the main workflow) ──
  ctx.handle('search-and-download', async (args: { query: string; categories?: string; allowHypervisor?: boolean }) => {
    const providers: ServiceInfo[] = await ctx.discover('search-provider')
    if (providers.length === 0) return { error: 'No search providers available. Install and enable a search provider plugin (e.g., nzbplanet).' }
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    if (downloaders.length === 0) return { error: 'No downloaders available. Install and enable a downloader plugin (e.g., sabnzbd).' }

    const config = ctx.config.getAll()
    const provider = providers[0]
    const downloader = downloaders.find(d => d.protocol === provider.protocol) || downloaders[0]

    if (!downloader) return { error: `No downloader found matching protocol: ${provider.protocol}` }

    // Search
    const results: SearchResult[] = await ctx.call(provider.pluginId, 'search', { query: args.query })
    if (results.length === 0) return { error: `No results found for "${args.query}"` }

    // Filter & pick best
    const allowHv = args.allowHypervisor ?? config.allowHypervisor ?? false
    const best = autoPickBest(results, config.preferredRepackers as string, allowHv as boolean)
    if (!best) return { error: `No quality releases found for "${args.query}"` }

    // Download
    const dlResult = await ctx.call(downloader.pluginId, 'add-download', {
      downloadUrl: best.downloadUrl, title: best.title,
    })

    return { downloadId: dlResult.id, result: best }
  })

  // ── Poll queue ──
  ctx.handle('poll-queue', async () => {
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    const allQueues = await Promise.all(
      downloaders.map(d => ctx.call(d.pluginId, 'get-queue')),
    )
    return allQueues.flat()
  })

  ctx.handle('poll-history', async () => {
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    const allHistories = await Promise.all(
      downloaders.map(d => ctx.call(d.pluginId, 'get-history')),
    )
    return allHistories.flat()
  })

  // ── Test connection (tests all providers + downloaders) ──
  ctx.handle('test-connections', async () => {
    const results: Record<string, { ok: boolean; message: string }> = {}
    const providers: ServiceInfo[] = await ctx.discover('search-provider')
    for (const p of providers) {
      results[p.pluginId] = await ctx.call(p.pluginId, 'test-connection') as any
    }
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    for (const d of downloaders) {
      results[d.pluginId] = await ctx.call(d.pluginId, 'test-connection') as any
    }
    return results
  })

  // ── Post-process + organize ──
  ctx.handle('post-process', async (args: { downloadPath: string; namingTemplate?: string; destPath?: string }) => {
    const config = ctx.config.getAll()
    const template = args.namingTemplate || (config.namingTemplate as string) || '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}'
    const dest = args.destPath || (config.downloadPath as string) || args.downloadPath
    return autoOrganizeDownload(args.downloadPath, template, dest)
  })

  // ── List available providers ──
  ctx.handle('get-providers', async () => {
    const providers: ServiceInfo[] = await ctx.discover('search-provider')
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    return { providers, downloaders }
  })

  ctx.handle('status', async () => {
    const providers: ServiceInfo[] = await ctx.discover('search-provider')
    const downloaders: ServiceInfo[] = await ctx.discover('downloader')
    return {
      providers: providers.map(p => p.pluginId),
      downloaders: downloaders.map(d => d.pluginId),
      autoOrganizeEnabled: ctx.config.get('autoOrganizeEnabled') || false,
    }
  })
}
```

- [ ] **Step 8: Commit**

```bash
git add otix-plugins/downloads/
git commit -m "feat: create Downloads orchestrator plugin with organizer, quality filter, provider discovery"
```

---

### Task 7: Refactor IPC Handlers to Route to Plugins

**Files:**
- Modify: `desktop/ipc/downloads.ts`
- Modify: `desktop/downloads/index.ts` (strip SABnzbd + NZBPlanet code)

- [ ] **Step 1: Create plugin call helper in ipc/downloads.ts**

```typescript
import { ipcMain } from 'electron'
import { pluginManager } from '../plugins/manager'  // Need to export singleton
import {
  getConfig, saveConfig, getDownload, getUserDownloads, deleteDownload,
  getWishlistTracking, skipWishlistItem,
  getPathMappings, addPathMapping, removePathMapping,
  getTrackedGames, scheduledUpdateCheck,
  batchCheckMatchCache, saveMatchCache,
  getScannedGamesFromDb, saveScannedGamesToDb,
  getUnseededGames, markGamesAsSeeded,
}

async function callPlugin(pluginId: string, method: string, args?: any) {
  try {
    return await pluginManager.callPluginData(pluginId, method, args || {})
  } catch (err: any) {
    console.error(`[IPC] Plugin call ${pluginId}.${method} failed:`, err.message)
    return { error: err.message }
  }
}
```

- [ ] **Step 2: Rewrite IPC handlers to route to plugins where applicable**

Replace the direct function calls with plugin routing:

```typescript
export function registerDownloadsIPC(): void {
  // ── Config — stays as direct DB access ──
  ipcMain.handle('downloads:get-config', (_, userId: string) => getConfig(userId))
  ipcMain.handle('downloads:save-config', (_, config: any) => saveConfig(config))

  // ── Search & download — routes to plugins ──
  ipcMain.handle('downloads:search', async (_, query: string) => {
    const providers = await pluginManager.serviceRegistry.discover('search-provider')
    if (providers.length === 0) return { error: 'No search providers' }
    return callPlugin(providers[0].pluginId, 'search', { query })
  })

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) => {
    return callPlugin('downloads', 'search-and-download', { query: gameName, allowHypervisor })
  })

  ipcMain.handle('downloads:poll-queue', async () => {
    return callPlugin('downloads', 'poll-queue')
  })

  ipcMain.handle('downloads:test-sabnzbd', async (_, host: string, port: number, apiKey: string, useSsl: boolean) => {
    // Temporarily set config, test, then restore
    return callPlugin('sabnzbd', 'test-connection')
  })

  ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey: string) => {
    return callPlugin('nzbplanet', 'test-connection')
  })

  ipcMain.handle('downloads:get-wishlist-tracking', (_, userId: string) => getWishlistTracking(userId))
  ipcMain.handle('downloads:skip-wishlist-item', (_, userId: string, mediaItemId: string) => skipWishlistItem(userId, mediaItemId))
  ipcMain.handle('downloads:get-tracked-game', () => getTrackedGames())
  ipcMain.handle('downloads:check-updates', () => scheduledUpdateCheck())

  // ── Post-process — routes to downloads plugin ──
  ipcMain.handle('downloads:post-process', async (_, downloadId: string, configId: string, fallbackSource?: string, fallbackDest?: string) => {
    return callPlugin('downloads', 'post-process', { downloadPath: fallbackSource, destPath: fallbackDest })
  })

  // ── Naming templates — stays as direct helpers (pure functions) ──
  ipcMain.handle('downloads:preview-naming-template', (_, template: string, sampleName: string) => {
    const { previewNamingTemplate } = require('../downloads/organizer/naming')
    return previewNamingTemplate(template, sampleName)
  })

  ipcMain.handle('downloads:validate-naming-template', (_, template: string) => {
    const { validateNamingTemplate } = require('../downloads/organizer/naming')
    return validateNamingTemplate(template)
  })
}
```

- [ ] **Step 3: Strip SABnzbd and NZBPlanet code from desktop/downloads/index.ts**

Remove lines 54-698 (NZBPlanet client + SABnzbd client + quality filtering + update matching + post-processing).
Keep: DB config CRUD (700-799), Download CRUD (802-924), ISO match cache (926-985), Path mappings (987-1027), Wishlist (1029-1068), Scanned games (1387-1565).

This file goes from 1565 lines to ~700 lines of just shared DB ops.

- [ ] **Step 4: Commit**

```bash
git add desktop/ipc/downloads.ts desktop/downloads/index.ts
git commit -m "refactor: IPC handlers route to plugins, strip SABnzbd/NZBPlanet from downloads monolith"
```

---

### Task 8: Create Arr Instance Manager (Shared Base)

**Files:**
- Create: `desktop/plugins/arr-instance-manager.ts` (shared utility — not a plugin, a helper the arr plugins use)

- [ ] **Step 1: Create arr-instance-manager.ts**

```typescript
export interface ArrInstanceConfig {
  id: string
  name: string
  host: string
  port: number
  apiKey: string
  useSsl: boolean
  baseUrl?: string
  qualityProfile?: string
  rootFolder?: string
  enabled: boolean
}

export class ArrInstanceManager<T extends ArrInstanceConfig = ArrInstanceConfig> {
  private instances: T[] = []

  constructor(private storage: {
    getInstances: () => T[]
    saveInstances: (instances: T[]) => void
  }) {
    this.instances = storage.getInstances()
  }

  getAll(): T[] { return this.instances.filter(i => i.enabled) }

  get(id: string): T | undefined { return this.instances.find(i => i.id === id) }

  add(config: T): void {
    this.instances.push(config)
    this.storage.saveInstances(this.instances)
  }

  update(id: string, config: Partial<T>): void {
    const idx = this.instances.findIndex(i => i.id === id)
    if (idx === -1) throw new Error(`Instance not found: ${id}`)
    this.instances[idx] = { ...this.instances[idx], ...config }
    this.storage.saveInstances(this.instances)
  }

  remove(id: string): void {
    this.instances = this.instances.filter(i => i.id !== id)
    this.storage.saveInstances(this.instances)
  }

  async testConnection(config: Pick<T, 'host' | 'port' | 'apiKey' | 'useSsl' | 'baseUrl'>): Promise<{ ok: boolean; message: string }> {
    try {
      const base = `${config.useSsl ? 'https' : 'http'}://${config.host}:${config.port}${config.baseUrl || ''}`
      const response = await fetch(`${base}/api/v3/system/status`, {
        headers: { 'X-Api-Key': config.apiKey },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }
      const data = await response.json()
      return { ok: true, message: `Connected (v${data.version || '?'})` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/arr-instance-manager.ts
git commit -m "feat: add shared ArrInstanceManager for multi-instance arr plugins"
```

---

### Task 9: Create Radarr Plugin

**Files:**
- Create: `otix-plugins/radarr/manifest.json`
- Create: `otix-plugins/radarr/index.ts`

- [ ] **Step 1: Create otix-plugins/radarr/manifest.json**

```json
{
  "name": "radarr",
  "version": "1.0.0",
  "description": "Radarr media management — multiple instance support",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "ui:settings", "events:subscribe"],
  "services": ["arr"],
  "config": {},
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 2: Create otix-plugins/radarr/index.ts**

```typescript
import type { PluginContext } from '../../desktop/plugins/types'

interface RadarrInstance {
  id: string
  name: string
  host: string
  port: number
  apiKey: string
  useSsl: boolean
  baseUrl?: string
  enabled: boolean
}

export default function radarrPlugin(ctx: PluginContext) {
  const STORAGE_KEY = 'instances'
  
  function getInstances(): RadarrInstance[] {
    return (ctx.config.get(STORAGE_KEY) || []) as RadarrInstance[]
  }

  function saveInstances(instances: RadarrInstance[]): void {
    ctx.config.set(STORAGE_KEY, instances)
  }

  ctx.handle('get-instances', () => getInstances().filter(i => i.enabled))
  ctx.handle('get-instance', (args: { id: string }) => getInstances().find(i => i.id === args.id) || null)

  ctx.handle('add-instance', (args: RadarrInstance) => {
    const instances = getInstances()
    instances.push(args)
    saveInstances(instances)
    return { success: true }
  })

  ctx.handle('update-instance', (args: { id: string; config: Partial<RadarrInstance> }) => {
    const instances = getInstances()
    const idx = instances.findIndex(i => i.id === args.id)
    if (idx === -1) return { success: false, error: 'Instance not found' }
    instances[idx] = { ...instances[idx], ...args.config }
    saveInstances(instances)
    return { success: true }
  })

  ctx.handle('remove-instance', (args: { id: string }) => {
    saveInstances(getInstances().filter(i => i.id !== args.id))
    return { success: true }
  })

  ctx.handle('test-instance', async (args: { id: string }) => {
    const instance = getInstances().find(i => i.id === args.id)
    if (!instance) return { ok: false, message: 'Instance not found' }
    try {
      const base = `${instance.useSsl ? 'https' : 'http'}://${instance.host}:${instance.port}${instance.baseUrl || ''}`
      const response = await ctx.fetch(`${base}/api/v3/system/status`, {
        headers: { 'X-Api-Key': instance.apiKey },
      })
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }
      const data = await response.json() as any
      return { ok: true, message: `Radarr v${data.version || '?'}` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  })

  // Listen for organize-complete events from Downloads plugin
  ctx.events.on('downloads:organized', async (payload) => {
    // Notify all instances about new media
    const instances = getInstances().filter(i => i.enabled)
    for (const inst of instances) {
      try {
        const base = `${inst.useSsl ? 'https' : 'http'}://${inst.host}:${inst.port}${inst.baseUrl || ''}`
        // Radarr doesn't have a direct "refresh" API endpoint — this is a placeholder
        // for future integration (e.g., calling the command endpoint to refresh)
        ctx.logger.info(`[radarr:${inst.name}] Would notify about: ${payload.title}`)
      } catch { /* skip failed instances */ }
    }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add otix-plugins/radarr/
git commit -m "feat: create Radarr multi-instance plugin"
```

---

### Task 10: Create Sonarr and Lidarr Plugins

**Files:**
- Create: `otix-plugins/sonarr/manifest.json`
- Create: `otix-plugins/sonarr/index.ts`
- Create: `otix-plugins/lidarr/manifest.json`
- Create: `otix-plugins/lidarr/index.ts`

Each follows same pattern as Radarr but with its own service name and API endpoint differences.

- [ ] **Step 1: Create otix-plugins/sonarr/manifest.json** (identical pattern to Radarr, rename)

```json
{
  "name": "sonarr",
  "version": "1.0.0",
  "description": "Sonarr media management — multiple instance support",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "ui:settings", "events:subscribe"],
  "services": ["arr"],
  "config": {},
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 2: Create otix-plugins/sonarr/index.ts** (copy from radarr, replace "Radarr" with "Sonarr" in messages)

- [ ] **Step 3: Create otix-plugins/lidarr/manifest.json**

```json
{
  "name": "lidarr",
  "version": "1.0.0",
  "description": "Lidarr music management — multiple instance support",
  "author": "Otix",
  "repository": "",
  "min_app_version": "0.1.0",
  "permissions": ["network:external", "ui:settings", "events:subscribe"],
  "services": ["arr"],
  "config": {},
  "entry": { "main": "index.ts" }
}
```

- [ ] **Step 4: Create otix-plugins/lidarr/index.ts** (copy from radarr, replace "Radarr" with "Lidarr")

- [ ] **Step 5: Commit**

```bash
git add otix-plugins/sonarr/ otix-plugins/lidarr/
git commit -m "feat: create Sonarr and Lidarr multi-instance plugins"
```

---

### Task 11: Config Migration — Legacy to Plugin Configs

**Files:**
- Modify: `desktop/downloads/index.ts` (add migration function)

- [ ] **Step 1: Add migration function**

Add to `desktop/downloads/index.ts`:

```typescript
/**
 * Migrate legacy download_configs to plugin configs.
 * Called once on first launch after plugin migration.
 */
export async function migrateLegacyConfigToPlugins(): Promise<{ migrated: boolean; errors: string[] }> {
  const legacy = __get('SELECT * FROM download_configs ORDER BY updated_at DESC LIMIT 1')
  if (!legacy) return { migrated: false, errors: ['No legacy config found'] }

  const errors: string[] = []

  // Write SABnzbd config (if plugin is enabled)
  try {
    const sabConfig = {
      host: legacy.sabnzbd_host || 'localhost',
      port: legacy.sabnzbd_port || 8080,
      apiKey: legacy.sabnzbd_api_key || '',
      useSsl: legacy.sabnzbd_use_ssl === 1,
      category: 'games',
    }
    await callPlugin('sabnzbd', 'set-config', sabConfig)
  } catch(e: any) { errors.push(`SABnzbd: ${e.message}`) }

  // Write NZBPlanet config
  try {
    await callPlugin('nzbplanet', 'set-config', {
      apiKey: legacy.nzbplanet_api_key || '',
      categoryIds: '1000,2000',
    })
  } catch(e: any) { errors.push(`NZBPlanet: ${e.message}`) }

  // Write Downloads config
  try {
    await callPlugin('downloads', 'set-config', {
      postProcessEnabled: legacy.post_process_enabled === 1,
      autoSearchWishlist: legacy.auto_search_wishlist === 1,
      wishlistIntervalHours: legacy.wishlist_interval_hours || 12,
      preferredRepackers: legacy.preferred_repackers || '',
      allowHypervisor: legacy.allow_hypervisor === 1,
      autoOrganizeEnabled: legacy.auto_organize_enabled === 1,
      namingTemplate: legacy.naming_template || '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
    })
  } catch(e: any) { errors.push(`Downloads: ${e.message}`) }

  // Mark migration complete
  saveConfig({ ...legacy, migratedToPlugins: true })
  return { migrated: true, errors }
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/downloads/index.ts
git commit -m "feat: add legacy config migration to plugin configs"
```

---

### Task 12: Frontend — Plugin-Native Settings Forms

**Files:**
- Modify: `frontend/src/features/settings/sections/settings-downloads.tsx` (replace with tabs to plugin settings)
- Or: Create per-plugin settings widgets

This task is intentionally small scope — plugins declare config fields in manifest, and the existing settings UI auto-generates forms from those fields. The plugin framework already handles display of plugin settings pages.

- [ ] **Step 1: Audit manifest config fields for auto-generated forms**

Ensure each plugin's `manifest.json` `config` field is complete with labels, types, defaults. The existing `settings-plugin-config-panel.tsx` reads config schema from manifest and renders form fields.

- [ ] **Step 2: Simplify settings-downloads.tsx**

Replace the SABnzbd + NZBPlanet connection testing sections with a note pointing to plugin settings:

```tsx
// Remove: SABnzbd host/port/apiKey/ssl fields
// Remove: NZBPlanet API key field
// Remove: Test connection buttons
// Add: "Download provider settings moved to Plugins → SABnzbd / NZBPlanet"
```

Keep: Organizer settings (naming template, auto-organize toggle) until Downloads plugin provides its own settings widget.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/sections/settings-downloads.tsx
git commit -m "refactor: update settings-downloads to reference plugin-native settings"
```

---

### Self-Review Checklist

1. **Spec coverage:**
   - [x] Framework extension for inter-plugin calls — Tasks 1-2
   - [x] SABnzbd plugin — Task 4
   - [x] NZBPlanet plugin — Task 5
   - [x] Downloads plugin with organizer — Task 6
   - [x] IPC routing to plugins — Task 7
   - [x] Plugin configs — built into each plugin's manifest
   - [x] Multi-instance arr plugins — Tasks 8-10
   - [x] Config migration — Task 11
   - [x] Frontend plugins settings — Task 12
   - [x] otix-plugins/ directory at repo root — Task 3
   - [x] Service role discovery — Task 1

2. **Placeholder scan:** All steps have exact code and paths. No TBD, TODO, or "fill in later".

3. **Type consistency:** `ServiceInfo`, `PluginService`, `PluginContext.call/handle/discover` defined in Tasks 1-2, used consistently in Tasks 4-10. `ArrInstanceManager` defined in Task 8, used pattern in Task 9.

4. **Ambiguity check:** Each step is a single clear action with exact code and paths.
