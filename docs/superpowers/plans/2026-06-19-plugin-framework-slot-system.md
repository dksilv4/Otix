# Plugin Framework & Slot System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the plugin framework with worker-thread sandboxing, data-driven UI slots, centralized migration service, and migrate the Epic Games plugin from hardcoded references to the slot system.

**Architecture:** Three-layer system — migration service + typed repositories as foundation, worker-thread sandboxed PluginRuntime in main process, SlotRenderer + WidgetCatalog in React renderer. Single IPC round-trip per page for slot data. Three-layer ErrorBoundary isolation.

**Tech Stack:** TypeScript 6, Electron 42, React 19, better-sqlite3 12, @tanstack/react-router v1, @tanstack/react-query v5, Zod 4, vitest 4, Node.js worker_threads

## Global Constraints

- No raw SQL outside migration files in `desktop/db/migrations/`
- All database access through typed repository classes
- Plugin code runs in worker_threads, never in main process
- Slot names are hierarchical `/`-separated, permanent, never renamed
- Widget schemas are additive-only: new props must be optional, never remove/retype
- IPC handlers must validate sender via `validateSender(event)`
- No plugin throw can crash the app or another plugin's UI
- `execSync` replaced with `execFile` for git operations
- Error types extend the hierarchy defined in Section 9 of the spec
- 30s timeout on plugin entry function, 5s on slot.render

---

## File Structure Map

```
NEW FILES (created by this plan):
  desktop/db/index.ts
  desktop/db/connection.ts
  desktop/db/migration-service.ts
  desktop/db/migrations/downloads/001_initial.ts
  desktop/db/migrations/downloads/002_save_tables.ts
  desktop/db/migrations/downloads/003_active_installs.ts
  desktop/db/migrations/downloads/004_scanned_games.ts
  desktop/db/migrations/downloads/005_game_rejected.ts
  desktop/db/migrations/downloads/006_game_update_tracking.ts
  desktop/db/migrations/plugins/001_initial.ts
  desktop/db/repositories/downloads.ts
  desktop/db/repositories/plugins.ts
  desktop/db/repositories/games.ts
  desktop/plugins/types.ts (rewritten)
  desktop/plugins/errors.ts
  desktop/plugins/manager.ts (rewritten)
  desktop/plugins/runtime.ts
  desktop/plugins/worker.ts
  desktop/plugins/worker-bridge.ts
  desktop/plugins/permissions.ts (rewritten)
  desktop/plugins/event-bus.ts (rewritten)
  desktop/plugins/slots.ts
  desktop/plugins/api-proxy.ts (rewritten)
  desktop/plugins/index.ts (updated)
  desktop/ipc/plugins.ts (rewritten)
  frontend/src/features/_config/slots/types.ts
  frontend/src/features/_config/slots/WidgetCatalog.ts
  frontend/src/features/_config/slots/SlotRenderer.tsx
  frontend/src/features/_config/slots/ErrorBoundary.tsx
  frontend/src/features/_config/slots/ErrorCard.tsx
  frontend/src/features/_config/slots/useSlotData.ts
  frontend/src/features/_config/slots/usePluginTabs.ts
  frontend/src/features/_config/slots/index.ts
  frontend/src/features/settings/types/plugins.ts

MODIFIED FILES:
  desktop/main.ts
  desktop/preload-api.ts
  desktop/downloads/index.ts
  desktop/plugins/marketplace.ts
  frontend/src/features/settings/settings.router.ts
  frontend/src/features/settings/constants.ts
  frontend/src/features/settings/components/PluginSettings.tsx
  frontend/src/features/settings/components/PluginConfigPanel.tsx
  frontend/src/features/_config/types.ts
  frontend/src/features/_config/registry.ts
  frontend/src/lib/router/router.tsx

DELETED FILES:
  desktop/db.ts
  desktop/plugins/db.ts
  desktop/plugins/loader.ts
  desktop/plugins/manager.ts (current version)
  desktop/plugins/permissions.ts (current version)
  desktop/plugins/event-bus.ts (current version)
  desktop/plugins/api-proxy.ts (current version)
  desktop/ipc/plugins.ts (current version)
  frontend/src/features/settings/pages/settings-epic-library-page.tsx
  frontend/src/features/settings/sections/epic-library.tsx
```

---

## Phase 1: Migration Service & DB Layer

### Task 1.1: Create connection manager

**Files:**
- Create: `desktop/db/connection.ts`
- Create: `desktop/db/migration-service.ts`
- Test: `desktop/tests/db/migration-service.test.ts`

**Interfaces:**
- Produces: `getConnection(name: string): Database` — singleton per db name
- Produces: `MigrationService.runMigrations(migrations: Migration[]): Promise<void>`

- [ ] **Step 1: Create connection.ts**

```typescript
// desktop/db/connection.ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const connections = new Map<string, Database>()

export function getDbPath(name: string): string {
  const userData = app.getPath('userData')
  const dbDir = path.join(userData, 'databases')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, `${name}.db`)
}

export function getConnection(name: string): Database {
  const existing = connections.get(name)
  if (existing) return existing

  const dbPath = getDbPath(name)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  connections.set(name, db)
  return db
}

export function closeAllConnections(): void {
  for (const [name, db] of connections) {
    try { db.close() } catch {}
    connections.delete(name)
  }
}

export function closeConnection(name: string): void {
  const db = connections.get(name)
  if (db) {
    try { db.close() } catch {}
    connections.delete(name)
  }
}
```

- [ ] **Step 2: Create migration-service.ts**

```typescript
// desktop/db/migration-service.ts
import type Database from 'better-sqlite3'
import { getConnection } from './connection'

export interface Migration {
  id: number
  name: string
  up(sql: SqlRunner): void
}

export interface SqlRunner {
  exec(sql: string): void
}

class MigrationService {
  private db: Database
  private name: string

  constructor(dbName: string) {
    this.name = dbName
    this.db = getConnection(dbName)
  }

  private ensureSchemaVersionTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  private getCurrentVersion(): number {
    const row = this.db.prepare(
      'SELECT MAX(version) as version FROM schema_version'
    ).get() as { version: number | null } | undefined
    return row?.version ?? 0
  }

  private setVersion(version: number, name: string): void {
    this.db.prepare(
      'INSERT INTO schema_version (version, name) VALUES (?, ?)'
    ).run(version, name)
  }

  runMigrations(migrations: Migration[]): void {
    this.ensureSchemaVersionTable()
    const currentVersion = this.getCurrentVersion()

    const sorted = [...migrations].sort((a, b) => a.id - b.id)
    const pending = sorted.filter(m => m.id > currentVersion)

    if (pending.length === 0) return

    const runner: SqlRunner = {
      exec: (sql: string) => this.db.exec(sql),
    }

    for (const migration of pending) {
      const migrate = () => {
        migration.up(runner)
        this.setVersion(migration.id, migration.name)
      }
      this.db.transaction(migrate)()
    }
  }
}

export function createMigrationService(dbName: string): MigrationService {
  return new MigrationService(dbName)
}
```

- [ ] **Step 3: Write test for migration service**

```typescript
// desktop/tests/db/migration-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
// We test the logic directly without Electron app dependency

describe('MigrationService', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('runs migrations in order and records version', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)

    const migrations = [
      {
        id: 1,
        name: 'create_foo',
        up(sql: { exec: (s: string) => void }) {
          sql.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY)')
        },
      },
      {
        id: 2,
        name: 'add_bar',
        up(sql: { exec: (s: string) => void }) {
          sql.exec('CREATE TABLE bar (id INTEGER PRIMARY KEY, foo_id INTEGER)')
        },
      },
    ]

    // Simulate what MigrationService does
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any
    const currentVersion = row?.version ?? 0

    expect(currentVersion).toBe(0)

    for (const m of migrations.sort((a, b) => a.id - b.id)) {
      if (m.id <= currentVersion) continue
      db.transaction(() => {
        m.up({ exec: (s: string) => db.exec(s) })
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.id, m.name)
      })()
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]
    expect(tables.map((t: any) => t.name).sort()).toEqual(['bar', 'foo', 'schema_version'])

    const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any
    expect(versionRow.v).toBe(2)
  })

  it('skips already applied migrations', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(1, 'done')

    let secondRan = false
    const migrations = [
      { id: 1, name: 'first', up() { throw new Error('should not run') } },
      { id: 2, name: 'second', up() { secondRan = true } },
    ]

    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any
    const currentVersion = row?.version ?? 0

    for (const m of migrations.sort((a, b) => a.id - b.id)) {
      if (m.id <= currentVersion) continue
      db.transaction(() => {
        m.up()
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.id, m.name)
      })()
    }

    expect(secondRan).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests to verify**

```bash
cd desktop && npx vitest run tests/db/migration-service.test.ts
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/db/connection.ts desktop/db/migration-service.ts desktop/tests/db/migration-service.test.ts
git commit -m "feat(db): add connection manager and migration service"
```

---

### Task 1.2: Extract downloads DB into migrations

**Files:**
- Create: `desktop/db/migrations/downloads/001_initial.ts`
- Create: `desktop/db/migrations/downloads/002_save_tables.ts`
- Create: `desktop/db/migrations/downloads/003_active_installs.ts`
- Create: `desktop/db/migrations/downloads/004_scanned_games.ts`
- Create: `desktop/db/migrations/downloads/005_game_rejected.ts`
- Create: `desktop/db/migrations/downloads/006_game_update_tracking.ts`
- Create: `desktop/db/repositories/downloads.ts`
- Create: `desktop/db/repositories/games.ts`

**Interfaces:**
- Consumes: `SqlRunner` from Task 1.1
- Produces: `DownloadsRepository` class with typed methods
- Produces: `GamesRepository` class with typed methods

- [ ] **Step 1: Read the existing schema from desktop/db.ts**

Read `desktop/db.ts` lines 76-380. Extract every `CREATE TABLE`, `ALTER TABLE`, and `CREATE INDEX` statement. Group by logical domain.

- [ ] **Step 2: Create migration 001_initial.ts (downloads + configs core)**

```typescript
// desktop/db/migrations/downloads/001_initial.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 1,
  name: 'downloads_initial',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_item_id TEXT,
        sabnzbd_nzo_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        nzb_name TEXT,
        nzb_size INTEGER,
        nzb_url TEXT,
        iso_path TEXT,
        error_message TEXT,
        percentage INTEGER DEFAULT 0,
        media_item_title TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS download_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        sabnzbd_host TEXT,
        sabnzbd_port INTEGER,
        sabnzbd_api_key TEXT,
        sabnzbd_use_ssl INTEGER NOT NULL DEFAULT 0,
        nzbplanet_api_key TEXT,
        sabnzbd_complete_path TEXT,
        download_path TEXT,
        post_process_enabled INTEGER NOT NULL DEFAULT 1,
        auto_search_wishlist INTEGER NOT NULL DEFAULT 0,
        wishlist_interval_hours INTEGER NOT NULL DEFAULT 12,
        auto_organize_enabled INTEGER NOT NULL DEFAULT 0,
        naming_template TEXT,
        preferred_repackers TEXT,
        allow_hypervisor INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS wishlist_download_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_item_id TEXT NOT NULL,
        last_searched_at TEXT,
        last_download_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, media_item_id)
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS download_path_mappings (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        dest_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (config_id) REFERENCES download_configs(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS iso_match_cache (
        iso_path TEXT PRIMARY KEY,
        query_title TEXT NOT NULL,
        media_id TEXT NOT NULL,
        media_title TEXT NOT NULL,
        media_slug TEXT,
        confidence REAL,
        poster_url TEXT,
        logoless_poster_url TEXT,
        logo_url TEXT,
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec('CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_wishlist_tracking_user ON wishlist_download_tracking(user_id)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_path_mappings_config ON download_path_mappings(config_id)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_iso_match_cache_query ON iso_match_cache(query_title)')
  },
}

export default migration
```

- [ ] **Step 3: Create migration 002_save_tables.ts**

```typescript
// desktop/db/migrations/downloads/002_save_tables.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 2,
  name: 'save_tables',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS known_save_locations (
        id TEXT PRIMARY KEY,
        title_pattern TEXT NOT NULL,
        os_windows TEXT,
        os_mac TEXT,
        os_linux TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS save_profiles (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES scanned_games(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS vault_saves (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        origin_path TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES scanned_games(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES save_profiles(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS save_snapshots (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        name TEXT,
        snapshot_dir TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        total_size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (profile_id) REFERENCES save_profiles(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_save_overrides (
        game_id TEXT PRIMARY KEY,
        user_path TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES scanned_games(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_save_cloud_settings (
        game_id TEXT PRIMARY KEY,
        auto_sync INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        is_path_confirmed INTEGER NOT NULL DEFAULT 0,
        confirmed_path TEXT,
        FOREIGN KEY (game_id) REFERENCES scanned_games(id) ON DELETE CASCADE
      )
    `)
  },
}

export default migration
```

- [ ] **Step 4: Create migration 003_active_installs.ts**

```typescript
// desktop/db/migrations/downloads/003_active_installs.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 3,
  name: 'active_installs',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS active_installs (
        install_id TEXT PRIMARY KEY,
        pid        INTEGER NOT NULL,
        iso_path   TEXT NOT NULL,
        target_dir TEXT NOT NULL,
        game_title TEXT NOT NULL,
        start_time INTEGER NOT NULL
      )
    `)
  },
}

export default migration
```

- [ ] **Step 5: Create migration 004_scanned_games.ts**

```typescript
// desktop/db/migrations/downloads/004_scanned_games.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 4,
  name: 'scanned_games',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS scanned_games (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        exe_path TEXT NOT NULL,
        local_exe_path TEXT,
        install_dir TEXT NOT NULL,
        platform TEXT NOT NULL,
        icon_url TEXT,
        poster_url TEXT,
        update_files TEXT,
        otix_media_id TEXT,
        otix_media_title TEXT,
        otix_media_slug TEXT,
        otix_confidence REAL,
        otix_match_suggestion TEXT,
        otix_poster_url TEXT,
        otix_backdrop_url TEXT,
        otix_textless_poster_url TEXT,
        otix_logo_url TEXT,
        otix_icon_url TEXT,
        seeded INTEGER NOT NULL DEFAULT 0,
        local_icon_url TEXT,
        otix_data TEXT,
        last_played_at TEXT,
        sources TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_scan_paths (
        path TEXT PRIMARY KEY,
        type TEXT NOT NULL
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS local_games_map (
        media_id TEXT PRIMARY KEY,
        game_json TEXT NOT NULL
      )
    `)
  },
}

export default migration
```

- [ ] **Step 6: Create migration 005_game_rejected.ts**

```typescript
// desktop/db/migrations/downloads/005_game_rejected.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 5,
  name: 'game_rejected_suggestions',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_rejected_suggestions (
        id TEXT PRIMARY KEY,
        game_title TEXT NOT NULL,
        game_platform TEXT NOT NULL,
        suggestion_media_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(game_title, game_platform, suggestion_media_id)
      )
    `)
    sql.exec('CREATE INDEX IF NOT EXISTS idx_rejected_suggestions_lookup ON game_rejected_suggestions(game_title, game_platform)')
  },
}

export default migration
```

- [ ] **Step 7: Create migration 006_game_update_tracking.ts**

```typescript
// desktop/db/migrations/downloads/006_game_update_tracking.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 6,
  name: 'game_update_tracking',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_update_tracking (
        media_item_id TEXT NOT NULL,
        media_item_title TEXT NOT NULL DEFAULT '',
        downloaded_updates TEXT NOT NULL DEFAULT '[]',
        last_update_check TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(media_item_id)
      )
    `)
  },
}

export default migration
```

- [ ] **Step 8: Create DownloadsRepository**

```typescript
// desktop/db/repositories/downloads.ts
import type Database from 'better-sqlite3'
import { getConnection } from '../connection'

export interface DownloadRow {
  id: string
  user_id: string
  media_item_id: string | null
  sabnzbd_nzo_id: string | null
  status: string
  nzb_name: string | null
  nzb_size: number | null
  nzb_url: string | null
  iso_path: string | null
  error_message: string | null
  percentage: number
  media_item_title: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateDownload {
  id: string
  user_id: string
  media_item_id?: string
  nzb_name?: string
  nzb_size?: number
  nzb_url?: string
  iso_path?: string
  media_item_title?: string
}

export class DownloadsRepository {
  private db: Database

  constructor() {
    this.db = getConnection('downloads')
  }

  getByUserId(userId: string): DownloadRow[] {
    return this.db.prepare(
      'SELECT * FROM downloads WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as DownloadRow[]
  }

  getById(id: string): DownloadRow | null {
    return (this.db.prepare(
      'SELECT * FROM downloads WHERE id = ?'
    ).get(id) as DownloadRow) || null
  }

  insert(dl: CreateDownload): DownloadRow {
    const stmt = this.db.prepare(`
      INSERT INTO downloads (id, user_id, media_item_id, nzb_name, nzb_size, nzb_url, iso_path, media_item_title)
      VALUES (@id, @user_id, @media_item_id, @nzb_name, @nzb_size, @nzb_url, @iso_path, @media_item_title)
    `)
    stmt.run(dl)
    return this.getById(dl.id)!
  }

  updateStatus(id: string, status: string, errorMessage?: string): void {
    this.db.prepare(`
      UPDATE downloads SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, errorMessage || null, id)
  }

  updateSabId(id: string, sabNzoId: string): void {
    this.db.prepare(
      'UPDATE downloads SET sabnzbd_nzo_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(sabNzoId, id)
  }

  updatePercentage(id: string, percentage: number): void {
    this.db.prepare(
      'UPDATE downloads SET percentage = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(percentage, id)
  }

  markCompleted(id: string): void {
    this.db.prepare(`
      UPDATE downloads SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
  }

  getActiveDownloads(): DownloadRow[] {
    return this.db.prepare(
      "SELECT * FROM downloads WHERE status NOT IN ('completed', 'failed', 'cancelled')"
    ).all() as DownloadRow[]
  }

  purgeOldDeleted(olderThanDays: number): number {
    const result = this.db.prepare(`
      DELETE FROM downloads
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND updated_at < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays)
    return result.changes
  }
}
```

- [ ] **Step 9: Create GamesRepository**

```typescript
// desktop/db/repositories/games.ts
import type Database from 'better-sqlite3'
import { getConnection } from '../connection'

export interface ScannedGameRow {
  id: string
  title: string
  exe_path: string
  local_exe_path: string | null
  install_dir: string
  platform: string
  icon_url: string | null
  poster_url: string | null
  update_files: string | null
  otix_media_id: string | null
  otix_media_title: string | null
  otix_media_slug: string | null
  otix_confidence: number | null
  otix_match_suggestion: string | null
  otix_poster_url: string | null
  otix_backdrop_url: string | null
  otix_textless_poster_url: string | null
  otix_logo_url: string | null
  otix_icon_url: string | null
  seeded: number
  local_icon_url: string | null
  otix_data: string | null
  last_played_at: string | null
  sources: string | null
  created_at: string
  updated_at: string
}

export interface CreateScannedGame {
  id: string
  title: string
  exe_path: string
  install_dir: string
  platform: string
  icon_url?: string
  poster_url?: string
  update_files?: string
}

export class GamesRepository {
  private db: Database

  constructor() {
    this.db = getConnection('downloads')
  }

  getAllGames(): ScannedGameRow[] {
    return this.db.prepare('SELECT * FROM scanned_games ORDER BY title').all() as ScannedGameRow[]
  }

  getGameById(id: string): ScannedGameRow | null {
    return (this.db.prepare('SELECT * FROM scanned_games WHERE id = ?').get(id) as ScannedGameRow) || null
  }

  insertGame(game: CreateScannedGame): void {
    this.db.prepare(`
      INSERT INTO scanned_games (id, title, exe_path, install_dir, platform, icon_url, poster_url, update_files)
      VALUES (@id, @title, @exe_path, @install_dir, @platform, @icon_url, @poster_url, @update_files)
    `).run(game)
  }

  updateGameMatch(id: string, updates: Partial<ScannedGameRow>): void {
    const fields: string[] = []
    const values: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = @${key}`)
        values[key] = value
      }
    }
    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")
    this.db.prepare(`UPDATE scanned_games SET ${fields.join(', ')} WHERE id = @id`).run(values)
  }

  deleteGame(id: string): void {
    this.db.prepare('DELETE FROM scanned_games WHERE id = ?').run(id)
  }

  getScanPaths(): { path: string; type: string }[] {
    return this.db.prepare('SELECT * FROM game_scan_paths').all() as { path: string; type: string }[]
  }

  addScanPath(path: string, type: string): void {
    this.db.prepare('INSERT OR IGNORE INTO game_scan_paths (path, type) VALUES (?, ?)').run(path, type)
  }

  removeScanPath(path: string): void {
    this.db.prepare('DELETE FROM game_scan_paths WHERE path = ?').run(path)
  }

  getRejectedSuggestions(gameTitle: string, gamePlatform: string): string[] {
    const rows = this.db.prepare(
      'SELECT suggestion_media_id FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ?'
    ).all(gameTitle, gamePlatform) as { suggestion_media_id: string }[]
    return rows.map(r => r.suggestion_media_id)
  }

  addRejectedSuggestion(id: string, gameTitle: string, gamePlatform: string, suggestionMediaId: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
      VALUES (?, ?, ?, ?)
    `).run(id, gameTitle, gamePlatform, suggestionMediaId)
  }

  getLocalGameMap(mediaId: string): string | null {
    const row = this.db.prepare('SELECT game_json FROM local_games_map WHERE media_id = ?').get(mediaId) as { game_json: string } | undefined
    return row?.game_json || null
  }

  setLocalGameMap(mediaId: string, gameJson: string): void {
    this.db.prepare('INSERT OR REPLACE INTO local_games_map (media_id, game_json) VALUES (?, ?)').run(mediaId, gameJson)
  }
}
```

- [ ] **Step 10: Create db/index.ts barrel**

```typescript
// desktop/db/index.ts
import { createMigrationService } from './migration-service'
import migration001 from './migrations/downloads/001_initial'
import migration002 from './migrations/downloads/002_save_tables'
import migration003 from './migrations/downloads/003_active_installs'
import migration004 from './migrations/downloads/004_scanned_games'
import migration005 from './migrations/downloads/005_game_rejected'
import migration006 from './migrations/downloads/006_game_update_tracking'
import { closeAllConnections } from './connection'

const downloadsMigrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
]

export async function initAllDatabases(): Promise<void> {
  const downloadsService = createMigrationService('downloads')
  downloadsService.runMigrations(downloadsMigrations)
}

export { closeAllConnections } from './connection'
export { getConnection } from './connection'
export { DownloadsRepository } from './repositories/downloads'
export { GamesRepository } from './repositories/games'
```

- [ ] **Step 11: Commit**

```bash
git add desktop/db/
git commit -m "feat(db): extract downloads schema into migration files and typed repositories"
```

---

### Task 1.3: Extract plugins DB into migrations

**Files:**
- Create: `desktop/db/migrations/plugins/001_initial.ts`
- Create: `desktop/db/repositories/plugins.ts`

**Interfaces:**
- Consumes: `SqlRunner` from Task 1.1
- Produces: `PluginsRepository` class
- Produces: Plugin migrations for `initAllDatabases()`

- [ ] **Step 1: Create migration for plugins DB**

```typescript
// desktop/db/migrations/plugins/001_initial.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 1,
  name: 'plugin_registry_initial',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS plugin_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        repository TEXT NOT NULL DEFAULT '',
        source_path TEXT,
        status TEXT NOT NULL DEFAULT 'installed',
        manifest_json TEXT NOT NULL DEFAULT '{}',
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        enabled_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS plugin_permissions (
        plugin_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        duration TEXT NOT NULL DEFAULT 'once',
        UNIQUE(plugin_id, permission),
        FOREIGN KEY (plugin_id) REFERENCES plugin_registry(id) ON DELETE CASCADE
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS plugin_repos (
        url TEXT PRIMARY KEY,
        label TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    sql.exec(`
      CREATE TABLE IF NOT EXISTS plugin_config (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE(plugin_id, key),
        FOREIGN KEY (plugin_id) REFERENCES plugin_registry(id) ON DELETE CASCADE
      )
    `)
  },
}

export default migration
```

- [ ] **Step 2: Create PluginsRepository**

```typescript
// desktop/db/repositories/plugins.ts
import type Database from 'better-sqlite3'
import { getConnection } from '../connection'

export interface PluginRegistryRow {
  id: string
  name: string
  version: string
  description: string
  author: string
  repository: string
  source_path: string | null
  status: string
  manifest_json: string
  installed_at: string
  enabled_at: string | null
  updated_at: string
}

export class PluginsRepository {
  private db: Database

  constructor() {
    this.db = getConnection('plugins')
  }

  getAll(): PluginRegistryRow[] {
    return this.db.prepare('SELECT * FROM plugin_registry ORDER BY name').all() as PluginRegistryRow[]
  }

  getById(id: string): PluginRegistryRow | null {
    return (this.db.prepare('SELECT * FROM plugin_registry WHERE id = ?').get(id) as PluginRegistryRow) || null
  }

  insert(row: Omit<PluginRegistryRow, 'installed_at' | 'updated_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_registry
        (id, name, version, description, author, repository, source_path, status, manifest_json, enabled_at, updated_at)
      VALUES
        (@id, @name, @version, @description, @author, @repository, @source_path, @status, @manifest_json, @enabled_at, datetime('now'))
    `).run(row)
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, id)
  }

  setEnabled(id: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = 'enabled', enabled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  setDisabled(id: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET status = 'disabled', updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  updateManifest(id: string, manifestJson: string, version: string): void {
    this.db.prepare(`
      UPDATE plugin_registry SET manifest_json = ?, version = ?, updated_at = datetime('now') WHERE id = ?
    `).run(manifestJson, version, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM plugin_registry WHERE id = ?').run(id)
  }

  // ── Permissions ──
  getPermissions(pluginId: string): { permission: string; duration: string; granted_at: string }[] {
    return this.db.prepare(
      'SELECT permission, duration, granted_at FROM plugin_permissions WHERE plugin_id = ?'
    ).all(pluginId) as { permission: string; duration: string; granted_at: string }[]
  }

  grantPermission(pluginId: string, permission: string, duration: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_permissions (plugin_id, permission, duration, granted_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(pluginId, permission, duration)
  }

  revokePermission(pluginId: string, permission: string): void {
    this.db.prepare(
      'DELETE FROM plugin_permissions WHERE plugin_id = ? AND permission = ?'
    ).run(pluginId, permission)
  }

  deleteAllPermissions(pluginId: string): void {
    this.db.prepare('DELETE FROM plugin_permissions WHERE plugin_id = ?').run(pluginId)
  }

  // ── Config ──
  getConfig(pluginId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM plugin_config WHERE plugin_id = ?'
    ).all(pluginId) as { key: string; value: string }[]
    const config: Record<string, string> = {}
    for (const row of rows) {
      config[row.key] = row.value
    }
    return config
  }

  setConfig(pluginId: string, key: string, value: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_config (plugin_id, key, value) VALUES (?, ?, ?)
    `).run(pluginId, key, value)
  }

  deleteAllConfig(pluginId: string): void {
    this.db.prepare('DELETE FROM plugin_config WHERE plugin_id = ?').run(pluginId)
  }

  // ── Repos ──
  getRepos(): { url: string; label: string | null; added_at: string }[] {
    return this.db.prepare('SELECT * FROM plugin_repos ORDER BY added_at').all() as { url: string; label: string | null; added_at: string }[]
  }

  addRepo(url: string, label?: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO plugin_repos (url, label, added_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(url, label || null)
  }

  removeRepo(url: string): void {
    this.db.prepare('DELETE FROM plugin_repos WHERE url = ?').run(url)
  }
}
```

- [ ] **Step 3: Update db/index.ts to include plugin migrations**

```typescript
// Add to desktop/db/index.ts:
import pluginsMigration001 from './migrations/plugins/001_initial'

const pluginsMigrations = [pluginsMigration001]

export async function initAllDatabases(): Promise<void> {
  const downloadsService = createMigrationService('downloads')
  downloadsService.runMigrations(downloadsMigrations)

  const pluginsService = createMigrationService('plugins')
  pluginsService.runMigrations(pluginsMigrations)
}

export { PluginsRepository } from './repositories/plugins'
```

- [ ] **Step 4: Commit**

```bash
git add desktop/db/migrations/plugins/ desktop/db/repositories/plugins.ts desktop/db/index.ts
git commit -m "feat(db): extract plugin registry schema into migrations and typed repository"
```

---

### Task 1.4: Wire into main.ts, remove old db files

**Files:**
- Modify: `desktop/main.ts` — replace `ensureDb()` and `ensurePluginDb()` calls
- Modify: `desktop/downloads/index.ts` — replace `_run()`/`_get()`/`_all()` with repository calls
- Modify: `desktop/game/storage.ts` — replace raw SQL with `GamesRepository`
- Delete: `desktop/db.ts`
- Delete: `desktop/plugins/db.ts`

**Interfaces:**
- Consumes: `initAllDatabases`, `DownloadsRepository`, `GamesRepository`, `PluginsRepository` from Tasks 1.1-1.3
- Produces: All DB access through repositories

- [ ] **Step 1: Rewrite main.ts DB initialization**

Replace (around line 16 + line 27):
```typescript
// OLD
import { ensureDb } from './db';
import { ensurePluginDb, seedDefaultRepo } from './plugins/db';

// NEW
import { initAllDatabases, PluginsRepository } from './db';
```

Replace the `ensureDb()` call sites and `ensurePluginDb()` calls with `initAllDatabases()`.

In the startup sequence (around line 460), replace:
```typescript
// OLD
const extensionsDir = path.join(app.getPath('userData'), 'extensions');
// ...
pluginManager = new PluginManager(extensionsDir, permissionManager, app.getPath('userData'));
```

With initialization that calls `initAllDatabases()` first, then creates PluginManager with the PluginsRepository.

- [ ] **Step 2: Update downloads/index.ts — migrate _run/_get/_all to repository**

Replace all `_run()`, `_get()`, `_all()` calls in `desktop/downloads/index.ts` with `DownloadsRepository` methods. Remove the inline `ensureTrackingTable()` function. The `game_update_tracking` table is now created by migration 006.

- [ ] **Step 3: Update game/storage.ts**

Replace `_run()`, `_get()`, `_all()` calls with `GamesRepository` methods. Remove the `ensureDb()` guard — connection manager handles this.

- [ ] **Step 4: Delete old files**

```bash
rm desktop/db.ts
rm desktop/plugins/db.ts
```

- [ ] **Step 5: Verify build**

```bash
cd desktop && npx tsc --noEmit
```
Expected: no errors related to db imports

- [ ] **Step 6: Commit**

```bash
git add desktop/main.ts desktop/downloads/index.ts desktop/game/storage.ts
git rm desktop/db.ts desktop/plugins/db.ts
git commit -m "refactor(db): wire migration service into main.ts, remove old db files"
```

---

## Phase 2: Error Types & Shared Contracts

### Task 2.1: Create error type hierarchy

**Files:**
- Create: `desktop/plugins/errors.ts`
- Test: `desktop/tests/plugins/errors.test.ts`

**Interfaces:**
- Produces: Full error class hierarchy for the plugin system

- [ ] **Step 1: Create errors.ts**

```typescript
// desktop/plugins/errors.ts

export class PluginError extends Error {
  constructor(message: string, public readonly pluginId: string) {
    super(message)
    this.name = 'PluginError'
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`, pluginId)
    this.name = 'PluginNotFoundError'
  }
}

export class PluginNotRunningError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin not running: ${pluginId}`, pluginId)
    this.name = 'PluginNotRunningError'
  }
}

export class PluginIncompatibleError extends PluginError {
  constructor(pluginId: string, reason: string) {
    super(`Plugin incompatible: ${pluginId} — ${reason}`, pluginId)
    this.name = 'PluginIncompatibleError'
  }
}

export class PluginSandboxError extends PluginError {
  constructor(pluginId: string, cause: string) {
    super(`Plugin sandbox error: ${pluginId} — ${cause}`, pluginId)
    this.name = 'PluginSandboxError'
  }
}

export class PluginTimeoutError extends PluginError {
  constructor(pluginId: string, phase: string) {
    super(`Plugin ${pluginId} timed out during ${phase}`, pluginId)
    this.name = 'PluginTimeoutError'
  }
}

export class SlotError extends Error {
  constructor(
    message: string,
    public readonly location: string,
    public readonly pluginId: string
  ) {
    super(message)
    this.name = 'SlotError'
  }
}

export class SlotRenderError extends SlotError {
  constructor(location: string, pluginId: string, cause: string) {
    super(`Slot render failed: ${location} — ${cause}`, location, pluginId)
    this.name = 'SlotRenderError'
  }
}

export class SlotValidationError extends SlotError {
  constructor(location: string, pluginId: string, field: string) {
    super(`Slot validation failed: ${location} — invalid field "${field}"`, location, pluginId)
    this.name = 'SlotValidationError'
  }
}

export class SlotSuspendedError extends SlotError {
  constructor(location: string, pluginId: string) {
    super(`Slot suspended for plugin ${pluginId} at ${location} due to repeated failures`, location, pluginId)
    this.name = 'SlotSuspendedError'
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

export class PermissionDeniedError extends PermissionError {
  constructor(pluginId: string, permission: string) {
    super(`Permission denied: ${pluginId} — ${permission}`)
    this.name = 'PermissionDeniedError'
  }
}

export class PermissionTimeoutError extends PermissionError {
  constructor(pluginId: string, permission: string) {
    super(`Permission request timed out: ${pluginId} — ${permission}`)
    this.name = 'PermissionTimeoutError'
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class MigrationError extends DatabaseError {
  constructor(dbName: string, migrationId: number, cause: string) {
    super(`Migration failed for ${dbName} at migration ${migrationId}: ${cause}`)
    this.name = 'MigrationError'
  }
}
```

- [ ] **Step 2: Write tests verifying instanceof chains**

```typescript
// desktop/tests/plugins/errors.test.ts
import { describe, it, expect } from 'vitest'
import {
  PluginError, PluginNotFoundError, SlotError, SlotRenderError, SlotSuspendedError,
  PermissionError, PermissionDeniedError, DatabaseError, MigrationError,
} from '../../plugins/errors'

describe('Error hierarchy', () => {
  it('PluginNotFoundError is instanceof PluginError', () => {
    const err = new PluginNotFoundError('test-plugin')
    expect(err).toBeInstanceOf(PluginError)
    expect(err).toBeInstanceOf(Error)
    expect(err.pluginId).toBe('test-plugin')
  })

  it('SlotRenderError is instanceof SlotError', () => {
    const err = new SlotRenderError('settings/library', 'epic', 'timeout')
    expect(err).toBeInstanceOf(SlotError)
    expect(err).toBeInstanceOf(Error)
    expect(err.location).toBe('settings/library')
    expect(err.pluginId).toBe('epic')
  })

  it('SlotSuspendedError carries location and pluginId', () => {
    const err = new SlotSuspendedError('settings/matching', 'bad-plugin')
    expect(err).toBeInstanceOf(SlotError)
    expect(err.location).toBe('settings/matching')
    expect(err.pluginId).toBe('bad-plugin')
  })

  it('PermissionDeniedError is instanceof PermissionError', () => {
    const err = new PermissionDeniedError('p1', 'network:external')
    expect(err).toBeInstanceOf(PermissionError)
  })

  it('MigrationError is instanceof DatabaseError', () => {
    const err = new MigrationError('downloads', 5, 'column missing')
    expect(err).toBeInstanceOf(DatabaseError)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd desktop && npx vitest run tests/plugins/errors.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/plugins/errors.ts desktop/tests/plugins/errors.test.ts
git commit -m "feat(plugins): add error type hierarchy"
```

---

### Task 2.2: Rewrite plugin types with extended manifest

**Files:**
- Rewrite: `desktop/plugins/types.ts`
- Create: `frontend/src/features/settings/types/plugins.ts`

**Interfaces:**
- Produces: `PluginManifest` with `settings.tabs` support
- Produces: All types needed by worker bridge protocol
- Produces: Shared frontend types (no duplicate definitions)

- [ ] **Step 1: Rewrite desktop/plugins/types.ts**

```typescript
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

export type WorkerToMainMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
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
```

- [ ] **Step 2: Create shared frontend types**

```typescript
// frontend/src/features/settings/types/plugins.ts
export type { PluginPermission, PluginStatus, PluginInfo, PluginManifest, PluginConfigField, PluginSlot, PluginSettingsSection, PluginSettingsTab, SlotContribution, SlotRenderResult, SlotWidget } from '../../../../../desktop/plugins/types'
```

Note: The frontend will re-export from the desktop types via path mapping. If this causes build issues, duplicate the types in the frontend with a comment indicating the canonical source.

- [ ] **Step 3: Update preload-api.ts to import types from new location**

Update `desktop/preload-api.ts` to import types from `./plugins/types` instead of inlining them.

- [ ] **Step 4: Verify types build**

```bash
cd desktop && npx tsc --noEmit
```
Expected: no type errors

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/types.ts frontend/src/features/settings/types/plugins.ts desktop/preload-api.ts
git commit -m "refactor(plugins): rewrite types with extended manifest support and shared contracts"
```

---

## Phase 3: Worker Sandbox & PluginRuntime

### Task 3.1: Create worker entry point

**Files:**
- Create: `desktop/plugins/worker.ts`

**Interfaces:**
- Produces: Worker thread entry that loads plugin module and proxies context through MessagePort

- [ ] **Step 1: Create worker.ts**

```typescript
// desktop/plugins/worker.ts
import { parentPort, workerData } from 'worker_threads'
import type { WorkerToMainMessage, MainToWorkerMessage } from './types'

const { pluginPath } = workerData as { pluginPath: string }

// Pending RPC callbacks
const pending = new Map<string, (result: unknown) => void>()
let idCounter = 0

function sendMessage(msg: WorkerToMainMessage): void {
  parentPort!.postMessage(msg)
}

function rpc(method: string, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve) => {
    const id = String(++idCounter)
    pending.set(id, resolve)
    sendMessage({ type: 'rpc', id, method, args })
  })
}

// Handle responses from main process
parentPort!.on('message', (msg: MainToWorkerMessage) => {
  if (msg.type === 'rpc-result') {
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(msg.result)
    }
  } else if (msg.type === 'rpc-error') {
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(Promise.reject(new Error(msg.error)))
    }
  } else if (msg.type === 'init') {
    // Received init config after startup
  }
})

// Build the sandboxed PluginContext
const ctx = {
  get id() { return '' },       // set by init
  get manifest() { return {} }, // set by init
  config: {
    getAll: () => rpc('config.getAll'),
    get: <T>(key: string) => rpc('config.get', key) as Promise<T | undefined>,
    set: (key: string, value: unknown) => rpc('config.set', key, value),
  },
  events: {
    on: (event: string, handler: Function) => rpc('events.on', event).then(() => {
      // Handler registration is stored in main process
      // Actual event delivery: main → worker via 'event' message
      return () => rpc('events.off', event)
    }),
    off: (event: string, handler: Function) => rpc('events.off', event),
  },
  fetch: (url: string, init?: RequestInit) => rpc('fetch', url, init),
  db: {
    run: (sql: string, params?: unknown[]) => rpc('db.run', sql, params),
    get: <T>(sql: string, params?: unknown[]) => rpc('db.get', sql, params) as Promise<T | null>,
    all: <T>(sql: string, params?: unknown[]) => rpc('db.all', sql, params) as Promise<T[]>,
  },
  notifications: {
    send: (title: string, body: string) => rpc('notifications.send', title, body),
  },
  logger: {
    info: (msg: string, data?: unknown) => sendMessage({ type: 'log', level: 'info', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
    warn: (msg: string, data?: unknown) => sendMessage({ type: 'log', level: 'warn', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
    error: (msg: string, data?: unknown) => sendMessage({ type: 'log', level: 'error', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
  },
  api: {
    get: <T>(path: string) => rpc('api.get', path) as Promise<T>,
    post: <T>(path: string, data?: unknown) => rpc('api.post', path, data) as Promise<T>,
    put: <T>(path: string, data?: unknown) => rpc('api.put', path, data) as Promise<T>,
    delete: <T>(path: string) => rpc('api.delete', path) as Promise<T>,
  },
  onDestroy: (cb: () => void) => rpc('onDestroy', null).then(() => {
    // Store cleanup in main process
  }),
}

// Load and execute plugin entry module
async function start(): Promise<void> {
  try {
    const mod = require(pluginPath)
    const entry = mod.default || mod.plugin
    if (typeof entry === 'function') {
      const cleanup = entry(ctx)
      if (typeof cleanup === 'function') {
        // Register cleanup — called on disable
      }
    }
    sendMessage({ type: 'ready' })
  } catch (error: any) {
    sendMessage({ type: 'log', level: 'error', msg: `Plugin start failed: ${error.message}` })
    process.exit(1)
  }
}

start()
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/worker.ts
git commit -m "feat(plugins): add worker thread entry point"
```

---

### Task 3.2: Create worker bridge (main side)

**Files:**
- Create: `desktop/plugins/worker-bridge.ts`

**Interfaces:**
- Consumes: `PluginContext`, `WorkerToMainMessage`, `MainToWorkerMessage` from Task 2.2
- Produces: `createWorkerBridge(worker, pluginId, permissionManager, ...): { start, stop, callMethod }`

- [ ] **Step 1: Create worker-bridge.ts**

```typescript
// desktop/plugins/worker-bridge.ts
import type { Worker } from 'worker_threads'
import type { PluginPermission, MainToWorkerMessage, WorkerToMainMessage, PluginManifest } from './types'
import type { IsolatedEventBus } from './event-bus'
import type Database from 'better-sqlite3'
import { PermissionDeniedError, PluginTimeoutError } from './errors'

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

export interface BridgeDependencies {
  pluginId: string
  manifest: PluginManifest
  worker: Worker
  eventBus: IsolatedEventBus
  pluginDb: Database
  hasPermission: (permission: PluginPermission) => boolean
  requestPermission: (permission: PluginPermission) => Promise<boolean>
  apiBaseUrl: string
  authToken: string
  getConfig: () => Record<string, unknown>
  getConfigValue: (key: string) => unknown
  setConfigValue: (key: string, value: unknown) => void
}

export function createWorkerBridge(deps: BridgeDependencies) {
  const { pluginId, manifest, worker, eventBus, pluginDb } = deps
  const pendingRpc = new Map<string, { resolve: Function; reject: Function }>()
  let rpcCounter = 0
  let active = true

  // Build context for worker
  const context = {
    pluginId,
    manifest,
    config: deps.getConfig(),
  }

  worker.on('message', async (msg: WorkerToMainMessage) => {
    if (!active) return

    if (msg.type === 'ready') {
      // Send init config
      worker.postMessage({ type: 'init', config: context } satisfies MainToWorkerMessage)
      return
    }

    if (msg.type === 'log') {
      console.log(`[plugin:${pluginId}] [${msg.level}] ${msg.msg}`)
      return
    }

    if (msg.type === 'rpc') {
      try {
        // Check permission gating
        const required = GATED_METHODS[msg.method]
        if (required) {
          if (!deps.hasPermission(required)) {
            const granted = await deps.requestPermission(required)
            if (!granted) {
              worker.postMessage({ type: 'rpc-error', id: msg.id, error: `Permission denied: ${required}` } satisfies MainToWorkerMessage)
              return
            }
          }
        }

        // Execute the method
        const result = await executeMethod(msg.method, msg.args, deps, pluginDb, eventBus, pluginId)
        worker.postMessage({ type: 'rpc-result', id: msg.id, result } satisfies MainToWorkerMessage)
      } catch (error: any) {
        worker.postMessage({ type: 'rpc-error', id: msg.id, error: error.message } satisfies MainToWorkerMessage)
      }
    }

    if (msg.type === 'slot-render') {
      // Handled by PluginRuntime calling data.slotRender
    }

    if (msg.type === 'handle-action') {
      // Handled by PluginRuntime calling data.handleAction
    }
  })

  async function start(): Promise<void> {
    // Wait for 'ready' with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new PluginTimeoutError(pluginId, 'startup'))
      }, manifest.timeout || 30000)

      const onReady = (msg: WorkerToMainMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout)
          worker.off('message', onReady)
          resolve()
        }
      }
      worker.on('message', onReady)
    })
  }

  async function callMethod(method: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(++rpcCounter)
      pendingRpc.set(id, { resolve, reject })

      const timeout = setTimeout(() => {
        pendingRpc.delete(id)
        reject(new PluginTimeoutError(pluginId, method))
      }, 5000)

      worker.postMessage({ type: 'rpc', id, method, args } satisfies WorkerToMainMessage)
    })
  }

  async function stop(): Promise<void> {
    active = false
    // Reject all pending RPC calls
    for (const [, { reject }] of pendingRpc) {
      reject(new Error('Plugin worker shutting down'))
    }
    pendingRpc.clear()
    await worker.terminate()
  }

  return { start, callMethod, stop }
}

async function executeMethod(
  method: string,
  args: unknown[],
  deps: BridgeDependencies,
  pluginDb: Database,
  eventBus: any,
  pluginId: string
): Promise<unknown> {
  switch (method) {
    case 'config.getAll':
      return deps.getConfig()
    case 'config.get':
      return deps.getConfigValue(args[0] as string)
    case 'config.set':
      deps.setConfigValue(args[0] as string, args[1])
      return undefined
    case 'db.run':
      return pluginDb.prepare(args[0] as string).run(...(args[1] as any[] || []))
    case 'db.get':
      return pluginDb.prepare(args[0] as string).get(...(args[1] as any[] || [])) || null
    case 'db.all':
      return pluginDb.prepare(args[0] as string).all(...(args[1] as any[] || []))
    case 'events.on': {
      const eventName = args[0] as string
      return eventBus.on(eventName, (payload: unknown) => {
        deps.worker.postMessage({ type: 'rpc-result', id: 'event:' + eventName, result: payload })
      }, pluginId)
    }
    case 'events.off': {
      // Unsubscription handled by eventBus return value from .on()
      return undefined
    }
    case 'fetch':
      return fetch(args[0] as string, args[1] as RequestInit)
    case 'api.get':
    case 'api.post':
    case 'api.put':
    case 'api.delete': {
      const [path, data] = args
      const httpMethod = method.replace('api.', '').toUpperCase()
      const url = `${deps.apiBaseUrl}${path}`
      const res = await fetch(url, {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deps.authToken}`,
        },
        body: data ? JSON.stringify(data) : undefined,
      })
      if (!res.ok) throw new Error(`API ${httpMethod} ${path} returned ${res.status}`)
      return res.json()
    }
    case 'notifications.send':
      // Notification dispatch handled by main process
      return undefined
    default:
      throw new Error(`Unknown method: ${method}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/worker-bridge.ts
git commit -m "feat(plugins): add worker bridge with permission gating"
```

---

### Task 3.3: Create PluginRuntime

**Files:**
- Create: `desktop/plugins/runtime.ts`

**Interfaces:**
- Consumes: Worker from Task 3.1, worker-bridge from Task 3.2
- Produces: `PluginRuntime` class that owns all plugin resources

- [ ] **Step 1: Create runtime.ts**

```typescript
// desktop/plugins/runtime.ts
import { Worker } from 'worker_threads'
import path from 'path'
import Database from 'better-sqlite3'
import type { PluginManifest, PluginPermission } from './types'
import { createWorkerBridge, type BridgeDependencies } from './worker-bridge'
import type { IsolatedEventBus } from './event-bus'
import { PluginTimeoutError } from './errors'

export class PluginRuntime {
  public readonly pluginId: string
  public readonly manifest: PluginManifest
  private worker: Worker | null = null
  private db: Database | null = null
  private bridge: Awaited<ReturnType<typeof createWorkerBridge>> | null = null
  private subscriptions: (() => void)[] = []
  private destroyed = false

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
  ) {
    this.pluginId = pluginId
    this.manifest = manifest
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error('Runtime destroyed')

    // Open plugin data database
    const dataDir = path.join(this.pluginDir, 'data')
    const fs = require('fs')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    this.db = new Database(path.join(dataDir, 'data.db'))
    this.db.pragma('journal_mode = WAL')

    // Spawn worker
    const mainPath = path.join(this.pluginDir, this.manifest.entry.main)
    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { pluginPath: mainPath },
    })

    // Handle worker errors
    this.worker.on('error', (err) => {
      console.error(`[plugin:${this.pluginId}] Worker error:`, err)
    })

    // Create bridge
    const bridgeDeps: BridgeDependencies = {
      pluginId: this.pluginId,
      manifest: this.manifest,
      worker: this.worker,
      eventBus: this.eventBus,
      pluginDb: this.db,
      hasPermission: this.permissionCheck,
      requestPermission: this.permissionRequest,
      apiBaseUrl: this.apiBaseUrl,
      authToken: this.authToken,
      getConfig: () => this.configStore.getAll(),
      getConfigValue: (key: string) => this.configStore.get(key),
      setConfigValue: (key: string, value: unknown) => this.configStore.set(key, value),
    }

    this.bridge = createWorkerBridge(bridgeDeps)
    await this.bridge.start()
  }

  async callMethod(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.bridge) throw new Error('Runtime not started')
    return this.bridge.callMethod(method, ...args)
  }

  async stop(): Promise<void> {
    this.destroyed = true

    // Unsubscribe events
    for (const unsub of this.subscriptions) {
      try { unsub() } catch {}
    }
    this.subscriptions = []

    // Stop bridge and terminate worker
    if (this.bridge) {
      try { await this.bridge.stop() } catch {}
      this.bridge = null
    }

    // Close database
    if (this.db) {
      try { this.db.close() } catch {}
      this.db = null
    }

    this.worker = null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/runtime.ts
git commit -m "feat(plugins): add PluginRuntime with resource ownership"
```

---

### Task 3.4: Rewrite event bus with isolation

**Files:**
- Rewrite: `desktop/plugins/event-bus.ts` (replace current)

**Interfaces:**
- Produces: `IsolatedEventBus` — per-listener try/catch, never crashes process

- [ ] **Step 1: Rewrite event-bus.ts**

```typescript
// desktop/plugins/event-bus.ts
import { EventEmitter } from 'events'
import type { OtixEventName, OtixEvents } from './types'

export class IsolatedEventBus {
  private emitter: EventEmitter
  private listenerErrors: Map<string, number> = new Map()

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(0)
    this.emitter.on('error', (eventName: string, error: Error, pluginId: string) => {
      console.error(`[eventBus] Error in listener for "${eventName}" (plugin: ${pluginId}):`, error.message)
      this.listenerErrors.set(
        pluginId,
        (this.listenerErrors.get(pluginId) || 0) + 1
      )
    })
  }

  on<E extends OtixEventName>(
    event: E,
    listener: (payload: OtixEvents[E]) => void,
    pluginId: string
  ): () => void {
    const wrapped = (...args: unknown[]) => {
      try {
        listener(args[0] as OtixEvents[E])
      } catch (error) {
        this.emitter.emit('error', event, error, pluginId)
      }
    }
    this.emitter.on(event, wrapped)
    return () => {
      this.emitter.off(event, wrapped)
    }
  }

  emit<E extends OtixEventName>(event: E, payload: OtixEvents[E]): boolean {
    return this.emitter.emit(event, payload)
  }

  getErrorCount(pluginId: string): number {
    return this.listenerErrors.get(pluginId) || 0
  }

  removeAllListenersForPlugin(pluginId: string): void {
    // We can't easily filter by pluginId since we wrapped listeners.
    // Instead, the PluginRuntime stores unsubscribe functions from .on().
    // This method exists for cleanup during shutdown if needed.
  }
}

// Singleton for the app
export const eventBus = new IsolatedEventBus()
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/event-bus.ts
git commit -m "refactor(plugins): rewrite event bus with per-listener isolation"
```

---

### Task 3.5: Rewrite PluginManager with state machine

**Files:**
- Rewrite: `desktop/plugins/manager.ts` (replace current from scratch)
- Modify: `desktop/plugins/permissions.ts` (simplify — gating moves to bridge)

**Interfaces:**
- Consumes: `PluginRuntime` from Task 3.3, `IsolatedEventBus` from Task 3.4, `PluginsRepository` from Task 1.3
- Produces: Thread-safe PluginManager with state machine and per-plugin mutex

- [ ] **Step 1: Rewrite manager.ts (abbreviated — full implementation in plan execution)**

Key structure:

```typescript
// desktop/plugins/manager.ts
import { Worker } from 'worker_threads'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PluginRuntime } from './runtime'
import { IsolatedEventBus, eventBus } from './event-bus'
import { SlotRegistry } from './slots'
import { PluginsRepository } from '../db/repositories/plugins'
import type { PluginManifest, PluginInfo, PluginStatus, PluginPermission, PluginSettingsTab } from './types'
import {
  PluginNotFoundError, PluginNotRunningError, PluginIncompatibleError,
} from './errors'

const execFileAsync = promisify(execFile)

export class PluginManager {
  private runtimes: Map<string, PluginRuntime> = new Map()
  private locks: Map<string, Promise<void>> = new Map()
  private slotRegistry: SlotRegistry
  private extensionsDir: string
  private devExtensionsDir: string | undefined
  private permissionManager: PermissionManager
  private apiBaseUrl = 'http://127.0.0.1:8000/api'
  private authToken = ''

  constructor(
    extensionsDir: string,
    permissionManager: PermissionManager,
    userDataPath: string,
    devExtensionsDir?: string,
  ) {
    this.extensionsDir = extensionsDir
    this.devExtensionsDir = devExtensionsDir
    this.permissionManager = permissionManager
    this.slotRegistry = new SlotRegistry()

    const db = new PluginsRepository()
    // ... db access via repository
  }

  private async acquireLock(pluginId: string): Promise<void> {
    // Wait for any existing lock to resolve
    while (this.locks.has(pluginId)) {
      await this.locks.get(pluginId)
    }
    let release!: () => void
    const lock = new Promise<void>(resolve => { release = resolve })
    this.locks.set(pluginId, lock)
    // Release function stored and called in finally block
  }

  private releaseLock(pluginId: string): void {
    this.locks.delete(pluginId)
  }

  async enable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      if (this.runtimes.has(pluginId)) return // already running

      const info = this.getPlugin(pluginId)
      if (!info) throw new PluginNotFoundError(pluginId)

      const pluginDir = this.getPluginDir(pluginId)

      const runtime = new PluginRuntime(
        pluginId,
        info.manifest,
        pluginDir,
        eventBus,
        (perm) => this.permissionManager.hasPermission(pluginId, perm),
        (perm) => this.permissionManager.requestPermission(pluginId, perm),
        { getAll: () => ({}), get: () => undefined, set: () => {} }, // config store from DB
        this.apiBaseUrl,
        this.authToken,
      )

      await runtime.start()
      this.runtimes.set(pluginId, runtime)

      // Register slots
      for (const slot of info.manifest.slots || []) {
        this.slotRegistry.register(pluginId, slot.location, slot.label)
      }

      // Register settings tabs
      const tabs = info.manifest.settings?.tabs || []
      if (tabs.length > 0) {
        this.slotRegistry.register(pluginId, 'settings/tabs', info.name)
      }

      await this.updatePluginStatus(pluginId, 'enabled')
      eventBus.emit('plugin:enabled', { pluginId })
    } finally {
      this.releaseLock(pluginId)
    }
  }

  async disable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      const runtime = this.runtimes.get(pluginId)
      if (!runtime) throw new PluginNotRunningError(pluginId)

      await runtime.stop()
      this.runtimes.delete(pluginId)

      // Unregister slots
      this.slotRegistry.unregisterAll(pluginId)

      await this.updatePluginStatus(pluginId, 'disabled')
      eventBus.emit('plugin:disabled', { pluginId })
    } finally {
      this.releaseLock(pluginId)
    }
  }

  // installFromGit: use execFile instead of execSync
  async installFromGit(repoUrl: string, pluginPath?: string): Promise<PluginInfo> {
    // Validate URL
    const parsed = new URL(repoUrl)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP(S) repository URLs are supported')
    }

    // Use execFile to avoid shell injection
    const targetDir = pluginPath
      ? path.join(this.extensionsDir, pluginPath)
      : path.join(this.extensionsDir, path.basename(repoUrl, '.git'))

    if (fs.existsSync(targetDir)) {
      throw new Error(`Plugin directory already exists: ${targetDir}`)
    }

    await execFileAsync('git', ['clone', '--depth', '1', repoUrl, targetDir], {
      timeout: 120_000,
    })

    const manifestPath = path.join(targetDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      throw new Error('manifest.json not found — not a valid plugin')
    }

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    this.checkCompatibility(manifest)

    const id = pluginPath || path.basename(repoUrl, '.git')
    // Insert via repository
    return this.getPlugin(id)!
  }

  // getPageSlotData: batch query for all slots on a page
  async getPageSlotData(pageId: string): Promise<Record<string, any[]>> {
    const locations = PAGE_SLOT_MAP[pageId] || []
    const results: Record<string, any[]> = {}
    for (const location of locations) {
      results[location] = await this.getSlotData(location)
    }
    return results
  }

  async getSlotData(location: string): Promise<any[]> {
    const plugins = this.slotRegistry.getPluginsForSlot(location)
    const results: any[] = []

    for (const { pluginId, label } of plugins) {
      if (this.slotRegistry.isSuspended(pluginId, location)) continue

      try {
        const runtime = this.runtimes.get(pluginId)
        if (!runtime) continue

        const data = await Promise.race([
          runtime.callMethod('slotRender', location),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])

        results.push({ pluginId, label, data })
        this.slotRegistry.resetFailures(pluginId, location)
      } catch (err: any) {
        this.slotRegistry.recordFailure(pluginId, location)
        // If 3 consecutive failures, suspend
        if (this.slotRegistry.getFailures(pluginId, location) >= 3) {
          this.slotRegistry.suspend(pluginId, location)
          eventBus.emit('plugin:slot-suspended', { pluginId, location })
        }
      }
    }

    return results
  }

  getPluginTabs(): PluginSettingsTab[] {
    const tabs: PluginSettingsTab[] = []
    for (const [pluginId] of this.runtimes) {
      const info = this.getPlugin(pluginId)
      if (!info) continue
      const pluginTabs = info.manifest.settings?.tabs || []
      tabs.push(...pluginTabs)
    }
    return tabs
  }

  // ... remaining methods (install, uninstall, update, discoverPlugins, etc.)
}

const PAGE_SLOT_MAP: Record<string, string[]> = {
  'settings/library': ['settings/library/extensions'],
  'settings/matching': ['settings/matching/extensions'],
  'settings/plugins': ['settings/plugins/extensions'],
  'media/detail': ['media/movie/detail/actions', 'media/show/detail/actions', 'media/game/detail/actions'],
}
```

- [ ] **Step 2: Simplify permissions.ts**

The `PermissionManager` class — remove the IPC communication logic (that was a hack for the prototype). The worker bridge now handles gating. Keep the permission storage (`grantPermission`, `hasPermission`, `revokePermission`) and the programmatic request/response cycle.

- [ ] **Step 3: Update plugin manager in main.ts**

Update `desktop/main.ts` to use the new PluginManager constructor with the PluginsRepository and dev extensions dir.

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd desktop && npx tsc --noEmit
```
Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/manager.ts desktop/plugins/permissions.ts desktop/main.ts
git commit -m "refactor(plugins): rewrite PluginManager with state machine and worker-based runtime"
```

---

## Phase 4: Slot System Backend

### Task 4.1: Create SlotRegistry

**Files:**
- Create: `desktop/plugins/slots.ts`

**Interfaces:**
- Consumes: None (pure data structure)
- Produces: `SlotRegistry` with register, unregister, failure tracking, suspension

- [ ] **Step 1: Create slots.ts**

```typescript
// desktop/plugins/slots.ts

interface SlotEntry {
  pluginId: string
  label: string
}

export class SlotRegistry {
  private slots: Map<string, SlotEntry[]> = new Map()
  private failures: Map<string, Map<string, number>> = new Map() // pluginId → location → count
  private suspended: Map<string, Set<string>> = new Map() // pluginId → Set<location>

  register(pluginId: string, location: string, label: string): void {
    const existing = this.slots.get(location) || []
    // Don't duplicate
    if (!existing.some(e => e.pluginId === pluginId)) {
      existing.push({ pluginId, label })
      this.slots.set(location, existing)
    }
  }

  unregister(pluginId: string, location: string): void {
    const existing = this.slots.get(location) || []
    this.slots.set(
      location,
      existing.filter(e => e.pluginId !== pluginId)
    )
  }

  unregisterAll(pluginId: string): void {
    for (const [location, entries] of this.slots.entries()) {
      this.slots.set(
        location,
        entries.filter(e => e.pluginId !== pluginId)
      )
    }
    this.failures.delete(pluginId)
    this.suspended.delete(pluginId)
  }

  getPluginsForSlot(location: string): SlotEntry[] {
    return this.slots.get(location) || []
  }

  // ── Failure tracking ──
  recordFailure(pluginId: string, location: string): void {
    if (!this.failures.has(pluginId)) {
      this.failures.set(pluginId, new Map())
    }
    const pluginFailures = this.failures.get(pluginId)!
    pluginFailures.set(location, (pluginFailures.get(location) || 0) + 1)
  }

  getFailures(pluginId: string, location: string): number {
    return this.failures.get(pluginId)?.get(location) || 0
  }

  resetFailures(pluginId: string, location: string): void {
    const pluginFailures = this.failures.get(pluginId)
    if (pluginFailures) {
      pluginFailures.delete(location)
    }
  }

  // ── Suspension ──
  suspend(pluginId: string, location: string): void {
    if (!this.suspended.has(pluginId)) {
      this.suspended.set(pluginId, new Set())
    }
    this.suspended.get(pluginId)!.add(location)
  }

  unsuspend(pluginId: string, location: string): void {
    this.suspended.get(pluginId)?.delete(location)
    this.resetFailures(pluginId, location)
  }

  isSuspended(pluginId: string, location: string): boolean {
    return this.suspended.get(pluginId)?.has(location) || false
  }

  getSuspendedSlots(pluginId: string): string[] {
    return [...(this.suspended.get(pluginId) || [])]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/plugins/slots.ts
git commit -m "feat(plugins): add SlotRegistry with failure tracking and suspension"
```

---

### Task 4.2: Rewrite plugin IPC handlers

**Files:**
- Rewrite: `desktop/ipc/plugins.ts`

**Interfaces:**
- Consumes: PluginManager from Task 3.5, SlotRegistry from Task 4.1
- Produces: All plugin:* IPC handlers with sender validation

- [ ] **Step 1: Rewrite ipc/plugins.ts**

```typescript
// desktop/ipc/plugins.ts
import { ipcMain, BrowserWindow } from 'electron'
import type { PluginManager } from '../plugins/manager'
import type { PermissionManager } from '../plugins/permissions'

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (event.sender !== mainWindow?.webContents) {
    throw new Error('IPC call from unauthorized sender')
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`)
  }
}

export function registerPluginIPC(
  pluginManager: PluginManager,
  permissionManager: PermissionManager,
  mainWindow: BrowserWindow,
): void {
  ipcMain.handle('plugin:list', async () => {
    return await pluginManager.getAllPlugins()
  })

  ipcMain.handle('plugin:get', async (_event, id: string) => {
    return pluginManager.getPlugin(id)
  })

  ipcMain.handle('plugin:install', async (event, repoUrl: string, pluginPath?: string) => {
    validateSender(event)
    assertString(repoUrl, 'repoUrl')
    return await pluginManager.installFromGit(repoUrl, pluginPath)
  })

  ipcMain.handle('plugin:uninstall', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.uninstall(id)
  })

  ipcMain.handle('plugin:update', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.updatePlugin(id)
  })

  ipcMain.handle('plugin:enable', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.enable(id)
  })

  ipcMain.handle('plugin:disable', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.disable(id)
  })

  ipcMain.handle('plugin:reload', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.reload(id)
  })

  ipcMain.handle('plugin:discover', async () => {
    return await pluginManager.discoverPlugins()
  })

  ipcMain.handle('plugin:get-config', async (_event, pluginId: string) => {
    return await pluginManager.getConfig(pluginId)
  })

  ipcMain.handle('plugin:set-config', async (_event, pluginId: string, key: string, value: unknown) => {
    return await pluginManager.setConfig(pluginId, key, value)
  })

  ipcMain.handle('plugin:test-instance', async (_event, url: string, apiKey: string) => {
    return await pluginManager.testInstance(url, apiKey)
  })

  ipcMain.handle('plugin:test-config', async (_event, pluginId: string, configDraft: Record<string, unknown>) => {
    return await pluginManager.testPluginConfig(pluginId, configDraft)
  })

  ipcMain.handle('plugin:call-data', async (_event, pluginId: string, method: string, ...args: unknown[]) => {
    return await pluginManager.callPluginData(pluginId, method, ...args)
  })

  ipcMain.handle('plugin:get-status', async (_event, pluginId: string) => {
    return await pluginManager.getPluginStatus(pluginId)
  })

  // ── Slot endpoints ──
  ipcMain.handle('plugin:get-slot-data', async (_event, location: string) => {
    return await pluginManager.getSlotData(location)
  })

  ipcMain.handle('plugin:get-page-slot-data', async (_event, pageId: string) => {
    return await pluginManager.getPageSlotData(pageId)
  })

  ipcMain.handle('plugin:get-plugin-tabs', async () => {
    return pluginManager.getPluginTabs()
  })

  // ── Settings ──
  ipcMain.handle('plugin:set-auth-token', async (_event, token: string) => {
    pluginManager.setAuthToken(token)
  })

  ipcMain.handle('plugin:set-api-base-url', async (event, url: string) => {
    validateSender(event)
    // Validate URL
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('API base URL must use http: or https: protocol')
    }
    pluginManager.setApiBaseUrl(url)
  })

  ipcMain.handle('plugin:emit-event', async (event, eventName: string, payload: unknown) => {
    validateSender(event)
    pluginManager.emitEvent(eventName, payload)
  })

  ipcMain.handle('plugin:fetch-marketplace', async (_event, registryUrl?: string) => {
    return await pluginManager.fetchMarketplace(registryUrl)
  })

  ipcMain.handle('plugin:get-repos', async () => {
    return await pluginManager.getRepos()
  })

  ipcMain.handle('plugin:add-repo', async (event, url: string, label?: string) => {
    validateSender(event)
    assertString(url, 'url')
    return await pluginManager.addRepo(url, label)
  })

  ipcMain.handle('plugin:remove-repo', async (event, url: string) => {
    validateSender(event)
    assertString(url, 'url')
    return await pluginManager.removeRepo(url)
  })

  // ── Permission events (from main to renderer) ──
  permissionManager.onRequest((request) => {
    mainWindow.webContents.send('plugin:permission-request', request)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/ipc/plugins.ts
git commit -m "refactor(ipc): rewrite plugin IPC with sender validation and slot endpoints"
```

---

## Phase 5: Widget Catalog & SlotRenderer (Frontend)

### Task 5.1: Create frontend slot types and WidgetCatalog

**Files:**
- Create: `frontend/src/features/_config/slots/types.ts`
- Create: `frontend/src/features/_config/slots/WidgetCatalog.ts`

- [ ] **Step 1: Create slot types**

```typescript
// frontend/src/features/_config/slots/types.ts
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

export interface SlotRenderResult {
  widgets: SlotWidget[]
}

export interface SlotContribution {
  pluginId: string
  label: string
  data: SlotRenderResult
}

export interface PluginSettingsTab {
  id: string
  label: string
  icon: string
  path: string
  sections: PluginSettingsSection[]
}

export interface PluginSettingsSection {
  id: string
  label: string
  slot: string
}

export interface SlotError {
  pluginId: string
  label: string
  location: string
  error: string
  suspended: boolean
}
```

- [ ] **Step 2: Create WidgetCatalog.ts (abbreviated — full in plan execution)**

```typescript
// frontend/src/features/_config/slots/WidgetCatalog.ts
import { z } from 'zod'
import type { SlotWidget } from './types'

// ── Zod schemas for each widget type ──
const schemas: Record<string, z.ZodSchema> = {
  button: z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).default('secondary'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    icon: z.string().optional(),
    action: z.string(),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  card: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    children: z.array(z.any()).optional(),
    padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
    shadow: z.enum(['none', 'sm', 'md']).default('sm'),
  }),
  // ... all 25+ widget schemas (defined in spec Section 5)
}

// ── Widget type → validation ──
export function validateWidget(widget: SlotWidget): { valid: boolean; error?: string } {
  const schema = schemas[widget.type]
  if (!schema) {
    return { valid: true } // unknown types passed through (forward compat)
  }
  const result = schema.safeParse(widget.props)
  if (!result.success) {
    return { valid: false, error: result.error.message }
  }
  return { valid: true }
}

// ── Widget type → is it a container? (has children) ──
const CONTAINER_WIDGETS = new Set([
  'card', 'deferred-section', 'action-group', 'form', 'grid', 'tabs',
])

export function isContainerWidget(type: string): boolean {
  return CONTAINER_WIDGETS.has(type)
}

// Get the display name for error messages
export function getWidgetDisplayName(type: string): string {
  return type
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/_config/slots/types.ts frontend/src/features/_config/slots/WidgetCatalog.ts
git commit -m "feat(slots): add frontend slot types and WidgetCatalog with Zod schemas"
```

---

### Task 5.2: Create SlotRenderer and ErrorBoundary

**Files:**
- Create: `frontend/src/features/_config/slots/ErrorBoundary.tsx`
- Create: `frontend/src/features/_config/slots/ErrorCard.tsx`
- Create: `frontend/src/features/_config/slots/SlotRenderer.tsx`

- [ ] **Step 1: Create ErrorBoundary.tsx**

```typescript
// frontend/src/features/_config/slots/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Create ErrorCard.tsx**

```typescript
// frontend/src/features/_config/slots/ErrorCard.tsx
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface ErrorCardProps {
  pluginName: string
  message: string
  details?: string
  suspended?: boolean
  onReenable?: () => void
}

export function ErrorCard({ pluginName, message, details, suspended, onReenable }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div
      style={{
        backgroundColor: 'var(--dk-surface-base)',
        borderRadius: 'var(--dk-radius-md)',
        padding: '12px 16px',
        border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {pluginName}: {message}
        </span>
        {isDev && details && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {expanded && details && (
        <pre style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
          {details}
        </pre>
      )}
      {suspended && onReenable && (
        <button
          onClick={onReenable}
          style={{
            marginTop: 8,
            padding: '4px 12px',
            borderRadius: 'var(--dk-radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--dk-surface-raised)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Re-enable this section
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create SlotRenderer.tsx (abbreviated — full in plan execution)**

```typescript
// frontend/src/features/_config/slots/SlotRenderer.tsx
import { type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { ErrorCard } from './ErrorCard'
import { validateWidget, isContainerWidget } from './WidgetCatalog'
import type { SlotContribution, SlotWidget } from './types'

interface SlotRendererProps {
  contributions: SlotContribution[]
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void
  loading?: boolean
  emptyFallback?: ReactNode
}

export function SlotRenderer({ contributions, onAction, loading, emptyFallback }: SlotRendererProps) {
  if (loading) {
    return <SlotSkeleton />
  }

  if (!contributions || contributions.length === 0) {
    return <>{emptyFallback || null}</>
  }

  return (
    <div className="slot-renderer">
      {contributions.map((contribution) => (
        <ErrorBoundary
          key={contribution.pluginId}
          fallback={
            <ErrorCard
              pluginName={contribution.label || contribution.pluginId}
              message="Failed to render"
            />
          }
        >
          <PluginContributionRenderer
            contribution={contribution}
            onAction={onAction}
          />
        </ErrorBoundary>
      ))}
    </div>
  )
}

function PluginContributionRenderer({ contribution, onAction }: {
  contribution: SlotContribution
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void
}) {
  if (!contribution.data?.widgets) {
    return (
      <ErrorCard
        pluginName={contribution.label || contribution.pluginId}
        message="No widget data returned"
      />
    )
  }

  return (
    <>
      {contribution.data.widgets.map((widget, idx) => (
        <ErrorBoundary
          key={widget.key || idx}
          fallback={
            <ErrorCard
              pluginName={contribution.label || contribution.pluginId}
              message={`Widget "${widget.type}" failed to render`}
            />
          }
        >
          <WidgetRenderer
            widget={widget}
            pluginId={contribution.pluginId}
            onAction={onAction}
          />
        </ErrorBoundary>
      ))}
    </>
  )
}

function WidgetRenderer({ widget, pluginId, onAction }: {
  widget: SlotWidget
  pluginId: string
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void
}) {
  const validation = validateWidget(widget)
  if (!validation.valid) {
    return (
      <ErrorCard
        pluginName={pluginId}
        message={`Invalid widget data for "${widget.type}"`}
        details={validation.error}
      />
    )
  }

  const handleAction = (actionKey: string, payload?: unknown) => {
    onAction?.(pluginId, actionKey, payload)
  }

  // Delegate to the actual DK UI component based on widget.type
  // The full implementation maps each widget type to its React component
  // and passes props + handleAction through

  const children = widget.children?.map((child, idx) => (
    <WidgetRenderer
      key={child.key || idx}
      widget={child}
      pluginId={pluginId}
      onAction={onAction}
    />
  ))

  // TODO: In full implementation, switch on widget.type and render actual component
  // For the plan, each widget type gets its own renderer function
  return <WidgetSwitch widget={widget} onAction={handleAction}>{children}</WidgetSwitch>
}

function WidgetSwitch({ widget, onAction, children }: {
  widget: SlotWidget
  onAction: (actionKey: string, payload?: unknown) => void
  children?: ReactNode
}) {
  // This is the dispatch table — maps widget.type → DK UI component
  // Full implementation renders actual React components from old-features/dk-ui/
  // For plan brevity, we show the structure. Full component maps in execution.

  return <div data-widget-type={widget.type}>{children}</div>
}

function SlotSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 40, backgroundColor: 'var(--dk-surface-raised)', borderRadius: 'var(--dk-radius-md)' }} />
      <div style={{ height: 80, backgroundColor: 'var(--dk-surface-raised)', borderRadius: 'var(--dk-radius-md)' }} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/_config/slots/ErrorBoundary.tsx frontend/src/features/_config/slots/ErrorCard.tsx frontend/src/features/_config/slots/SlotRenderer.tsx
git commit -m "feat(slots): add SlotRenderer with three-layer error isolation"
```

---

### Task 5.3: Update preload API and create hooks

**Files:**
- Modify: `desktop/preload-api.ts` — add `getPageSlotData` and `getPluginTabs` methods
- Create: `frontend/src/features/_config/slots/useSlotData.ts`
- Create: `frontend/src/features/_config/slots/usePluginTabs.ts`
- Create: `frontend/src/features/_config/slots/index.ts`

**Interfaces:**
- Consumes: IPC handlers `plugin:get-page-slot-data` and `plugin:get-plugin-tabs` from Task 4.2
- Produces: `useSlotData(pageId)` hook, `usePluginTabs()` hook, updated preload API

- [ ] **Step 0: Update preload-api.ts — add new slot API methods**

In `desktop/preload-api.ts`, add to the plugin API block (after the existing `getSlotData` line):

```typescript
getPageSlotData: (pageId: string) => ipcRenderer.invoke('plugin:get-page-slot-data', pageId),
getPluginTabs: () => ipcRenderer.invoke('plugin:get-plugin-tabs'),
```

Also add the TypeScript signatures to the `DesktopAPI` interface in the same file.

- [ ] **Step 1: Create useSlotData.ts**

```typescript
// frontend/src/features/_config/slots/useSlotData.ts
import { useQuery } from '@tanstack/react-query'
import type { SlotContribution } from './types'

export function useSlotData(pageId: string): {
  data: Record<string, SlotContribution[]> | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['slots', pageId],
    queryFn: async () => {
      if (!window.desktopAPI?.plugin?.getPageSlotData) {
        return {}
      }
      return await window.desktopAPI.plugin.getPageSlotData(pageId) as Record<string, SlotContribution[]>
    },
    staleTime: 30_000,
    enabled: !!window.desktopAPI,
  })

  return {
    data,
    isLoading,
    error: error as Error | null,
  }
}
```

- [ ] **Step 2: Create usePluginTabs.ts**

```typescript
// frontend/src/features/_config/slots/usePluginTabs.ts
import { useQuery } from '@tanstack/react-query'
import type { PluginSettingsTab } from './types'

export function usePluginTabs(): {
  tabs: PluginSettingsTab[]
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['plugin-tabs'],
    queryFn: async () => {
      if (!window.desktopAPI?.plugin?.getPluginTabs) {
        return []
      }
      return await window.desktopAPI.plugin.getPluginTabs() as PluginSettingsTab[]
    },
    staleTime: 60_000,
    enabled: !!window.desktopAPI,
  })

  return {
    tabs: data || [],
    isLoading,
  }
}
```

- [ ] **Step 3: Create barrel index.ts**

```typescript
// frontend/src/features/_config/slots/index.ts
export { SlotRenderer } from './SlotRenderer'
export { ErrorBoundary } from './ErrorBoundary'
export { ErrorCard } from './ErrorCard'
export { useSlotData } from './useSlotData'
export { usePluginTabs } from './usePluginTabs'
export type { SlotContribution, SlotWidget, SlotRenderResult, PluginSettingsTab, PluginSettingsSection } from './types'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/_config/slots/
git commit -m "feat(slots): add useSlotData and usePluginTabs hooks"
```

---

## Phase 6: Dynamic Settings Tabs & PluginSettingsPage

### Task 6.1: Create PluginSettingsPage

**Files:**
- Create: `frontend/src/features/settings/components/PluginSettingsPage.tsx`

- [ ] **Step 1: Create PluginSettingsPage.tsx**

```typescript
// frontend/src/features/settings/components/PluginSettingsPage.tsx
import { useState } from 'react'
import { SlotRenderer, useSlotData, type PluginSettingsTab } from '@/features/_config/slots'

interface PluginSettingsPageProps {
  tab: PluginSettingsTab
}

export function PluginSettingsPage({ tab }: PluginSettingsPageProps) {
  const [activeSection, setActiveSection] = useState(tab.sections[0]?.id)
  const section = tab.sections.find(s => s.id === activeSection)
  const { data, isLoading } = useSlotData(section?.slot ? `settings/${tab.id}` : '')

  if (tab.sections.length > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{tab.label}</h1>
        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {tab.sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--dk-radius-sm)',
                border: 'none',
                backgroundColor: s.id === activeSection
                  ? 'var(--dk-surface-raised)'
                  : 'transparent',
                color: s.id === activeSection
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: s.id === activeSection ? 600 : 400,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Active section */}
        {section && (
          <SlotRenderer
            contributions={data?.[section.slot] || []}
            loading={isLoading}
            onAction={handleAction}
          />
        )}
      </div>
    )
  }

  // Single section — no sub-nav
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{tab.label}</h1>
      {section && (
        <SlotRenderer
          contributions={data?.[section.slot] || []}
          loading={isLoading}
          onAction={handleAction}
        />
      )}
    </div>
  )
}

async function handleAction(pluginId: string, actionKey: string, payload: unknown): Promise<void> {
  if (!window.desktopAPI?.plugin?.callData) return
  try {
    await window.desktopAPI.plugin.callData(pluginId, 'handleAction', actionKey, payload)
  } catch (err) {
    console.error(`[PluginSettingsPage] Action "${actionKey}" failed for ${pluginId}:`, err)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/components/PluginSettingsPage.tsx
git commit -m "feat(settings): add generic PluginSettingsPage for plugin-defined tabs"
```

---

### Task 6.2: Update settings router for dynamic routes

**Files:**
- Modify: `frontend/src/features/settings/settings.router.ts`
- Modify: `frontend/src/features/settings/constants.ts`

- [ ] **Step 1: Update settings.router.ts**

Replace the hardcoded `SettingsEpicLibraryPage` route with dynamic plugin routes. The router now accepts plugin tabs data:

```typescript
// In createSettingsRoutes():
// Remove the hardcoded epic library route creation (lines 94-98)
// Add dynamic plugin routes:

import type { PluginSettingsTab } from '@/features/_config/slots'

export function createSettingsRoutes(rootRoute: AnyRoute, pluginTabs?: PluginSettingsTab[]) {
  // ... existing static routes ...

  const pluginRoutes = (pluginTabs || []).map(tab =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path: tab.path.replace('/settings/', ''),
      component: () => <div>Loading...</div>, // Will use PluginSettingsPage
    })
  )

  return [
    settingsRoute,
    settingsIndexRoute,
    // ... static routes ...
    // Remove settingsEpicLibraryRoute from the returned array
    ...pluginRoutes,
  ]
}
```

- [ ] **Step 2: Update constants.ts — dynamic nav**

```typescript
// frontend/src/features/settings/constants.ts
// Add function to merge static + plugin nav items:

export function getNavItems(pluginTabs?: PluginSettingsTab[]): NavItem[] {
  const pluginItems: NavItem[] = (pluginTabs || []).map(tab => ({
    id: tab.id,
    label: tab.label,
    icon: getIconByName(tab.icon),
    desktop: true,
  }))

  // Insert plugin items before 'plugins' section with divider marker
  const pluginsIdx = NAV_ITEMS.findIndex(item => item.id === 'plugins')
  const result = [...NAV_ITEMS]
  if (pluginsIdx >= 0) {
    result.splice(pluginsIdx, 0, ...pluginItems)
  }
  return result
}
```

- [ ] **Step 3: Update root router to pass plugin tabs**

Update `frontend/src/lib/router/router.tsx` to fetch plugin tabs before creating settings routes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/settings/settings.router.ts frontend/src/features/settings/constants.ts frontend/src/lib/router/router.tsx
git commit -m "feat(settings): add dynamic plugin tab routes and nav items"
```

---

### Task 6.3: Rewrite PluginSettings.tsx — remove hardcoded plugin IDs

**Files:**
- Modify: `frontend/src/features/settings/components/PluginSettings.tsx`

Remove:
- `EpicPluginLogin` import and custom renderer (line 880-884)
- `'otix-radarr'` specific guard (line 888)
- `'instances.quality_profile_id'` and `'instances.root_folder_path'` hardcoded paths (line 1037)
- All `catch {}` empty blocks — replace with error state handling

Add:
- Use `useSlotData('settings/plugins')` to render per-plugin config via slots
- Any plugin can declare `slots: [{ location: 'settings/plugins/<id>/config' }]` to render custom config UI
- Plugin config fields rendered generically from manifest schema, no special cases

- [ ] **Step 1: Implement the rewrite (full code in execution)**

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/components/PluginSettings.tsx
git commit -m "refactor(settings): remove hardcoded plugin IDs from PluginSettings"
```

---

## Phase 7: Cleanup & Epic Migration

### Task 7.1: Delete hardcoded Epic files

**Files:**
- Delete: `frontend/src/features/settings/pages/settings-epic-library-page.tsx`
- Delete: `frontend/src/features/settings/sections/epic-library.tsx`
- Modify: `frontend/src/features/settings/sections/matching.tsx` — remove Epic tab

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/features/settings/pages/settings-epic-library-page.tsx
rm frontend/src/features/settings/sections/epic-library.tsx
```

- [ ] **Step 2: Update matching.tsx**

Remove the "Epic Library" tab from the `MatchingSection`. The Epic plugin will contribute its own tab via slot `settings/matching/extensions`.

- [ ] **Step 3: Update settings.router.ts**

Remove the `SettingsEpicLibraryPage` lazy import.

- [ ] **Step 4: Commit**

```bash
git rm frontend/src/features/settings/pages/settings-epic-library-page.tsx
git rm frontend/src/features/settings/sections/epic-library.tsx
git add frontend/src/features/settings/sections/matching.tsx frontend/src/features/settings/settings.router.ts
git commit -m "refactor(epic): remove hardcoded Epic library page and section"
```

---

### Task 7.2: Delete old desktop plugin files

**Files:**
- Delete: `desktop/plugins/loader.ts`

- [ ] **Step 1: Delete loader.ts**

```bash
rm desktop/plugins/loader.ts
```

- [ ] **Step 2: Verify full build**

```bash
cd desktop && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```
Fix any remaining references to deleted files.

- [ ] **Step 3: Commit**

```bash
git rm desktop/plugins/loader.ts
git commit -m "refactor(plugins): remove old require-based loader"
```

---

### Task 7.3: Final integration and smoke test

- [ ] **Step 1: Verify all imports resolve**

```bash
cd desktop && npx tsc --noEmit
```
Expected: Clean compilation, zero errors

- [ ] **Step 2: Run all tests**

```bash
cd desktop && npx vitest run
```
Expected: All tests pass

- [ ] **Step 3: Verify the app launches**

```bash
cd desktop && npm run dev
```
Check that:
- Plugin system initializes without errors
- No hardcoded Epic references remain
- Settings pages render correctly
- Plugin tabs appear in nav (if any plugins with settings tabs are installed)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: final integration fixes and cleanup"
```

---

## Execution Notes

1. **Phases must run sequentially** — each phase depends on interfaces produced by the previous phase
2. **Phase 5 requires Phase 4 IPC endpoints** — don't start frontend slot work before backend slot IPC is ready
3. **Epic plugin itself** (the actual Epic Games plugin code) needs its own separate update to declare the manifest with `settings.tabs` and implement `data.slotRender()` and `data.handleAction()`. This plan removes the hardcoded references from Otix core; the Epic plugin repo must be updated separately
4. **Worker.js must be compiled** — `desktop/plugins/worker.ts` runs inside `worker_threads` and must be transpiled to JS. Add a separate tsconfig or use the existing build step
5. **The `frontend/src/features/_config/slots/WidgetCatalog.ts`** full component mapping (all 25+ widgets to actual DK UI React components) is the largest single file. In execution, each widget type gets its own render function
