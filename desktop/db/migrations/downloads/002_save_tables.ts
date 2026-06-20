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
