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
