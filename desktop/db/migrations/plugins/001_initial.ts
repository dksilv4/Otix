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
        error TEXT,
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
