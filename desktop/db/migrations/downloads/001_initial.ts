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
