// desktop/db/migrations/008_consolidate.ts
// One-time consolidation of legacy per-domain DB files into the single otix.db.
//
// Before this migration the app spread data across several files:
//   - userData/otix-downloads.db            (older layout)
//   - userData/databases/otix-downloads.db  (downloads/games/saves)
//   - userData/databases/plugins.db         (plugin registry)
//   - userData/plugins/plugins.db           (namespaced per-plugin tables)
//
// This migration copies any data from those files into the consolidated DB and
// renames each source to `<file>.migrated` so it is never read again. It only
// imports into tables the consolidated schema owns, is idempotent (skips
// non-empty targets), and never fails boot on a bad legacy file.

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import type { Migration, SqlRunner } from '../migration-service'

interface LegacySource {
  rel: string[]
  // 'base' = only import tables the consolidated schema declares.
  // 'all'  = import every table verbatim (for the namespaced per-plugin DB).
  mode: 'base' | 'all'
}

const LEGACY_SOURCES: LegacySource[] = [
  { rel: ['otix-downloads.db'], mode: 'base' },
  { rel: ['databases', 'otix-downloads.db'], mode: 'base' },
  { rel: ['databases', 'plugins.db'], mode: 'base' },
  { rel: ['plugins', 'plugins.db'], mode: 'all' },
]

const GAME_MATCHES_DDL = `
  CREATE TABLE IF NOT EXISTS game_matches (
    source TEXT NOT NULL,
    source_game_id TEXT NOT NULL,
    otix_media_id TEXT NOT NULL,
    otix_title TEXT,
    otix_poster_url TEXT,
    otix_backdrop_url TEXT,
    otix_icon_url TEXT,
    otix_confidence REAL,
    match_type TEXT NOT NULL DEFAULT 'auto',
    status TEXT NOT NULL DEFAULT 'approved',
    matched_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (source, source_game_id)
  )
`

const migration: Migration = {
  id: 8,
  name: 'consolidate_legacy_dbs',
  up(sql: SqlRunner) {
    const target = sql.getDb()
    const userData = app.getPath('userData')

    // game_matches is created lazily at runtime (ensureGameMatchesTable), but
    // must exist before we import legacy rows for it.
    target.exec(GAME_MATCHES_DDL)

    for (const src of LEGACY_SOURCES) {
      const legacyPath = path.join(userData, ...src.rel)
      if (!fs.existsSync(legacyPath)) continue

      let legacy: Database.Database | null = null
      try {
        legacy = new Database(legacyPath, { readonly: true })
        const importedAny = copyTables(target, legacy, src.mode)
        if (importedAny) {
          fs.renameSync(legacyPath, legacyPath + '.migrated')
        }
      } catch (err) {
        console.error('[db] consolidate failed for', legacyPath, err)
      } finally {
        legacy?.close()
      }
    }

    // Root-level plugins.db was an empty orphan (schema 0) — the remnant of an
    // older build. Rename it so nothing ever reads from it again.
    const orphanDbPath = path.join(userData, 'plugins.db')
    if (fs.existsSync(orphanDbPath)) {
      let orphan: Database.Database | null = null
      try {
        orphan = new Database(orphanDbPath, { readonly: true })
        const tables = orphan
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all() as { name: string }[]
        if (tables.length === 0) {
          orphan.close()
          orphan = null
          fs.renameSync(orphanDbPath, orphanDbPath + '.migrated')
        }
      } catch (err) {
        console.error('[db] consolidate orphan failed for', orphanDbPath, err)
      } finally {
        orphan?.close()
      }
    }
  },
}

function copyTables(
  target: Database.Database,
  legacy: Database.Database,
  mode: 'base' | 'all',
): boolean {
  const tables = legacy
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]
  let importedAny = false

  for (const { name } of tables) {
    if (name === 'schema_version') continue
    if (mode === 'base' && !tableExists(target, name)) continue
    try {
      if (copyTable(target, legacy, name)) importedAny = true
    } catch (err) {
      console.error('[db] consolidate table failed:', name, err)
    }
  }
  return importedAny
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name)
}

function copyTable(
  target: Database.Database,
  legacy: Database.Database,
  tableName: string,
): boolean {
  if (!tableExists(target, tableName)) {
    // Verbatim copy of a plugin-owned namespaced table.
    const def = legacy
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName) as { sql: string } | undefined
    if (!def?.sql) return false
    target.exec(def.sql)
  }

  const targetCount = (
    target.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get() as { c: number }
  ).c
  if (targetCount > 0) return false

  const legacyCount = (
    legacy.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get() as { c: number }
  ).c
  if (legacyCount === 0) return false

  // Intersect columns with the target schema so schema drift (e.g. a legacy
  // `id` column the consolidated schema dropped) can't abort the whole table.
  const legacyCols = (legacy.pragma(`table_info("${tableName}")`) as { name: string }[]).map(
    (r) => r.name,
  )
  const targetCols = (target.pragma(`table_info("${tableName}")`) as { name: string }[]).map(
    (r) => r.name,
  )
  const cols = legacyCols.filter((c) => targetCols.includes(c))
  if (cols.length === 0) return false

  const placeholders = cols.map(() => '?').join(', ')
  const insert = target.prepare(
    `INSERT OR IGNORE INTO "${tableName}" ("${cols.join('", "')}") VALUES (${placeholders})`,
  )
  const rows = legacy.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[]
  const tx = target.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) insert.run(...cols.map((c) => row[c]))
  })
  tx(rows)
  return true
}

export default migration
