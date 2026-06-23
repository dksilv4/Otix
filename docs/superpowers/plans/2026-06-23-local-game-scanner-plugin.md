# Local Game Scanner Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert hardcoded `scanner.ts` + `launchers.ts` into worker-isolated plugins using new `worker:filesystem` plugin permission. Phase 1: infrastructure + directory scanner plugin (`local-files`).

**Architecture:** Add `worker:filesystem` permission to plugin system; create RPC bridge for `filesystem.readdir/readFile/stat/access` and `app.getFileIcon`. Port scanner.ts logic into `extensions/otix-plugins/plugins/local-files/main.js` running in worker thread, using `ctx.filesystem.*` instead of `fs.*`. Wire via existing `matching:scan` slot.

**Tech Stack:** Electron, TypeScript (desktop), JavaScript (plugin worker), better-sqlite3, worker_threads

## Global Constraints

- All new plugin permissions must be added to `PluginPermission` union in `desktop/plugins/types.ts`
- Filesystem RPC handlers use `fs/promises` on bridge side, never expose handles to worker
- Plugin manifests declare `"worker:filesystem"` permission in `permissions` array
- Pure functions (`parseAcf`, `generateId`, `cleanGameTitle`, `pickBestExe`) ported unchanged to plugin
- Existing `ScannedGame` interface reused as-is
- No breaking changes to existing plugin scanning flow (Epic, Radarr)

---

### Task 1: Add `worker:filesystem` Permission + PluginContext Types

**Files:**
- Modify: `desktop/plugins/types.ts` — add permission + interfaces
- Modify: `desktop/plugins/worker-bridge.ts` — add RPC handlers
- Modify: `desktop/plugins/worker.ts` — add ctx proxies

**Interfaces:**
- Consumes: existing `PluginPermission`, `PluginContext`, `GATED_METHODS`, `executeMethod`
- Produces: `PluginFilesystem`, `PluginApp`, `PluginHost` interfaces; `'worker:filesystem'` type; bridge methods

- [ ] **Step 0: Add `'scan:progress'` event to OtixEvents**

`desktop/plugins/types.ts`, in `OtixEvents` interface:
```typescript
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
```

- [ ] **Step 1: Add `worker:filesystem` to PluginPermission union**

`desktop/plugins/types.ts`. Add `'worker:filesystem'`:
```typescript
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
```

- [ ] **Step 2: Add filesystem/app/host interfaces to PluginContext**

After `PluginNotifications` interface (around line 202), add:
```typescript
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
```

Add to `PluginContext` interface (after `api: ApiProxy`):
```typescript
  filesystem: PluginFilesystem
  app: PluginApp
  host: PluginHost
```

- [ ] **Step 3: Add GATED_METHODS entries + bridge handlers**

`desktop/plugins/worker-bridge.ts`:

Add to top imports:
```typescript
import * as fs from 'fs/promises'
import { app } from 'electron'
```

Add to `GATED_METHODS`:
```typescript
'filesystem.readdir': 'worker:filesystem',
'filesystem.readFile': 'worker:filesystem',
'filesystem.stat': 'worker:filesystem',
'filesystem.access': 'worker:filesystem',
'app.getFileIcon': 'worker:filesystem',
```

- [ ] **Step 4: Add executeMethod cases for filesystem + app + host**

In `executeMethod` switch (around line 185, after `case 'notifications.send'`), add:
```typescript
case 'filesystem.readdir': {
  const [dirPath, options] = args as [string, { withFileTypes?: boolean } | undefined]
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    isDirectory: e.isDirectory(),
    isFile: e.isFile(),
    isSymbolicLink: e.isSymbolicLink(),
  }))
}
case 'filesystem.readFile': {
  const [filePath, encoding] = args as [string, string | undefined]
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
  try {
    const icon = await app.getFileIcon(filePath, { size: size || 'large' })
    return icon.toDataURL()
  } catch {
    return null
  }
}
case 'host.emit': {
  const [event, data] = args as [string, unknown]
  deps.eventBus.emit(event, data)
  return undefined
}
```

- [ ] **Step 5: Add ctx proxy objects in worker.ts**

`desktop/plugins/worker.ts`, add after `api:` block (around line 141), before `onDestroy:`:
```typescript
  filesystem: {
    readdir: (path: string, options?: { withFileTypes?: boolean }) =>
      rpc('filesystem.readdir', path, options) as Promise<import('./types').FsEntry[]>,
    readFile: (path: string, encoding?: string) =>
      rpc('filesystem.readFile', path, encoding) as Promise<string>,
    stat: (path: string) =>
      rpc('filesystem.stat', path) as Promise<import('./types').FsStat>,
    access: (path: string) =>
      rpc('filesystem.access', path) as Promise<boolean>,
  },
  app: {
    getFileIcon: (path: string, size?: 'small' | 'large') =>
      rpc('app.getFileIcon', path, size) as Promise<string | null>,
  },
  host: {
    emit: (event: string, data: unknown) => {
      rpc('host.emit', event, data)
    },
  },
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `rtk tsc 2>&1`

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add desktop/plugins/types.ts desktop/plugins/worker-bridge.ts desktop/plugins/worker.ts
git commit -m "feat: add worker:filesystem permission for plugin filesystem access"
```

---

### Task 2: Create `local-files` Plugin — Manifest + All Scanning Logic

**Files:**
- Create: `extensions/otix-plugins/plugins/local-files/manifest.json`
- Create: `extensions/otix-plugins/plugins/local-files/main.js`

**Interfaces:**
- Consumes: `PluginContext` with `filesystem`, `app`, `host` (Task 1), `ScannedGame` (orchestrator.ts)
- Produces: Plugin exports (`plugin`, `data.scan`, `data['scan.status']`, `status`, `test`, `slotRender`)

- [ ] **Step 1: Create manifest.json**

`extensions/otix-plugins/plugins/local-files/manifest.json`:
```json
{
  "name": "Local Files Scanner",
  "version": "1.0.0",
  "description": "Scan local directories for Steam, PC, and ISO games",
  "author": "Otix",
  "repository": "builtin",
  "min_app_version": "0.3.0",
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
    { "location": "matching:scan", "label": "Local Files" },
    { "location": "library:scan", "label": "Local Files" }
  ],
  "entry": { "main": "main.js" }
}
```

- [ ] **Step 2: Create main.js — all plugin code**

`extensions/otix-plugins/plugins/local-files/main.js`:

Full content — see Appendix A for complete file. Structure:
1. Pure helper functions: `parseAcf`, `generateId`, `cleanGameTitle`, `IGNORED_DIRS`, `pickBestExe`
2. Filesystem helpers using `ctx.filesystem.*`: `scanExecutables`, `scanIsos`, `findUpdateFilesForIso`, `getGameFolder`, `deduplicate`
3. Plugin exports: `plugin`, `data.scan`, `data['scan.status']`, `status`, `test`, `slotRender`

Key difference from original scanner.ts: all `fs.readdir` → `ctx.filesystem.readdir`, all `fs.readFile` → `ctx.filesystem.readFile`, all `fs.stat` → `ctx.filesystem.stat`, all `app.getFileIcon` → `ctx.app.getFileIcon`. Progress uses `ctx.host.emit('scan:progress', data)`.

The `data.scan` function returns `{ games: ScannedGame[] }` matching what the orchestrator expects from plugin scan calls.

- [ ] **Step 3: Commit**

```bash
git add extensions/otix-plugins/plugins/local-files/
git commit -m "feat: create local-files plugin for directory game scanning"
```

---

### Task 3: Wire Plugin into Orchestrator + Update IPC

**Files:**
- Modify: `desktop/game/orchestrator.ts` — remove hardcoded launcher call
- Modify: `desktop/ipc/scanner.ts` — delegate scan-paths to plugin system
- Modify: `desktop/main.ts` — ensure local-files is a built-in plugin (if needed)

**Interfaces:**
- Consumes: `GameScanOrchestrator.scanAll()` (existing), `pluginManager.getPluginsForSlot('matching:scan')` (existing), `pluginManager.setConfig()` (existing)
- Produces: Updated scan flow where directory scanning comes from plugin

- [ ] **Step 1: Update orchestrator.ts — remove hardcoded launcher scan**

`desktop/game/orchestrator.ts`:

Remove line 15:
```typescript
// REMOVE: import { scanAllLaunchers as scanHardcodedLaunchers } from './launchers'
```

In `scanAll()`, remove the hardcoded launcher scan block (lines ~119-145):
```typescript
// REMOVE these lines:
    // 1. Collect all matching:scan plugins
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const hardcodedResults = await scanHardcodedLaunchers();
    for (const r of hardcodedResults) {
      for (const g of r.games) {
        allGames.push({ ... });
      }
      if (r.games.length > 0) {
        const platform = r.games[0].platform || 'pc';
        upsertGamesForPlatform(..., platform);
      }
    }
```

Replace with just:
```typescript
    // 1. Collect all matching:scan plugins
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
```

Also update the `pluginsScanned` count at line ~230:
```typescript
// BEFORE:
      pluginsScanned: plugins.length + (hardcodedResults.length > 0 ? 1 : 0),
// AFTER:
      pluginsScanned: plugins.length,
```

- [ ] **Step 2: Update scanner IPC — delegate scan-paths to plugin**

`desktop/ipc/scanner.ts`:

Update `scanner:scan-paths` handler to save paths to plugin config + trigger orchestrator:

```typescript
ipcMain.handle('scanner:scan-paths', async (event, paths: string[], isoPaths: string[]) => {
  // ── Plugin path: save paths to local-files plugin config ──
  try {
    const pluginManager = /* access plugin manager instance */;
    if (pluginManager) {
      pluginManager.setConfig('local-files', 'scanDirectories', paths);
      pluginManager.setConfig('local-files', 'isoDirectories', isoPaths);
    }
  } catch (err) {
    console.warn('[scanner:scan-paths] Could not save to plugin config:', err);
  }

  // ── Still persist to gameService for backward compat ──
  const games = await scanPaths(paths, isoPaths, (progressData) => {
    event.sender.send('scanner:progress', progressData);
  });
  gameDetector?.setLibrary(games);
  gameDetector?.startPeriodicScan();
  gameService.upsertGames(games);
  gameService.notifyGamesChanged();
  seedTitlesOnBackend();

  // Match directory games through orchestrator plugin pipeline
  if (_orchestrator && games.length > 0) {
    const scanned: ScannedGame[] = games.map((g) => ({
      id: g.id.replace('pc_', ''),
      title: g.title,
      platform: 'pc',
      externalIds: [{ source: 'pc', id: g.id.replace('pc_', '') }],
      exePath: g.exePath,
      installPath: g.installDir,
      posterUrl: g.posterUrl,
    }));
    _orchestrator.matchLocalGames(scanned, 'pc-directory').catch((err) =>
      console.error('[scanner] Directory match failed:', err)
    );
  }

  return games;
});
```

Note: The `pluginManager` reference needs to be accessible. Either:
- Store it alongside `_orchestrator` (add `let _pluginManager` and `export function setPluginManager(pm)`),
- Or pass it as constructor argument to the registration function.

The cleanest: add a module-level `_pluginManager` variable similar to `_orchestrator`:
```typescript
let _pluginManager: PluginManager | null = null;

export function setPluginManager(pm: PluginManager): void {
  _pluginManager = pm;
}
```

And use `_pluginManager.setConfig(...)` in the handler.

- [ ] **Step 3: Register plugin manager reference in main.ts**

In `desktop/main.ts`, after creating the plugin manager and setting the orchestrator:
```typescript
import { setPluginManager } from './ipc/scanner';

// After pluginManager is created:
setPluginManager(pluginManager);
```

- [ ] **Step 4: Verify the end-to-end flow**

1. Check that `local-files` plugin is discovered (under `extensions/otix-plugins/plugins/`)
2. Enable the plugin via plugin manager (or auto-enable if configured)
3. Run `scanner:scan-all-plugins` from frontend → should see "Local Files" in results
4. Check that `scanner:scan-paths` still works (backward compat)

- [ ] **Step 5: Commit**

```bash
git add desktop/game/orchestrator.ts desktop/ipc/scanner.ts desktop/main.ts
git commit -m "feat: wire local-files plugin into scanner IPC and orchestrator"
```

---

### Task 4: Auto-Enable Plugin + Verify Cleanup

**Files:**
- Modify: `desktop/main.ts` — auto-enable local-files on first load
- Possibly remove: `desktop/game/scanner.ts` (after verification)
- Possibly remove: `desktop/game/launchers.ts` (after verification)

- [ ] **Step 1: Auto-enable local-files plugin after discovery**

In `desktop/main.ts`, after `loadEnabledPlugins()` and `discoverPlugins()`, add:
```typescript
// Auto-enable built-in plugins
const localFiles = pluginManager.getPlugin('local-files');
if (localFiles && localFiles.status === 'installed') {
  try {
    await pluginManager.enable('local-files');
  } catch (err) {
    console.error('[main] Failed to enable local-files plugin:', err);
  }
}
```

- [ ] **Step 2: Run full verification**

1. Launch Otix app
2. Go to settings → scanning
3. Verify "Local Files" appears in scan plugins list
4. Trigger scan-all-plugins
5. Verify game results include directory-scanned games (Steam, PC, ISO)
6. Verify matching pipeline runs on scanned games
7. Verify `scanner:scan-paths` still works via IPC fallback

- [ ] **Step 3: Remove old scanner code (after verification)**

After confirming the plugin-based scan produces identical results:

Delete `desktop/game/scanner.ts` and `desktop/game/launchers.ts`:
```bash
git rm desktop/game/scanner.ts desktop/game/launchers.ts
```

Update `desktop/ipc/scanner.ts` to remove direct `scanPaths`/`scanAllLaunchers` imports and replace with pure plugin-based flow.

- [ ] **Step 4: Final commit**

```bash
git add desktop/main.ts desktop/game/ desktop/ipc/scanner.ts
git commit -m "feat: auto-enable local-files plugin, remove legacy scanner code"
```

---

## Appendix A: main.js Full Content

```javascript
// extensions/otix-plugins/plugins/local-files/main.js
// Local game directory scanner plugin — ported from desktop/game/scanner.ts

const path = require('path');

// ── Pure helpers ──────────────────────────────────────────────────────

function parseAcf(content) {
  const result = {};
  const matches = content.matchAll(/"([^"]+)"\s+"([^"]+)"/g);
  for (const match of matches) result[match[1]] = match[2];
  return result;
}

function generateId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return 'pc_' + Math.abs(hash).toString(36);
}

function cleanGameTitle(filename) {
  let name = filename.replace(/\.iso$/i, '');
  name = name.replace(/[\._\-]/g, ' ');
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bhbg\b/gi, /\bdlc\b/gi, /\bgog\b/gi, /\bcrack\b/gi
  ];
  for (const tag of tags) name = name.replace(tag, '');
  name = name.replace(/\[\s*\]/g, '').replace(/\(\s*\)/g, '').replace(/\{\s*\}/g, '');
  name = name.replace(/[\s\-\+\:\,]+$/, '');
  return name.replace(/\s+/g, ' ').trim();
}

const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps'
]);

async function pickBestExe(ctx, exes, installDirName) {
  if (exes.length === 0) return null;
  if (exes.length === 1) return exes[0];
  const cleanInstallDir = installDirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestExe = null, bestScore = -1;
  for (const exe of exes) {
    const exeName = path.basename(exe, '.exe').toLowerCase();
    if (['crash','unins','setup','redist','config','tool','cef','helper','register','patch'].some(s => exeName.includes(s))) continue;
    let score = 0;
    if (exeName.includes('shipping')) score += 80;
    const fnLower = installDirName.toLowerCase();
    const folderIdx = exe.toLowerCase().indexOf(fnLower);
    if (folderIdx >= 0 && (exe.toLowerCase().substring(folderIdx + fnLower.length).match(/[\\/]/g) || []).length > 1) score += 30;
    if (exeName === cleanInstallDir || exeName === installDirName.toLowerCase()) score += 100;
    else if (exeName.includes(cleanInstallDir) || cleanInstallDir.includes(exeName)) score += 50;
    try { const s = await ctx.filesystem.stat(exe); score += Math.min(30, Math.floor(s.size / (1024 * 1024))); } catch {}
    if (score > bestScore) { bestScore = score; bestExe = exe; }
  }
  return bestExe;
}

// ── Filesystem helpers ────────────────────────────────────────────────

async function scanExecutables(ctx, dir, maxDepth) {
  const exes = [];
  async function traverse(currentDir, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = await ctx.filesystem.readdir(currentDir);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          if (entry.name.toLowerCase().endsWith('.exe')) exes.push(fullPath);
        }
      }
    } catch {}
  }
  await traverse(dir, 1);
  return exes;
}

async function scanIsos(ctx, dir, maxDepth) {
  const isos = [];
  async function traverse(currentDir, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = await ctx.filesystem.readdir(currentDir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await traverse(path.join(currentDir, entry.name), depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          if (entry.name.toLowerCase().endsWith('.iso')) isos.push(path.join(currentDir, entry.name));
        }
      }
    } catch {}
  }
  await traverse(dir, 1);
  return isos;
}

async function findUpdateFilesForIso(ctx, isoPath) {
  const updates = [], visited = new Set();
  async function scanFolder(folderPath, depth) {
    if (depth > 2) return;
    try {
      const entries = await ctx.filesystem.readdir(folderPath);
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await scanFolder(fullPath, depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          const nl = entry.name.toLowerCase();
          if (nl.endsWith('.exe') && (nl.includes('update') || nl.includes('patch')) &&
              !nl.includes('setup') && !nl.includes('uninst') && !nl.includes('crash') && !nl.includes('helper') && !visited.has(fullPath)) {
            visited.add(fullPath);
            updates.push({ name: entry.name, path: fullPath });
          }
        }
      }
    } catch {}
  }
  const isoDir = path.dirname(isoPath), isoParentDir = path.dirname(isoDir);
  const foldersToScan = new Set();
  for (const base of [isoParentDir, path.dirname(isoParentDir)]) {
    try { for (const e of await ctx.filesystem.readdir(base)) {
      if (e.isDirectory) { const n = e.name.toLowerCase(); if (n.includes('update') || n.includes('patch')) foldersToScan.add(path.join(base, e.name)); }
    } } catch {}
  }
  foldersToScan.add(isoDir);
  try { for (const e of await ctx.filesystem.readdir(isoDir)) {
    if (e.isDirectory) { const n = e.name.toLowerCase(); if (n.includes('update') || n.includes('patch')) foldersToScan.add(path.join(isoDir, e.name)); }
  } } catch {}
  for (const f of foldersToScan) await scanFolder(f, 1);
  updates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return updates;
}

function getGameFolder(exePath, searchRoot) {
  let current = path.dirname(exePath);
  const rootLower = searchRoot.toLowerCase();
  const SKIP = new Set(['bin','x64','win64','x86','win32','release','build','dist','engine','win-unpacked','launcher','subsystem']);
  while (current.toLowerCase() !== rootLower) {
    const parent = path.dirname(current);
    const fn = path.basename(current).toLowerCase();
    if (SKIP.has(fn)) { current = parent; } else break;
  }
  return current;
}

function deduplicate(games) {
  const unique = [], seenIds = new Set(), seenExes = new Set(), seenInstallDirs = new Set();
  const norm = p => { try { return path.resolve(p).toLowerCase(); } catch { return p.toLowerCase(); } };
  for (const g of games) {
    const id = g.id.toLowerCase();
    const exe = g.exePath.startsWith('steam://') ? g.exePath.toLowerCase() : norm(g.exePath);
    const le = g.localExePath ? norm(g.localExePath) : null;
    const idir = norm(g.installDir);
    if (seenIds.has(id) || seenExes.has(exe) || (le && seenExes.has(le)) || (g.platform !== 'iso' && seenInstallDirs.has(idir))) continue;
    seenIds.add(id); seenExes.add(exe); if (le) seenExes.add(le);
    if (g.platform !== 'iso') seenInstallDirs.add(idir);
    unique.push(g);
  }
  return unique;
}

// ── Plugin exports ────────────────────────────────────────────────────

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Local Files Scanner loaded');
  },

  data: {
    scan: async (ctx) => {
      const scanDirs = ctx.config.get('scanDirectories') || [];
      const isoDirs = ctx.config.get('isoDirectories') || [];
      const allGames = [];
      let idx = 0;
      const total = scanDirs.length + isoDirs.length;
      const emit = (dir) => ctx.host.emit('scan:progress', { currentDir: dir, progress: total > 0 ? Math.round((idx / total) * 100) : 100 });

      for (const dir of scanDirs) {
        emit(dir);
        try {
          if (!(await ctx.filesystem.access(dir))) { idx++; continue; }
          const filesInDir = await ctx.filesystem.readdir(dir);
          const hasSA = filesInDir.some(e => e.name === 'steamapps' && e.isDirectory);
          const isSA = dir.toLowerCase().endsWith('steamapps');
          const saPath = hasSA ? path.join(dir, 'steamapps') : (isSA ? dir : null);

          if (saPath) {
            for (const file of await ctx.filesystem.readdir(saPath)) {
              if (!file.name.startsWith('appmanifest_') || !file.name.endsWith('.acf')) continue;
              try {
                const content = await ctx.filesystem.readFile(path.join(saPath, file.name), 'utf-8');
                const data = parseAcf(content);
                const { appid, name, installdir } = data;
                if (!appid || !name || !installdir) continue;
                const commonDir = path.join(saPath, 'common', installdir);
                let localExePath, localIconUrl;
                try { const exe = await pickBestExe(ctx, await scanExecutables(ctx, commonDir, 3), installdir); if (exe) localExePath = exe; } catch {}
                if (localExePath) localIconUrl = (await ctx.app.getFileIcon(localExePath)) || undefined;
                allGames.push({ id: appid, title: name, exePath: `steam://rungameid/${appid}`, localExePath, installDir: commonDir, platform: 'steam', localIconUrl });
              } catch {}
            }
          } else {
            const selfExes = await scanExecutables(ctx, dir, 2);
            const hasSelf = selfExes.some(exe => {
              const n = path.basename(exe).toLowerCase();
              if (['unins','setup','helper','crash'].some(s => n.includes(s))) return false;
              return path.resolve(getGameFolder(exe, dir)).toLowerCase() === path.resolve(dir).toLowerCase();
            });
            if (hasSelf) {
              const best = await pickBestExe(ctx, selfExes, path.basename(dir));
              if (best) allGames.push({ id: generateId(best), title: cleanGameTitle(path.basename(dir)), exePath: best, installDir: dir, platform: 'pc', localIconUrl: (await ctx.app.getFileIcon(best)) || undefined });
            } else {
              for (const entry of await ctx.filesystem.readdir(dir)) {
                if (!entry.isDirectory) continue;
                const n = entry.name.toLowerCase();
                if (n.startsWith('$') || IGNORED_DIRS.has(n)) continue;
                const gf = path.join(dir, entry.name);
                const subExes = await scanExecutables(ctx, gf, 3);
                if (subExes.length > 0) {
                  const best = await pickBestExe(ctx, subExes, entry.name);
                  if (best) allGames.push({ id: generateId(best), title: cleanGameTitle(entry.name), exePath: best, installDir: gf, platform: 'pc', localIconUrl: (await ctx.app.getFileIcon(best)) || undefined });
                }
              }
            }
          }
        } catch (e) { ctx.logger.error(`Error scanning ${dir}: ${e.message}`); }
        idx++;
      }

      for (const dir of isoDirs) {
        emit(dir);
        try {
          if (!(await ctx.filesystem.access(dir))) { idx++; continue; }
          for (const iso of await scanIsos(ctx, dir, 3)) {
            const fn = path.basename(iso, '.iso');
            allGames.push({ id: generateId(iso), title: cleanGameTitle(fn), exePath: iso, installDir: path.dirname(iso), platform: 'iso', updateFiles: await findUpdateFilesForIso(ctx, iso) });
          }
        } catch (e) { ctx.logger.error(`Error scanning ISO path ${dir}: ${e.message}`); }
        idx++;
      }

      ctx.host.emit('scan:progress', { currentDir: 'Done', progress: 100 });
      return { games: deduplicate(allGames) };
    },

    'scan.status': async (ctx) => ({ phase: 'idle' })
  },

  status: async (ctx) => {
    const dirs = ctx.config.get('scanDirectories') || [];
    const isoDirs = ctx.config.get('isoDirectories') || [];
    return { connected: dirs.length > 0 || isoDirs.length > 0, scanDirectories: dirs.length, isoDirectories: isoDirs.length };
  },

  test: async (ctx, configDraft) => {
    const dirs = configDraft?.scanDirectories || ctx.config.get('scanDirectories') || [];
    const isoDirs = configDraft?.isoDirectories || ctx.config.get('isoDirectories') || [];
    const errors = [];
    for (const d of [...dirs, ...isoDirs]) {
      if (!(await ctx.filesystem.access(d))) errors.push(`Path not found: ${d}`);
    }
    return { success: errors.length === 0, message: errors.join('; ') || 'All paths accessible' };
  },

  slotRender: async (ctx, location) => ({
    type: 'scan', platform: 'pc-directory', label: 'Local Files',
    description: 'Scan local directories for Steam, PC, and ISO games'
  }),
};
```
