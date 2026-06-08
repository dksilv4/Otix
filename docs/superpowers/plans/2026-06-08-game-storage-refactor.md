# Game Storage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3-tier localStorage+cache+SQLite game storage with single-source-of-truth SQLite DB, removing localStorage for game data entirely.

**Architecture:** Desktop Electron process owns SQLite (better-sqlite3) as the single source of truth for game data. Renderer queries through typed IPC calls. In-memory LRU cache on renderer side for hot reads, auto-invalidated by DB-change events from main process. No more localStorage sync, no 3-way redundancy.

**Tech Stack:** better-sqlite3 (existing), Electron IPC (existing), zod for IPC payload validation (optional), react-query for cache layer (existing)

---

## Current Problems

1. **3-tier write pattern** — `game-scanner/storage.ts` writes to memory cache → localStorage → SQLite sequentially. Each tier can desync.
2. **localStorage as intermediary** — adds complexity, 5MB cap, synchronous blocking writes, no query capability.
3. **Stale reads** — `getScannedGames()` returns memory cache that may be stale. `loadFromDatabase()` runs on startup but only synchronizes forward.
4. **No query API** — every consumer loads ALL games and filters in JS. No pagination, sorting, or filtered queries at DB level.
5. **Rejected suggestions in localStorage only** — lost on cache clear.
6. **Duplicate storage modules** — `games/scanner/storage.ts` just re-exports from `game-scanner/storage.ts`.
7. **(`window as any).desktopAPI** casts throughout — no type safety at IPC boundary.
8. **No migration path** — old localStorage data lives forever, no cleanup.
9. **Duplicate ISO guard logic** — `setScannedGames()` (L264-273) and `loadFromDatabase()` (L163-174) have identical "preserve installed game platform" guard. Copy-paste drift risk.
10. **`markGameInstalled()` code duplication** — exact-match path and case-insensitive fallback duplicate the same 7-line update block. Only `findIndex` match condition differs.
11. **`storageReady` always `true`** — exported constant that never changes. `isStorageReady()` is dead code.
12. **Module-level side effects with no cleanup** — `setTimeout(loadFromDatabase)` and `onGamesUpdated` listener at import time. No `dispose()` export — leaks in HMR/test.
13. **4 separate IPC round-trips on startup** — `loadFromDatabase()` makes individual calls for paths, games, map, and optional write-back. Can be `Promise.all`-ed.
14. **`(window as any).desktopAPI` everywhere** — 10+ casts bypassing typed `DesktopAPI` interface in `desktop-api.ts`.

---

## OOP Evaluation (Decision Record)

**Question**: Would class-based OOP improve performance for game storage layer?

**Verdict**: No. IPC → SQLite latency (0.5-5ms) dominates JS property access (~5-50ns) by 4-6 orders of magnitude. V8 JIT optimizes both patterns to near-identical machine code.

**What OOP would improve** (non-performance):
- Testability: Fresh instance per test, no module-state bleed
- Lifecycle: Constructor/dispose pattern instead of module-level side effects
- Contracts: `implements IGameStorage` interface for swappable backends

**What OOP would hurt**:
- Tree-shaking: Bundler can't drop individual methods from a class
- Bundle size: Class definition always included even if only 1 method used

**Recommendation**: Stay functional module pattern. Module-level singletons are idiomatic for Electron renderer. Fix actual issues: side-effects, testability via `dispose()`, 3-tier write pattern.

**Actual performance wins (ordered by impact)**:
1. Move filtering/sorting to SQLite (plan Tasks 2, 5) — eliminates JS full-scan over growing game lists
2. Remove `localStorage.setItem(JSON.stringify(allGames))` — blocks UI thread 10-50ms with large libraries
3. Parallelize IPC calls — `Promise.all` cuts `loadFromDatabase()` startup latency by ~75%
4. React Query stale-while-revalidate — eliminates redundant IPC fetches across components

---

## Phase 0: Immediate Code Quality Fixes (pre-refactor)

Apply these fixes to current 3-tier architecture BEFORE the full SQLite migration.
Reduces bug risk during migration.

### Fix 0.1: Extract shared `preserveInstallStatus()`

**File**: `frontend/src/features/game-scanner/storage.ts`

```typescript
/** Guard: never downgrade an installed game back to ISO (prevents race with match mutation). */
function preserveInstallStatus(games: LocalGame[]): LocalGame[] {
  return games.map(g => {
    if (g.platform !== 'iso') return g
    const existing = cache.games.find(c => c.id === g.id || c.exePath === g.exePath)
    if (existing && existing.platform !== 'iso') {
      return { ...g, platform: existing.platform, exePath: existing.exePath, installDir: existing.installDir }
    }
    return g
  })
}
```

Replace duplicate blocks in `setScannedGames()` and `loadFromDatabase()`.

### Fix 0.2: Deduplicate `markGameInstalled()`

Merge exact-match (L373-386) and case-insensitive fallback (L389-397) into single update path. Only `findIndex` differs — hoist the match logic, share the update.

### Fix 0.3: Replace `storageReady` with `_dbLoaded`

```typescript
let _dbLoaded = false
export function isStorageReady(): boolean { return _dbLoaded }
```

Remove `export const storageReady = true`. Set `_dbLoaded = true` at end of `loadFromDatabase()` try-block.

### Fix 0.4: Export `disposeStorageListeners()`

Store `onGamesUpdated` unsubscribe handle. Export `disposeStorageListeners()` for test/HMR cleanup.

### Fix 0.5: Switch to typed `getDesktopAPI()`

Replace all `(window as any).desktopAPI` with `getDesktopAPI()` from `@/lib/desktop-api`.
Add missing method signatures to `DesktopAPI` interface (`saveScanPaths`, `saveScannedGames`, `saveLocalGamesMapEntry`, `getScanPaths`, `getScannedGames`, `getLocalGamesMap`, `onGamesUpdated`).

### Fix 0.6: Parallelize `loadFromDatabase()` IPC calls

`Promise.all` for paths + games + map (independent reads). Write-back for dedup stays sequential.

---

## File Map

### Modified (frontend)

| File | Change |
|------|--------|
| `frontend/src/features/game-scanner/storage.ts` | Strip localStorage. Pure in-memory cache fed by IPC. Remove `loadFromDatabase()`, `setScanPaths`, `setIsoPaths`, `setScannedGames`, `setLocalGamesMapEntry`. Add `subscribeToDbChanges()`. |
| `frontend/src/features/game-scanner/types.ts` | Add query/filter types. Remove `STORAGE_KEYS`. |
| `frontend/src/lib/desktop-api.ts` | Add typed IPC methods for game CRUD + queries. |
| `frontend/src/features/games/types.ts` | Remove `otixMatchSuggestion`, `otixConfidence` from `Game` — move to relational suggestion table. (Phase 2) |
| `frontend/src/features/games/hooks/use-games.ts` | Use new IPC query methods instead of local memo filtering. |
| `frontend/src/features/games/hooks/use-local-games.ts` | Remove localStorage sync. |
| `frontend/src/features/games/pages/launcher-game-page.tsx` | Remove localStorage reads, use IPC. |
| `frontend/src/features/library/molecules/games-launcher.tsx` | Remove localStorage reads, use IPC. |
| `frontend/src/features/settings/.../scanners-section.tsx` | Remove localStorage reads. |
| `frontend/src/features/media/organisms/download-game-button.tsx` | Remove localStorage reads. |
| `frontend/src/features/media/organisms/media-detail.tsx` | Remove localStorage reads. |
| `frontend/src/features/games/scanner/storage.ts` | Delete — re-export layer, no longer needed. |
| `frontend/src/features/games/scanner/queries.ts` | Delete — re-export layer, no longer needed. |

### Modified (desktop)

| File | Change |
|------|--------|
| `desktop/db.ts` | Add `game_rejected_suggestions` table. Add `game_match_suggestions` table. Add indexes. |
| `desktop/downloads.ts` | Remove `scanned_games` CRUD — moved to dedicated module. |
| `desktop/ipc/scanner.ts` | Rewrite IPC handlers to use new game-db module. |
| `desktop/game-db.ts` | **Create** — dedicated module for game storage CRUD with typed methods. |

### Created

| File | Purpose |
|------|---------|
| `desktop/game-db.ts` | Game-specific DB operations: CRUD, query, filter, suggestion management. |
| `frontend/src/features/game-scanner/game-queries.ts` | React Query hooks wrapping IPC calls for game data + filters. |

### Deleted

| File | Reason |
|------|--------|
| `frontend/src/features/games/scanner/storage.ts` | Re-export layer, obsolete. |
| `frontend/src/features/games/scanner/queries.ts` | Re-export layer, obsolete. |
| `frontend/src/features/games/scanner/types.ts` | Re-export layer, obsolete. |

---

### Task 1: Create desktop `game-db.ts` module

**Files:**
- Create: `desktop/game-db.ts`
- Modify: `desktop/db.ts` (add new tables)

- [ ] **Step 1: Add new tables to `desktop/db.ts`**

Add `game_rejected_suggestions` table alongside existing `_createTables()`:

```typescript
// in _createTables():
db.run(`
  CREATE TABLE IF NOT EXISTS game_rejected_suggestions (
    id TEXT PRIMARY KEY,
    game_title TEXT NOT NULL,
    game_platform TEXT NOT NULL,
    suggestion_media_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(game_title, game_platform, suggestion_media_id)
  )
`);

// Index for fast lookup
db.run('CREATE INDEX IF NOT EXISTS idx_rejected_suggestions_lookup ON game_rejected_suggestions(game_title, game_platform)');
```

- [ ] **Step 2: Create `desktop/game-db.ts` with typed CRUD**

```typescript
import { _run, _get, _all, ensureDb } from './db';

export interface GameRow {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: string;
  iconUrl?: string;
  posterUrl?: string;
  sources?: string[];
  data?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string };
  matchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string };
  updateFiles?: { name: string; path: string }[];
}

export interface GameFilter {
  platform?: string[];
  matched?: boolean;       // true=only matched, false=only unmatched, undefined=all
  hasSuggestion?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'platform' | 'updated_at';
  sortDir?: 'asc' | 'desc';
}

function rowToGame(row: any): GameRow {
  const matchSuggestion = row.otix_match_suggestion ? JSON.parse(row.otix_match_suggestion) : undefined;
  return {
    id: row.id,
    title: row.title,
    exePath: row.exe_path,
    localExePath: row.local_exe_path || undefined,
    installDir: row.install_dir,
    platform: row.platform,
    iconUrl: row.icon_url || undefined,
    posterUrl: row.poster_url || undefined,
    sources: row.sources ? JSON.parse(row.sources) : undefined,
    updateFiles: row.update_files ? JSON.parse(row.update_files) : undefined,
    data: row.otix_media_id ? {
      id: row.otix_media_id,
      title: row.otix_media_title || row.title,
      platform: row.platform,
      iconUrl: row.otix_icon_url || undefined,
      posterUrl: row.poster_url || undefined,
    } : undefined,
    matchSuggestion,
  };
}

export function getAllGames(filter: GameFilter = {}): GameRow[] {
  ensureDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter.platform && filter.platform.length > 0) {
    conditions.push(`platform IN (${filter.platform.map(() => '?').join(',')})`);
    params.push(...filter.platform);
  }
  if (filter.matched === true) {
    conditions.push('otix_media_id IS NOT NULL');
  } else if (filter.matched === false) {
    conditions.push('otix_media_id IS NULL AND otix_match_suggestion IS NULL');
  }
  if (filter.hasSuggestion === true) {
    conditions.push('otix_match_suggestion IS NOT NULL');
  } else if (filter.hasSuggestion === false) {
    conditions.push('otix_match_suggestion IS NULL');
  }
  if (filter.search) {
    conditions.push('(title LIKE ? OR install_dir LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = filter.sortBy || 'title';
  const orderDir = filter.sortDir || 'asc';
  const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
  const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

  const sql = `SELECT * FROM scanned_games ${where} ORDER BY ${orderBy} ${orderDir} ${limit} ${offset}`;
  return _all(sql, params).map(rowToGame);
}

export function getGameById(id: string): GameRow | null {
  ensureDb();
  const row = _get('SELECT * FROM scanned_games WHERE id = ?', [id]);
  return row ? rowToGame(row) : null;
}

export function upsertGames(games: GameRow[]): void {
  ensureDb();
  const existingSeeded = new Map<string, number>();
  const existingRows = _all('SELECT id, seeded FROM scanned_games');
  for (const r of existingRows) {
    existingSeeded.set(r.id, r.seeded as number);
  }

  // Delete stale entries
  const newIds = [...new Set(games.map(g => g.id))];
  if (newIds.length > 0) {
    const placeholders = newIds.map(() => '?').join(',');
    _run(`DELETE FROM scanned_games WHERE id NOT IN (${placeholders})`, newIds);
  } else {
    _run('DELETE FROM scanned_games');
  }

  for (const g of games) {
    const seeded = existingSeeded.get(g.id) ?? 0;
    _run(`
      INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform, icon_url, poster_url,
        sources, update_files, otix_media_id, otix_media_title, otix_media_slug,
        otix_confidence, otix_match_suggestion, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      g.id, g.title, g.exePath, g.localExePath || null, g.installDir, g.platform,
      g.iconUrl || null, g.posterUrl || null,
      g.sources ? JSON.stringify(g.sources) : null,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      g.data?.id || null, g.data?.title || null, null,
      null, // otix_confidence — deprecated
      g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : null,
      seeded,
    ]);
  }
}

export function updateGamePath(id: string, exePath: string, installDir?: string): void {
  ensureDb();
  _run(
    'UPDATE scanned_games SET exe_path = ?, install_dir = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [exePath, installDir || exePath.replace(/\/[^/]*$/, ''), id],
  );
}

export function acceptSuggestion(gameId: string, suggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string }): void {
  ensureDb();
  if (!suggestion) return;
  _run(`
    UPDATE scanned_games SET
      otix_media_id = ?, otix_media_title = ?, otix_match_suggestion = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `, [suggestion.id, suggestion.title, gameId]);
  // Clear any previous rejection for this suggestion
  const game = _get('SELECT title, platform FROM scanned_games WHERE id = ?', [gameId]);
  if (game) {
    _run('DELETE FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?',
      [game.title, game.platform, suggestion.id]);
  }
}

export function rejectSuggestion(gameId: string, suggestionMediaId: string): void {
  ensureDb();
  const game = _get('SELECT title, platform FROM scanned_games WHERE id = ?', [gameId]);
  if (!game) return;
  // Store rejection
  _run(`
    INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
    VALUES (?, ?, ?, ?)
  `, [`rej_${gameId}_${suggestionMediaId}`, game.title, game.platform, suggestionMediaId]);
  // Clear suggestion from game row
  _run('UPDATE scanned_games SET otix_match_suggestion = NULL, updated_at = datetime(\'now\') WHERE id = ?', [gameId]);
}

export function isSuggestionRejected(gameTitle: string, gamePlatform: string, suggestionMediaId: string): boolean {
  ensureDb();
  const row = _get(
    'SELECT id FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?',
    [gameTitle, gamePlatform, suggestionMediaId],
  );
  return !!row;
}

export function getGameCount(filter: Omit<GameFilter, 'limit' | 'offset'> = {}): number {
  const all = getAllGames({ ...filter, limit: undefined, offset: undefined });
  return all.length;
}

export function getScanPaths(): { path: string; type: 'game' | 'iso' }[] {
  ensureDb();
  const rows = _all('SELECT * FROM game_scan_paths');
  return rows.map(r => ({ path: r.path, type: r.type }));
}

export function saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): void {
  ensureDb();
  _run('DELETE FROM game_scan_paths');
  for (const p of paths) {
    _run('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)', [p.path, p.type]);
  }
}

export function notifyGamesChanged(): void {
  // This will be called from IPC to notify renderer
  // Implementation in Task 3
}
```

- [ ] **Step 3: Run TS check**

```bash
cd desktop && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: clean compile or only errors from other modules.

- [ ] **Step 4: Commit**

```bash
git add desktop/game-db.ts desktop/db.ts
git commit -m "feat: add game-db module with typed CRUD and suggestion management"
```

---

### Task 2: Rewrite desktop IPC handlers to use game-db module

**Files:**
- Modify: `desktop/ipc/scanner.ts`

- [ ] **Step 1: Replace all `downloads.ts` game imports with `game-db.ts`**

Current IPC handlers call `saveScannedGamesToDb`, `getScannedGamesFromDb`, `updateGamePathInDb`, `getScanPathsFromDb`, `saveScanPathsToDb` from `downloads.ts`. Replace every handler body with calls to `game-db.ts`.

New IPC handler map:

| Channel | game-db method |
|---------|----------------|
| `scanner:scan-paths` | `upsertGames()` + `getAllGames()` return |
| `scanner:scan-launchers` | `upsertGames()` + `getAllGames()` return |
| `scanner:get-scanned-games` | `getAllGames()` |
| `scanner:save-scanned-games` | `upsertGames()` |
| `scanner:get-scan-paths` | `getScanPaths()` |
| `scanner:save-scan-paths` | `saveScanPaths()` |
| `scanner:update-game-path` | `updateGamePath()` |
| `scanner:get-game-by-id` | `getGameById()` |
| `scanner:get-game-count` | `getGameCount()` |
| `scanner:accept-suggestion` | `acceptSuggestion()` |
| `scanner:reject-suggestion` | `rejectSuggestion()` |

```typescript
// New IPC handlers in desktop/ipc/scanner.ts
import * as gameDb from '../game-db';

// Replace existing scanner-ipc handlers:

ipcMain.handle('scanner:scan-paths', async (event, scanPaths: string[], isoPaths: string[]) => {
  const { scanPaths } = await import('../scanner');
  const games = await scanPaths(scanPaths, isoPaths, (progressData) => {
    event.sender.send('scanner:progress', progressData);
  });
  gameDb.upsertGames(games);
  gameDb.notifyGamesChanged();
  return games;
});

ipcMain.handle('scanner:get-scanned-games', async () => {
  return gameDb.getAllGames();
});

ipcMain.handle('scanner:get-scanned-games-filtered', async (_event, filter: any) => {
  return gameDb.getAllGames(filter);
});

ipcMain.handle('scanner:get-game-by-id', async (_event, id: string) => {
  return gameDb.getGameById(id);
});

ipcMain.handle('scanner:get-game-count', async (_event, filter: any) => {
  return gameDb.getGameCount(filter);
});

ipcMain.handle('scanner:accept-suggestion', async (_event, gameId: string, suggestion: any) => {
  gameDb.acceptSuggestion(gameId, suggestion);
  gameDb.notifyGamesChanged();
});

ipcMain.handle('scanner:reject-suggestion', async (_event, gameId: string, suggestionMediaId: string) => {
  gameDb.rejectSuggestion(gameId, suggestionMediaId);
  gameDb.notifyGamesChanged();
});

// Keep existing seed-titles, match-cache, pick-executable, and save-sync handlers untouched.
```

- [ ] **Step 2: Add IPC channels to renderer preload**

Ensure preload script exposes new channels.

- [ ] **Step 3: Commit**

```bash
git add desktop/ipc/scanner.ts desktop/preload.ts
git commit -m "refactor: rewrite IPC handlers to use game-db module"
```

---

### Task 3: Add DB-change event bus for renderer invalidation

**Files:**
- Modify: `desktop/game-db.ts`
- Create: `frontend/src/features/game-scanner/db-sync.ts`

- [ ] **Step 1: Implement notification in `game-db.ts`**

```typescript
// In game-db.ts — add at bottom
import { BrowserWindow } from 'electron';

let _notifyTarget: BrowserWindow | null = null;

export function setNotifyTarget(win: BrowserWindow): void {
  _notifyTarget = win;
}

export function notifyGamesChanged(): void {
  if (_notifyTarget && !_notifyTarget.isDestroyed()) {
    _notifyTarget.webContents.send('games-db:changed');
  }
}
```

- [ ] **Step 2: Wire up in main process**

In desktop `main.ts` (or wherever BrowserWindow is created), after window creation:

```typescript
import { setNotifyTarget } from './game-db';
// after win is created
setNotifyTarget(win);
```

- [ ] **Step 3: Create frontend sync subscriber**

```typescript
// frontend/src/features/game-scanner/db-sync.ts
import { getDesktopAPI } from '@/lib/desktop-api';

type Listener = () => void;

const listeners = new Set<Listener>();
let unsub: (() => void) | null = null;

export function subscribeToGameDbChanges(listener: Listener): () => void {
  listeners.add(listener);
  // Lazy-init the IPC listener
  if (!unsub) {
    const api = getDesktopAPI();
    if (api?.onGamesDbChanged) {
      unsub = api.onGamesDbChanged(() => {
        listeners.forEach(fn => fn());
      });
    }
  }
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 4: Add `onGamesDbChanged` to `DesktopAPI` interface**

```typescript
// In frontend/src/lib/desktop-api.ts
interface DesktopAPI {
  // ... existing fields
  onGamesDbChanged(cb: () => void): () => void;
}
```

- [ ] **Step 5: Commit**

```bash
git add desktop/game-db.ts frontend/src/features/game-scanner/db-sync.ts frontend/src/lib/desktop-api.ts
git commit -m "feat: add games-db change event bus for renderer cache invalidation"
```

---

### Task 4: Strip localStorage from frontend storage layer

**Files:**
- Modify: `frontend/src/features/game-scanner/storage.ts`

- [ ] **Step 1: Replace sync getters with IPC-fetch pattern**

Current `getScannedGames()` returns in-memory cache. Replace with pattern that fetches from DB on demand, maintains optional hot cache:

```typescript
// frontend/src/features/game-scanner/storage.ts (after refactor)
import type { LocalGame } from "./types";
import { hasDesktopAPI as checkDesktopAPI } from "@/lib/desktop-api";

let _cache: LocalGame[] | null = null;
let _paths: { game: string[]; iso: string[] } | null = null;

export function hasDesktopAPI(): boolean {
  return checkDesktopAPI();
}

export async function fetchGames(filter?: any): Promise<LocalGame[]> {
  if (!hasDesktopAPI()) return [];
  const api = (window as any).desktopAPI;
  const games = await api.getScannedGamesFiltered(filter || {});
  _cache = games;
  return games;
}

export async function fetchGameById(id: string): Promise<LocalGame | null> {
  if (!hasDesktopAPI()) return null;
  const api = (window as any).desktopAPI;
  return api.getGameById(id);
}

export async function fetchGameCount(filter?: any): Promise<number> {
  if (!hasDesktopAPI()) return 0;
  const api = (window as any).desktopAPI;
  return api.getGameCount(filter || {});
}

/** Synchronous hot cache — may be stale. Call fetchGames() to refresh. */
export function getCachedGames(): LocalGame[] {
  return _cache || [];
}

export function invalidateCache(): void {
  _cache = null;
  _paths = null;
}

// Paths
export async function fetchScanPaths(): Promise<{ game: string[]; iso: string[] }> {
  if (!hasDesktopAPI()) return { game: [], iso: [] };
  const api = (window as any).desktopAPI;
  const raw = await api.getScanPaths();
  return {
    game: raw.filter((p: any) => p.type === 'game').map((p: any) => p.path),
    iso: raw.filter((p: any) => p.type === 'iso').map((p: any) => p.path),
  };
}

export async function saveScanPathsToServer(paths: string[], isoPaths: string[]): Promise<void> {
  if (!hasDesktopAPI()) return;
  const combined = [
    ...paths.map(p => ({ path: p, type: 'game' })),
    ...isoPaths.map(p => ({ path: p, type: 'iso' })),
  ];
  const api = (window as any).desktopAPI;
  await api.saveScanPaths(combined);
}

// Suggestions
export async function acceptSuggestionOnServer(gameId: string, suggestion: any): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = (window as any).desktopAPI;
  await api.acceptSuggestion(gameId, suggestion);
  invalidateCache();
}

export async function rejectSuggestionOnServer(gameId: string, suggestionMediaId: string): Promise<void> {
  if (!hasDesktopAPI()) return;
  const api = (window as any).desktopAPI;
  await api.rejectSuggestion(gameId, suggestionMediaId);
  invalidateCache();
}

// Keep mergeDuplicateGames and normalizeTitle as pure utils — no side effects
export { mergeDuplicateGames, normalizeTitle } from './storage-utils';
```

- [ ] **Step 2: Remove all localStorage reads/writes**

Strip `cache` object, `localStorage.setItem/getItem` calls, `loadFromDatabase()`, `STORAGE_KEYS`. Remove `_lastScanKey`, `getLastScanTime`, `setLastScanTime` (move to desktop if needed).

- [ ] **Step 3: Remove rejected-suggestion localStorage code**

`rejectedKey`, `rejectedCache`, `getRejectedSet`, `saveRejectedSet`, `rejectSuggestion`, `clearRejectedSuggestion`, `filterRejectedSuggestions` — remove all. Replaced by DB-backed `acceptSuggestionOnServer`/`rejectSuggestionOnServer`.

- [ ] **Step 4: Extract pure utility functions**

Move `normalizeTitle`, `mergeDuplicateGames`, `markGameInstalled`, `updateGamePath` into a separate `storage-utils.ts` file. These are pure functions that don't touch IPC.

- [ ] **Step 5: Remove module-level side effects**

Delete the `if (typeof window !== 'undefined') { ... }` blocks at module level (lines 115-212 in current file). No more auto-loading or localStorage reads at import time.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/game-scanner/
git commit -m "refactor: strip localStorage, make storage layer IPC-only with async fetch pattern"
```

---

### Task 5: Create React Query hooks for game data

**Files:**
- Create: `frontend/src/features/game-scanner/game-queries.ts`
- Modify: `frontend/src/features/games/hooks/use-games.ts`
- Modify: `frontend/src/features/games/hooks/use-local-games.ts`

- [ ] **Step 1: Create query hooks**

```typescript
// frontend/src/features/game-scanner/game-queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGames, fetchGameById, fetchGameCount, acceptSuggestionOnServer, rejectSuggestionOnServer, invalidateCache } from './storage';
import { subscribeToGameDbChanges } from './db-sync';
import { useEffect } from 'react';
import type { LocalGame } from './types';

export const gameKeys = {
  all: ['games'] as const,
  list: (filter?: any) => ['games', 'list', filter] as const,
  detail: (id: string) => ['games', 'detail', id] as const,
  count: (filter?: any) => ['games', 'count', filter] as const,
};

export function useGames(filter?: any) {
  const queryClient = useQueryClient();

  // Auto-invalidate on DB changes from main process
  useEffect(() => {
    return subscribeToGameDbChanges(() => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: gameKeys.list(filter),
    queryFn: () => fetchGames(filter),
  });
}

export function useGameById(id: string | undefined) {
  return useQuery({
    queryKey: gameKeys.detail(id!),
    queryFn: () => fetchGameById(id!),
    enabled: !!id,
  });
}

export function useGameCount(filter?: any) {
  return useQuery({
    queryKey: gameKeys.count(filter),
    queryFn: () => fetchGameCount(filter),
  });
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, suggestion }: { gameId: string; suggestion: any }) =>
      acceptSuggestionOnServer(gameId, suggestion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
}

export function useRejectSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, suggestionMediaId }: { gameId: string; suggestionMediaId: string }) =>
      rejectSuggestionOnServer(gameId, suggestionMediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
}

// useUnseededGames, useSeedTitles — ported from existing, unchanged logic
```

- [ ] **Step 2: Simplify `use-games.ts` to use new hooks**

Replace `useState<LocalGame[]>(() => getScannedGames())` with `useGames()` query. Remove `initialized` ref + auto-match effect (match happens via server-side suggestion). Remove `hasSeeded` ref + seed effect. Remove `filterGamesByTab` call (now filtered at DB level via `useGames({ search, matched })`).

Old pattern:
```typescript
const [localGames, setLocalGames] = useState<LocalGame[]>(() => getScannedGames())
const filteredLocalGames = useMemo(() => filterGamesByTab(...), ...)
```

New pattern:
```typescript
const filter = useMemo(() => ({
  search: localSearchQuery,
  ...(activeTab === 'matched' ? { matched: true } : {}),
  ...(activeTab === 'unmatched' ? { matched: false } : {}),
}), [activeTab, localSearchQuery]);

const { data: localGames = [], isLoading } = useGames(filter);
const { data: matchedGames = [] } = useGames({ matched: true });
const { data: unmatchedGames = [] } = useGames({ matched: false });
```

- [ ] **Step 3: Simplify `use-local-games.ts` similarly**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/game-scanner/game-queries.ts frontend/src/features/games/hooks/
git commit -m "feat: add React Query hooks for IPC-backed game data"
```

---

### Task 6: Remove re-export layer in `games/scanner/`

**Files:**
- Delete: `frontend/src/features/games/scanner/storage.ts`
- Delete: `frontend/src/features/games/scanner/queries.ts`
- Delete: `frontend/src/features/games/scanner/types.ts`
- Modify: all files importing from `@/features/games/scanner/*`

- [ ] **Step 1: Update all imports from `@/features/games/scanner/storage` to `@/features/game-scanner/storage`**

Files to update via grep:
```
frontend/src/features/games/pages/launcher-game-page.tsx
frontend/src/features/games/hooks/use-local-games.ts
```

Both currently import from `@/features/games/scanner/storage`. Change to `@/features/game-scanner/storage`.

- [ ] **Step 2: Update imports from `@/features/games/scanner/queries`**

Same files import `useMatchLocalGames`, `useSyncLocalGames` from `@/features/games/scanner/queries`. The canonical location is `@/features/game-scanner/queries`.

- [ ] **Step 3: Delete the 3 files**

```bash
rm frontend/src/features/games/scanner/storage.ts
rm frontend/src/features/games/scanner/queries.ts  
rm frontend/src/features/games/scanner/types.ts
```

- [ ] **Step 4: Verify compile**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/games/scanner/
git commit -m "refactor: remove re-export layer in games/scanner/, point imports direct to game-scanner"
```

---

### Task 7: Clean up all component-level localStorage reads

**Files:**
- Modify: `frontend/src/features/games/pages/launcher-game-page.tsx`
- Modify: `frontend/src/features/library/molecules/games-launcher.tsx`
- Modify: `frontend/src/features/settings/.../scanners-section.tsx`
- Modify: `frontend/src/features/media/organisms/download-game-button.tsx`
- Modify: `frontend/src/features/media/organisms/media-detail.tsx`
- Modify: `frontend/src/features/library/library-page.tsx`

- [ ] **Step 1: Audit each file for `getScannedGames()`, `setScannedGames()`, `localStorage.getItem('otix_')`**

Each component currently reads from the sync cache:
```typescript
const [games, setGames] = useState<LocalGame[]>(() => getScannedGames())
```

Replace with:
```typescript
const { data: games = [] } = useGames()
```

Remove `setScannedGames()` calls — no longer needed since server is source of truth.

- [ ] **Step 2: Handle rejected suggestions in components**

Replace `filterRejectedSuggestions()` / `rejectSuggestion()` calls with `useAcceptSuggestion()` / `useRejectSuggestion()` mutations. The DB handles filtering automatically.

- [ ] **Step 3: Remove `game:updated` event dispatching**

`setScannedGames()` dispatches `window.dispatchEvent(new CustomEvent('game:updated'))`. Remove this. DB-change events from main process handle invalidation.

- [ ] **Step 4: Clean up `window.addEventListener('game:updated')` in components**

Replace with `useGames()` query that auto-invalidates via `subscribeToGameDbChanges`.

- [ ] **Step 5: Run full TS check + smoke test**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/games/pages/ frontend/src/features/library/ frontend/src/features/settings/ frontend/src/features/media/
git commit -m "refactor: remove all component-level localStorage reads, use IPC-backed queries"
```

</parameter>
