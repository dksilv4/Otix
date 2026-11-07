// desktop/db/connection.ts
// Single source of truth for the desktop app — one SQLite DB (otix.db) used
// by the app and plugins alike. No per-domain files, no separate plugin DB.

import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let _db: Database.Database | null = null
let _dbPath: string = ''

export function getDbPath(): string {
  if (!_dbPath) {
    _dbPath = path.join(app.getPath('userData'), 'otix.db')
  }
  return _dbPath
}

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(getDbPath())
  _db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
    PRAGMA busy_timeout = 5000;
  `)
  return _db
}

export function closeDb(): void {
  if (_db) {
    try {
      _db.close()
    } catch {
      // already closed
    }
    _db = null
  }
}
