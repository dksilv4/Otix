// desktop/db/plugins-db.ts
// Shared plugins database — single SQLite file for all plugins.
// Table names are auto-prefixed (e.g. "blueprints" → "pluginId_blueprints").

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export interface TableDecl {
  columns: Record<string, string>
  indexes?: string[]
}

export interface DbConfig {
  tables: Record<string, TableDecl>
}

// ── Singleton ────────────────────────────────────────────────────────

let _db: Database.Database | null = null
let _dbPath: string = ''

export function initPluginsDb(userDataPath: string): Database.Database {
  if (_db) return _db

  const pluginsDir = path.join(userDataPath, 'plugins')
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
  }

  _dbPath = path.join(pluginsDir, 'plugins.db')
  _db = new Database(_dbPath)
  _db.pragma('journal_mode = WAL')

  return _db
}

export function getPluginsDb(): Database.Database {
  if (!_db) throw new Error('Plugins DB not initialized — call initPluginsDb first')
  return _db
}

export function getPluginsDbPath(): string {
  return _dbPath
}

// ── Schema auto-migration ────────────────────────────────────────────

/**
 * Ensure the plugin's declared tables exist in the shared DB.
 * Creates missing tables, adds missing columns, creates missing indexes.
 * Idempotent — safe to call on every enable().
 */
export function ensureSchema(pluginId: string, dbConfig: DbConfig): void {
  const db = getPluginsDb()

  for (const [tableName, decl] of Object.entries(dbConfig.tables)) {
    const prefixedName = prefixed(pluginId, tableName)

    // Check if table exists
    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(prefixedName) as { name: string } | undefined

    if (!tableRow) {
      // Create table
      const colDefs = Object.entries(decl.columns)
        .map(([col, def]) => `${col} ${def}`)
        .join(', ')
      db.prepare(`CREATE TABLE "${prefixedName}" (${colDefs})`).run()
    } else {
      // Table exists — add missing columns
      const existingCols = new Set(
        (db.pragma(`table_info("${prefixedName}")`) as { name: string }[]).map(
          (r) => r.name,
        ),
      )
      for (const [col, def] of Object.entries(decl.columns)) {
        if (!existingCols.has(col)) {
          db.prepare(
            `ALTER TABLE "${prefixedName}" ADD COLUMN ${col} ${def}`,
          ).run()
        }
      }
    }

    // Ensure indexes exist
    if (decl.indexes) {
      for (const idxSql of decl.indexes) {
        const prefixedIdxSql = replaceTableNames(idxSql, pluginId, dbConfig)
        try {
          db.prepare(prefixedIdxSql).run()
        } catch (err: any) {
          // Index already exists → ignore
          if (!err.message.includes('already exists')) throw err
        }
      }
    }
  }
}

// ── Table name prefixing ─────────────────────────────────────────────

export function prefixed(pluginId: string, tableName: string): string {
  // Don't double-prefix
  if (tableName.startsWith(pluginId + '_')) return tableName
  return `${pluginId}_${tableName}`
}

/**
 * Replace declared table names in SQL with their prefixed versions.
 * Handles: FROM, JOIN, INTO, UPDATE, TABLE, INSERT INTO
 */
export function replaceTableNames(
  sql: string,
  pluginId: string,
  dbConfig: DbConfig,
): string {
  let result = sql
  for (const tableName of Object.keys(dbConfig.tables)) {
    const prefixedName = prefixed(pluginId, tableName)
    // Escape for regex — table names may have special chars
    const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match table name as a word boundary (not part of a longer word)
    const regex = new RegExp(
      `(?<![\\w"'])${escaped}(?![\\w"'])`,
      'g',
    )
    result = result.replace(regex, prefixedName)
  }
  return result
}

// ── Query helpers ────────────────────────────────────────────────────

export function runQuery(
  pluginId: string,
  dbConfig: DbConfig | null,
  sql: string,
  params?: unknown[],
): void {
  const db = getPluginsDb()
  const finalSql = dbConfig ? replaceTableNames(sql, pluginId, dbConfig) : sql
  db.prepare(finalSql).run(...(params || []))
}

export function getQuery(
  pluginId: string,
  dbConfig: DbConfig | null,
  sql: string,
  params?: unknown[],
): unknown {
  const db = getPluginsDb()
  const finalSql = dbConfig ? replaceTableNames(sql, pluginId, dbConfig) : sql
  return db.prepare(finalSql).get(...(params || [])) || null
}

export function allQuery(
  pluginId: string,
  dbConfig: DbConfig | null,
  sql: string,
  params?: unknown[],
): unknown[] {
  const db = getPluginsDb()
  const finalSql = dbConfig ? replaceTableNames(sql, pluginId, dbConfig) : sql
  return db.prepare(finalSql).all(...(params || []))
}

// ── Migration from per-plugin data.db ────────────────────────────────

/**
 * Migrate a per-plugin data/data.db into the shared plugins.db.
 * Called on first enable after framework upgrade.
 */
export function migratePluginData(
  pluginId: string,
  pluginDir: string,
  dbConfig: DbConfig,
): void {
  const oldDbPath = path.join(pluginDir, 'data', 'data.db')
  if (!fs.existsSync(oldDbPath)) return

  const oldDb = new Database(oldDbPath, { readonly: true })
  const sharedDb = getPluginsDb()

  try {
    for (const [tableName, _decl] of Object.entries(dbConfig.tables)) {
      const prefixedName = prefixed(pluginId, tableName)

      // Check if old table exists
      const exists = oldDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(tableName)

      if (!exists) continue

      // Read all rows from old DB
      const rows = oldDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[]
      if (rows.length === 0) continue

      // Get column names
      const cols = Object.keys(rows[0])
      const placeholders = cols.map(() => '?').join(', ')

      // Insert into shared DB (ignore conflicts — idempotent)
      const insertStmt = sharedDb.prepare(
        `INSERT OR IGNORE INTO "${prefixedName}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
      )

      const insertMany = sharedDb.transaction((batch: Record<string, unknown>[]) => {
        for (const row of batch) {
          insertStmt.run(...cols.map((c) => row[c]))
        }
      })

      insertMany(rows)
    }

    // Rename old DB so we don't migrate again
    fs.renameSync(oldDbPath, oldDbPath + '.migrated')
  } finally {
    oldDb.close()
  }
}
