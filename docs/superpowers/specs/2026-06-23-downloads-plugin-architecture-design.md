# Downloads Plugin Architecture

**Date:** 2026-06-23
**Status:** Draft

## Overview

Refactor monolithic `desktop/downloads/` into isolated worker-thread plugins under `otix-plugins/`. Each plugin lives in its own directory, runs in its own worker thread, and communicates with other plugins via an extended event bus with request/reply routing. The plugin framework is extended incrementally to support worker-to-worker calls.

## Directory Structure

```
otix-plugins/
  sabnzbd/               ← Usenet downloader
  nzbplanet/             ← Usenet search provider
  downloads/             ← Orchestrator + organizer
  radarr/                ← Multi-instance arr integration
  sonarr/                ← Multi-instance arr integration
  lidarr/                ← Multi-instance arr integration
```

Each plugin is a real `desktop/plugins/` worker-thread plugin with `manifest.json` and entry point.

## Service Types & Protocol

### Service Roles

| Role | What It Does | Examples |
|------|-------------|---------|
| `downloader` | Receives download requests, downloads files, reports status | SABnzbd (usenet), qBittorrent (torrent) |
| `search-provider` | Searches for content, returns normalized results | NZBPlanet (usenet), Jackett/Prowlarr (torrent) |
| `arr` | Media management, imports completed downloads | Radarr, Sonarr, Lidarr |
| `downloads-orchestrator` | Coordinates downloaders + providers + post-processing | Downloads plugin |

### Protocol Tagging

Manifest declares service type + protocol:

```json
"services": [
  { "type": "downloader", "protocol": "usenet" },
  { "type": "search-provider", "protocol": "usenet" }
]
```

Downloads plugin discovers by role, routes by protocol.

### Standard Interfaces

All download plugins adapt their native API to these normalized types at their boundary:

```typescript
interface SearchResult {
  id: string
  title: string
  size: number
  pubDate: string
  ageDays: number
  category: string
  downloadUrl: string       // NZB URL, magnet, or torrent URL
  infoUrl: string
  source: string            // plugin id
  isScene?: boolean
  group?: string
  seeders?: number
  raw: Record<string, any>
}

interface SearchProvider {
  search(query: string, categories?: string[]): Promise<SearchResult[]>
  testConnection(): Promise<{ ok: boolean; message?: string }>
  searchByImdb?(imdbId: string): Promise<SearchResult[]>
  searchByTvdb?(tvdbId: string): Promise<SearchResult[]>
}

interface DownloadRequest {
  downloadUrl: string
  title: string
  category?: string
  size?: number
  savePath?: string
  priority?: 'normal' | 'high' | 'low'
}

interface DownloadStatus {
  id: string
  title: string
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'removed'
  percentage: number
  size: number
  downloaded: number
  speed?: number
  eta?: number
  errorMessage?: string
  seeders?: number
  nzoId?: string
}

interface Downloader {
  addDownload(req: DownloadRequest): Promise<{ id: string }>
  getQueue(): Promise<DownloadStatus[]>
  getHistory(): Promise<DownloadStatus[]>
  removeDownload(id: string): Promise<void>
  pauseDownload?(id: string): Promise<void>
  resumeDownload?(id: string): Promise<void>
  testConnection(): Promise<{ ok: boolean; message?: string }>
}
```

Framework validates plugin's exported methods match its declared service type at load time.

## Inter-Plugin Communication

### Event Bus Extension

Current: in-process pub/sub, main process only.

Extended: worker-to-worker routing with request/reply via main-process bridge.

### PluginContext Primitives

```typescript
// Call another plugin, await response
plugin.call(targetId: string, method: string, args?: any): Promise<any>

// Register handler for incoming plugin calls
plugin.handle(method: string, handler: (args: any) => Promise<any>): void

// Fire-and-forget event to other plugins
plugin.emit(event: string, data?: any): void

// Listen for events from other plugins
plugin.on(event: string, handler: (data: any) => void): void

// Discover plugins by service role
plugin.discover(service: string): Promise<PluginService[]>
// → { id: string, protocol: string, methods: string[] }
```

### Flow

```
Plugin A Worker          Main Process              Plugin B Worker
     │                        │                         │
     │── call('B', 'fn') ────>│                         │
     │                        │── bridge.send() ───────>│
     │                        │                         │── handler('fn')
     │                        │<── result ─────────────│
     │<── result ────────────│                         │
```

### Discovery

Plugin manager tracks all enabled plugins + their declared services + methods. `discover('downloader')` returns all plugins registered with that service role. Downloads plugin never references SABnzbd or qBittorrent by name — it always discovers by role.

## Code Migration

### From `desktop/downloads/index.ts`

Current monolith (1565 lines) splits:

| Component | Lines | New Home |
|-----------|-------|----------|
| SABnzbd API client (testConnection, addNzb, queue, history) | ~120 | `otix-plugins/sabnzbd/sabnzbd-client.ts` |
| SABnzbd types | ~30 | `otix-plugins/sabnzbd/types.ts` |
| NZBPlanet API client (search, testConnection) | ~80 | `otix-plugins/nzbplanet/nzbplanet-client.ts` |
| NZBPlanet types | ~15 | `otix-plugins/nzbplanet/types.ts` |
| Quality filtering (filterQualityResults, autoPickBest, scene tags) | ~150 | `otix-plugins/downloads/quality-filter.ts` |
| Download CRUD (create, get, update, delete) | ~150 | Stays in main process DB, accessed via IPC |
| searchAndDownload orchestration | ~100 | `otix-plugins/downloads/index.ts` |
| pollAndUpdateDownloads | ~80 | `otix-plugins/downloads/index.ts` |
| postProcessDownload | ~60 | `otix-plugins/downloads/index.ts` |
| Wishlist tracking | ~100 | `otix-plugins/downloads/wishlist.ts` |
| Path mappings | ~40 | `otix-plugins/downloads/path-mappings.ts` |
| Game update tracking | ~120 | `otix-plugins/downloads/update-tracker.ts` |
| ISO match cache | ~40 | Stays in main process (shared with scanner) |
| Scanned games + seed tracking | ~60 | Stays in main process (shared with scanner) |

### From `desktop/downloads/organizer.ts`

Current (678 lines) moves entirely into Downloads plugin:

| Component | New Home |
|-----------|----------|
| parseReleaseName | `downloads/organizer/parsing.ts` |
| findDownloadedContent | `downloads/organizer/discovery.ts` |
| applyNamingTemplate | `downloads/organizer/naming.ts` |
| NAMING_PRESETS | `downloads/organizer/naming.ts` |
| autoOrganizeDownload, batchOrganizeDirectory, smartOrganizePreview | `downloads/organizer/index.ts` |

### From `desktop/ipc/downloads.ts`

IPC handlers become thin routers:

| Handler | Routes To |
|---------|-----------|
| `downloads:test-sabnzbd` | → sabnzbd plugin via `callPlugin('sabnzbd', 'test-connection')` |
| `downloads:test-nzbplanet` | → nzbplanet plugin via `callPlugin('nzbplanet', 'test-connection')` |
| `downloads:search` | → configured search provider |
| `downloads:search-and-download` | → downloads plugin orchestrator |
| `downloads:poll-queue` | → downloads plugin (which aggregates all downloaders) |
| `downloads:post-process` | → downloads plugin |
| Download CRUD, path-mappings, wishlist, updates | → Direct DB access (main process) |

### Plugin Configs

Plugin configs replace `download_configs` for per-service settings:

```
Legacy download_configs fields:
  sabnzbd_host, _port, _api_key, _use_ssl  →  sabnzbd plugin config
  nzbplanet_api_key                         →  nzbplanet plugin config
  naming_template, auto_organize, etc.      →  downloads plugin config
```

Existing config migrated on first launch after plugin install.

## Arr Plugins (Multi-Instance)

### Architecture

Each arr plugin manages N server instances. One `ArrInstanceManager` class per plugin:

```typescript
interface ArrInstanceConfig {
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
```

Plugin exports instance CRUD handlers:

```typescript
plugin.handle('get-instances', ...)
plugin.handle('add-instance', ...)
plugin.handle('remove-instance', ...)
plugin.handle('test-instance', ...)
```

### Interaction with Downloads Plugin

- Arr plugin emits `arr:media-imported` when media is imported
- Downloads plugin emits `downloads:organized` when post-process completes
- Arr plugins listen, notify instances to refresh/import

Radarr, Sonarr, Lidarr share identical multi-instance pattern internally. Each has its own API client that adapts to the framework's normalized interfaces.

## Frontend Changes

| Area | Change |
|------|--------|
| Settings > Downloads | Split into per-plugin settings pages (auto-generated from manifest or custom React widget) |
| Activity panel | Polls downloads plugin for aggregated queue (still same component) |
| Media download button | Unchanged — still calls `downloads:search-and-download` |
| Plugin settings | Each plugin contributes settings fields via manifest or slot |

Frontend impact is minimal. Most changes are slot-driven.

## Migration Plan

1. Extend plugin framework with inter-plugin call/discover primitives
2. Create SABnzbd plugin — extract client from monolith
3. Create NZBPlanet plugin — extract client from monolith
4. Create Downloads plugin — move orchestrator + organizer, connect to providers via discovery
5. Create Radarr/Sonarr/Lidarr plugins — multi-instance arr wrappers
6. Add migration for existing config to plugin configs
7. Refactor IPC handlers to route to plugins
8. Update frontend settings to use plugin-native forms

Implementation order: framework first → sabnzbd + nzbplanet (no deps) → downloads (depends on providers) → arr plugins (depends on framework).

## Non-Goals

- Not refactoring scanning/matching system
- Not removing old IPC handlers until migration complete
- Not splitting frontend download UI into independent per-plugin UIs
- Not adding new provider/downloader types (Jackett, qBittorrent) — these become easy to add later via the same interface
