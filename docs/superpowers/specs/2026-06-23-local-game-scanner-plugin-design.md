# Local Game Scanner Plugin Design

**Date**: 2026-06-23
**Status**: Draft
**Author**: Otix

## Overview

Convert the hardcoded local game scanning system (directory scanner + 8 launcher scanners) into the plugin system. This replaces `desktop/game/scanner.ts` and `desktop/game/launchers.ts` with worker-isolated plugins that use a new `worker:filesystem` permission for filesystem access.

## Motivation

- **Consistency**: All game scanning goes through the same `matching:scan` plugin slot
- **Isolation**: Scanner logic runs in worker threads, can't crash main process
- **Extensibility**: New platform scanners are plugins — no core code changes
- **Configuration**: Per-plugin config stored in `plugin_config` table, not ad-hoc gameService

## Scope

| Phase | Plugin | Replaces | Effort |
|-------|--------|----------|--------|
| P1 | Infrastructure | — | medium |
| P2 | `local-files` | `scanner.ts` | medium |
| P3+ | 8 launcher plugins | `launchers.ts` | large (per-platform) |

This document covers P1 (infrastructure) and P2 (directory scanner plugin) in detail. Launcher plugins follow the same pattern per platform.

## Architecture

```
Frontend
  → IPC: scanner:scan-paths / scanner:scan-all-plugins
    → GameScanOrchestrator.scanAll()
      → SlotRegistry.getPluginsForSlot('matching:scan')
        → finds local-files (and launcher plugins)
      → PluginRuntime.callMethod('scan')  [per plugin]
        → Worker: scan() runs
          → ctx.filesystem.readdir()     [RPC to bridge]
          → ctx.filesystem.readFile()    [RPC to bridge]
          → ctx.filesystem.stat()        [RPC to bridge]
          → ctx.app.getFileIcon()        [RPC to bridge]
          → ctx.host.emit()              [progress events]
        → Returns ScannedGame[]
      → Orchestrator splits matched/unmatched
      → Unmatched → SSE matching pipeline
```

### File Changes

| File | Change |
|------|--------|
| `desktop/plugins/types.ts` | Add `worker:filesystem` permission, extend `PluginContext` |
| `desktop/plugins/worker.ts` | Add `ctx.filesystem`, `ctx.app`, `ctx.host` proxies |
| `desktop/plugins/worker-bridge.ts` | Add RPC handlers for filesystem/app operations |
| `desktop/game/orchestrator.ts` | Minor: remove hardcoded launcher calling logic |
| `desktop/ipc/scanner.ts` | Delegate scan-paths to plugin system |
| `desktop/game/scanner.ts` | Remove (logic moves to plugin) |
| `desktop/game/launchers.ts` | Remove (logic moves to plugins) |
| `extensions/otix-plugins/plugins/local-files/` | New plugin directory |
| `frontend/...` | May need minor wiring updates |

## New Permission: `worker:filesystem`

### Type Definition

```typescript
// In PluginPermission union (desktop/plugins/types.ts)
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
  | 'worker:filesystem'   // NEW
```

### PluginContext Extensions

```typescript
// In PluginContext interface
export interface PluginContext {
  // ... existing fields
  filesystem: PluginFilesystem
  app: PluginApp
  host: PluginHost
}

export interface PluginFilesystem {
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<FsEntry[]>
  readFile(path: string, encoding?: string): Promise<string>
  stat(path: string): Promise<FsStat>
  access(path: string): Promise<boolean>
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

export interface PluginApp {
  getFileIcon(path: string, size?: 'small' | 'large'): Promise<string | null>
}

export interface PluginHost {
  emit(event: string, data: unknown): void
}
```

### Worker Context Proxy (worker.ts)

```javascript
filesystem: {
  readdir: (path, opts) => rpc('filesystem.readdir', path, opts),
  readFile: (path, encoding) => rpc('filesystem.readFile', path, encoding),
  stat: (path) => rpc('filesystem.stat', path),
  access: (path) => rpc('filesystem.access', path),
},
app: {
  getFileIcon: (path, size) => rpc('app.getFileIcon', path, size),
},
host: {
  emit: (event, data) => { rpc('host.emit', event, data); return undefined; },
}
```

### Bridge Handlers (worker-bridge.ts)

```typescript
// In GATED_METHODS
'filesystem.readdir': 'worker:filesystem',
'filesystem.readFile': 'worker:filesystem',
'filesystem.stat': 'worker:filesystem',
'filesystem.access': 'worker:filesystem',
'app.getFileIcon': 'worker:filesystem',
'host.emit': '' as any,   // no permission gate

// In executeMethod switch
case 'filesystem.readdir': {
  const [dirPath] = args as [string]
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    isDirectory: e.isDirectory(),
    isFile: e.isFile(),
    isSymbolicLink: e.isSymbolicLink(),
  }))
}
case 'filesystem.readFile': {
  const [filePath, encoding] = args as [string, string?]
  return await fs.readFile(filePath, encoding || 'utf-8')
}
case 'filesystem.stat': {
  const [filePath] = args as [string]
  const s = await fs.stat(filePath)
  return { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory(), isFile: s.isFile() }
}
case 'filesystem.access': {
  const [filePath] = args as [string]
  try { await fs.access(filePath); return true }
  catch { return false }
}
case 'app.getFileIcon': {
  const [filePath, size] = args as [string, 'small' | 'large' | undefined]
  const icon = await app.getFileIcon(filePath, { size: size || 'large' })
  return icon.toDataURL()
}
case 'host.emit': {
  const [event, data] = args as [string, unknown]
  eventBus.emit(event, data)
  return undefined
}
```

### Path Resolution

All filesystem paths are resolved relative to the current working directory on the main process side. The worker never sees raw filesystem handles — only strings. Path traversal attacks are mitigated by:
1. Paths are resolved via `path.resolve()` before use
2. Paths outside allowed base directories could be rejected if needed in future
3. Permission grant requires user consent

## Plugin: `local-files` (Directory Scanner)

### Manifest

```json
{
  "name": "Local Files Scanner",
  "version": "1.0.0",
  "description": "Scan local directories for Steam, PC, and ISO games",
  "author": "Otix",
  "repository": "builtin",
  "min_app_version": "1.0.0",
  "permissions": ["worker:filesystem", "storage:local"],
  "config": {
    "scanDirectories": {
      "type": "list",
      "label": "Scan Directories",
      "description": "Directories to scan for game executables and Steam manifests"
    },
    "isoDirectories": {
      "type": "list",
      "label": "ISO Directories",
      "description": "Directories to scan for ISO game files"
    }
  },
  "slots": [
    { "location": "matching:scan", "label": "Local Files" }
  ],
  "settings": {
    "tabs": [
      {
        "id": "scan-paths",
        "label": "Scan Paths",
        "icon": "folder",
        "path": "/settings/game-matching",
        "sections": [
          { "id": "scan-paths", "label": "Scan Paths", "slot": "matching:scan" }
        ]
      }
    ]
  },
  "entry": { "main": "main.js" }
}
```

### Plugin Exports

```javascript
// main.js — runs in worker thread with ctx.filesystem, ctx.app, ctx.host

module.exports = {
  /**
   * Entry point. Called once on plugin load.
   * Registers event listeners, starts periodic scan watcher if configured.
   */
  plugin: (ctx) => {
    ctx.logger.info('Local Files Scanner loaded');
    // Could set up fs watchers via event polling
    // ctx.onDestroy(() => { cleanup code here });
  },

  data: {
    /**
     * Main scan function. Walks configured directories and returns games.
     * Called by orchestrator via matching:scan slot.
     */
    scan: async (ctx) => {
      const scanDirs = ctx.config.get('scanDirectories') || [];
      const isoDirs = ctx.config.get('isoDirectories') || [];
      const allGames = [];
      let totalSteps = scanDirs.length + isoDirs.length;
      let completed = 0;

      for (const dir of scanDirs) {
        ctx.host.emit('scan:progress', { currentDir: dir, progress: Math.round((completed / totalSteps) * 100) });
        const games = await scanPath(ctx, dir);
        allGames.push(...games);
        completed++;
      }

      for (const dir of isoDirs) {
        ctx.host.emit('scan:progress', { currentDir: dir, progress: Math.round((completed / totalSteps) * 100) });
        const games = await scanIsoPath(ctx, dir);
        allGames.push(...games);
        completed++;
      }

      ctx.host.emit('scan:progress', { currentDir: 'Done', progress: 100 });
      return { games: deduplicate(allGames) };
    },

    'scan.status': async (ctx) => {
      // Returns current scan status object tracked in module-level variable
      // { phase: 'idle' | 'scanning' | 'done' | 'error', currentDir, progress, startedAt, totalGames? }
    }
  },

  /**
   * Connection status shown in plugin list.
   */
  status: async (ctx) => {
    const dirs = ctx.config.get('scanDirectories') || [];
    const isoDirs = ctx.config.get('isoDirectories') || [];
    return {
      connected: dirs.length > 0 || isoDirs.length > 0,
      scanDirectories: dirs.length,
      isoDirectories: isoDirs.length,
    };
  },

  /**
   * Test that configured paths exist.
   */
  test: async (ctx, configDraft) => {
    const dirs = configDraft?.scanDirectories || ctx.config.get('scanDirectories') || [];
    const isoDirs = configDraft?.isoDirectories || ctx.config.get('isoDirectories') || [];
    const errors = [];
    for (const d of [...dirs, ...isoDirs]) {
      const exists = await ctx.filesystem.access(d);
      if (!exists) errors.push(`Path not found: ${d}`);
    }
    return { success: errors.length === 0, message: errors.join('; ') || 'All paths accessible' };
  }
};
```

### Core Scanning Logic (Ported from scanner.ts)

The following pure functions are ported unchanged:
- `parseAcf(content)` — Steam manifest parser
- `generateId(str)` — deterministic hash ID
- `cleanGameTitle(filename)` — title normalization
- `pickBestExe(exes, installDirName)` — executable selection heuristics

The following functions are ported with `ctx.filesystem.*` replacing `fs.*`:
- `findIsos(dir, maxDepth, onWalk)` → `scanIsoDir(ctx, dir, maxDepth)`
- `findExecutables(dir, maxDepth)` → `scanExecutables(ctx, dir, maxDepth)`
- `findUpdateFilesForIso(isoPath)` → uses `ctx.filesystem.readdir`
- `scanPaths(dirs, isoDirs, onProgress)` → plugin's `data.scan()`
- `getIconDataUrl(exePath)` → `ctx.app.getFileIcon(exePath)`

### Deduplication (Ported)

Same dedup logic: compare by game ID, exePath, installDir. Same exclusion rules for ISO vs non-ISO.

## Launcher Plugins (Future Phases)

Each launcher plugin follows the same pattern:

| Plugin | Platform | Data Source |
|--------|----------|-------------|
| `epic` | Epic Games | Already exists as `otix-epic` |
| `gog` | GOG Galaxy | Registry + local manifests + GOG API |
| `battlenet` | Battle.net | Local install paths + Battle.net API |
| `ubisoft` | Ubisoft Connect | Registry + local paths + Ubisoft API |
| `ea` | EA App | Local paths + EA API |
| `riot` | Riot Games | Local paths + Riot API |
| `xbox` | Xbox / MS Store | PowerShell + Xbox API |
| `itch` | Itch.io | Local paths + Itch API |

All will use `worker:filesystem` for local scanning + `network:external` and `api:proxy` for API integration.

## IPC Migration

### Current Scanner IPC (desktop/ipc/scanner.ts)

```typescript
// BEFORE: Direct call to scanPaths()
ipcMain.handle('scanner:scan-paths', async (event, paths, isoPaths) => {
  const games = await scanPaths(paths, isoPaths, onProgress);
  gameDetector?.setLibrary(games);
  gameService.upsertGames(games);
  gameService.notifyGamesChanged();
  seedTitlesOnBackend();
  _orchestrator.matchLocalGames(scanned, 'pc-directory');
  return games;
});
```

### After Migration

```typescript
// AFTER: Delegates to plugin
ipcMain.handle('scanner:scan-paths', async (event, paths, isoPaths) => {
  // Save paths to plugin config
  const plugin = pluginManager.getRuntime('local-files');
  if (plugin) {
    await plugin.callMethod('data.scan');
  }
  // orchestrator.scanAll() handles the rest via matching:scan slot
});
```

The orchestrator's `scanAll()` already iterates `matching:scan` plugins, so directory scanning is picked up automatically. The `scanner:scan-paths` IPC becomes a thin wrapper that:
1. Saves scan directories to plugin config
2. Triggers orchestrator scan

The `matchLocalGames()` call in the old IPC is no longer needed — the orchestrator's normal flow handles matching.

## Config Migration

Current storage: `gameService.getScanPaths()` / `gameService.saveScanPaths()` (SQLite `scan_paths` table).

New storage: `ctx.config.set('scanDirectories', [...])` backed by `plugin_config` table.

Migration: On first run of the new plugin, copy existing scan paths from `scan_paths` table to plugin config.

## Progress Events

The plugin emits progress via `ctx.host.emit('scan:progress', data)`. The bridge forwards to `eventBus`, which feeds into the existing `scanner:progress` IPC channel for the frontend.

## Verification

- Plugin loads and registers for `matching:scan` slot
- Scanning directories returns correct game list (compared against current scanner.ts output)
- Steam games have correct `steam://rungameid/{appid}` exePath
- PC games have correct exePath from heuristic match
- ISO games have correct update file associations
- Progress events flow to frontend
- Config persists across plugin disable/enable cycles
- Deduplication works (same game from different scan paths)

## Rollback

The old `scanner.ts` and `scanner:scan-paths` IPC handler remain in codebase until migration is verified. Toggle via feature flag or plugin disable.

## Open Questions

1. How to handle the `gameDetector` integration currently done in scanner IPC? The detector watches running processes to match against known games. **Resolution**: The scanner IPC handler will still call `gameDetector?.setLibrary()` and `gameDetector?.startPeriodicScan()` after the plugin scan completes — these are host-level concerns, not plugin concerns.
2. `host.emit` is available to all plugins without a permission gate. It can only emit generic events, not execute actions. Bridge validates event names against an allowlist if needed.
3. File watcher support for auto-scan on directory changes (future enhancement).
