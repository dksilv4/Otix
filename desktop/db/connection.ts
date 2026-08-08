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
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
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
