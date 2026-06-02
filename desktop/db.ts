import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import Database from 'better-sqlite3';

let db: any = null;

export interface DbRow {
  [key: string]: any;
}

export async function initDb(): Promise<any> {
  if (db) return db;

  try {
    const dbPath = path.join(app.getPath('userData'), 'otix-downloads.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    console.log('[DB] Path:', dbPath, 'exists:', fs.existsSync(dbPath));

    db = new Database(dbPath);
    
    // Compatibility helper to match the sql.js signature for DDL and migrations
    db.run = function (sql: string, params: any[] = []) {
      return this.prepare(sql).run(params);
    };

    // Enable WAL mode for performance
    db.pragma('journal_mode = WAL');

    _createTables();
    _migrateDb();
    console.log('[DB] Tables ready');
    
    // Debug: check row counts
    try {
      const dlCount = db.prepare("SELECT COUNT(*) as cnt FROM downloads").get() as any;
      const cfgCount = db.prepare("SELECT COUNT(*) as cnt FROM download_configs").get() as any;
      console.log('[DB] downloads rows:', dlCount?.cnt);
      console.log('[DB] configs rows:', cfgCount?.cnt);
    } catch (e) {
      console.log('[DB] count query failed:', e);
    }

    // Purge old deleted downloads every hour
    const { purgeOldDeletedDownloads } = require('./downloads');
    purgeOldDeletedDownloads().catch(() => {});
    setInterval(() => purgeOldDeletedDownloads().catch(() => {}), 3600000);
    return db;
  } catch (err) {
    console.error('Failed to open downloads database with better-sqlite3:', err);
    return null;
  }
}

// compatibility stub for sql.js saveDb (no-op since better-sqlite3 writes to disk automatically)
export function _saveDb(): void {}

// ── query helpers using better-sqlite3 ───────────────────────────────────

export function _run(sql: string, params: any[] = []): void {
  if (!db) throw new Error('Database not available — call ensureDb() before any write operation');
  db.prepare(sql).run(params);
}

export function _get(sql: string, params: any[] = []): DbRow | null {
  if (!db) return null;
  return db.prepare(sql).get(params) as DbRow || null;
}

export function _all(sql: string, params: any[] = []): DbRow[] {
  if (!db) return [];
  return db.prepare(sql).all(params) as DbRow[];
}


// ── Schema ────────────────────────────────────────────────────────────────

function _createTables(): void {
  db.run(`
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
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add percentage column if missing
  try {
    db.run("ALTER TABLE downloads ADD COLUMN percentage INTEGER DEFAULT 0");
  } catch (_) {
    /* column exists */
  }
  // Migration: add media_item_title column if missing
  try {
    db.run("ALTER TABLE downloads ADD COLUMN media_item_title TEXT");
  } catch (_) {
    /* column exists */
  }

  db.run(`
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
      preferred_repackers TEXT,
      allow_hypervisor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add auto_organize_enabled column if missing
  try {
    db.run("ALTER TABLE download_configs ADD COLUMN auto_organize_enabled INTEGER NOT NULL DEFAULT 0");
  } catch (_) { /* column exists */ }
  // Migration: add naming_template column if missing
  try {
    db.run("ALTER TABLE download_configs ADD COLUMN naming_template TEXT");
  } catch (_) { /* column exists */ }

  db.run(`
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
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS download_path_mappings (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      dest_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (config_id) REFERENCES download_configs(id) ON DELETE CASCADE
    )
  `);

  db.run(`
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
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_wishlist_tracking_user ON wishlist_download_tracking(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_path_mappings_config ON download_path_mappings(config_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_iso_match_cache_query ON iso_match_cache(query_title)');

  db.run(`
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS game_scan_paths (
      path TEXT PRIMARY KEY,
      type TEXT NOT NULL
    )
  `);

  // Migration: add poster_url column for existing databases
  try {
    db.run('ALTER TABLE scanned_games ADD COLUMN poster_url TEXT');
  } catch {
    // Column already exists — ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS local_games_map (
      media_id TEXT PRIMARY KEY,
      game_json TEXT NOT NULL
    )
  `);
}

function _migrateDb(): void {
  try {
    db.run('ALTER TABLE download_configs ADD COLUMN sabnzbd_complete_path TEXT');
  } catch (_) {}
  try {
    db.run('ALTER TABLE download_configs ADD COLUMN post_process_enabled INTEGER NOT NULL DEFAULT 1');
  } catch (_) {}
  try {
    db.run('ALTER TABLE download_configs ADD COLUMN preferred_repackers TEXT');
  } catch (_) {}
  try {
    db.run('ALTER TABLE download_configs ADD COLUMN allow_hypervisor INTEGER NOT NULL DEFAULT 0');
  } catch (_) {}
}

// Ensure DB is initialized before any operation
let dbReady: Promise<any> | null = null;
export function ensureDb(): Promise<any> {
  if (!dbReady) dbReady = initDb();
  return dbReady;
}
