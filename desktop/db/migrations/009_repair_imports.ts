// desktop/db/migrations/009_repair_imports.ts
// Re-imports base tables that migration 008 skipped because of schema drift.
//
// 008's original copyTable prepared INSERTs using the legacy column list, so a
// table whose schema had drifted (e.g. plugin_permissions gained an `id`
// column the consolidated schema dropped) aborted and lost its rows. This
// migration re-runs the import with column-intersection + INSERT OR IGNORE and
// no "target is non-empty" skip, so missed rows are merged into any existing
// data. It is idempotent (dedup via primary/unique keys) and a no-op on
// machines where 008 imported everything cleanly.

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import type { Migration, SqlRunner } from '../migration-service'

const LEGACY_SOURCES: string[][] = [
  ['otix-downloads.db'],
  ['databases', 'otix-downloads.db'],
  ['databases', 'plugins.db'],
  ['plugins', 'plugins.db'],
]

const migration: Migration = {
  id: 9,
  name: 'repair_drifted_imports',
  up(sql: SqlRunner) {
    const target = sql.getDb()
    const userData = app.getPath('userData')

    for (const rel of LEGACY_SOURCES) {
      for (const suffix of ['', '.migrated']) {
        const legacyPath = path.join(userData, ...rel) + suffix
        if (!fs.existsSync(legacyPath)) continue

        let legacy: Database.Database | null = null
        try {
          legacy = new Database(legacyPath, { readonly: true })
          mergeBaseTables(target, legacy)
        } catch (err) {
          console.error('[db] repair failed for', legacyPath, err)
        } finally {
          legacy?.close()
        }
      }
    }
  },
}

function mergeBaseTables(target: Database.Database, legacy: Database.Database): void {
  const tables = legacy
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]

  for (const { name } of tables) {
    if (name === 'schema_version') continue
    if (!tableExists(target, name)) continue // base tables only
    try {
      mergeTable(target, legacy, name)
    } catch (err) {
      console.error('[db] repair table failed:', name, err)
    }
  }
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name)
}

function mergeTable(
  target: Database.Database,
  legacy: Database.Database,
  tableName: string,
): void {
  const legacyCols = (legacy.pragma(`table_info("${tableName}")`) as { name: string }[]).map(
    (r) => r.name,
  )
  const targetCols = (target.pragma(`table_info("${tableName}")`) as { name: string }[]).map(
    (r) => r.name,
  )
  const cols = legacyCols.filter((c) => targetCols.includes(c))
  if (cols.length === 0) return

  const legacyCount = (
    legacy.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get() as { c: number }
  ).c
  if (legacyCount === 0) return

  const placeholders = cols.map(() => '?').join(', ')
  const insert = target.prepare(
    `INSERT OR IGNORE INTO "${tableName}" ("${cols.join('", "')}") VALUES (${placeholders})`,
  )
  const rows = legacy.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[]
  const tx = target.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) insert.run(...cols.map((c) => row[c]))
  })
  tx(rows)
}

export default migration
