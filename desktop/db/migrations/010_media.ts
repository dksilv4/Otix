// desktop/db/migrations/010_media.ts
// Shared local media catalog table. Plugins (e.g. Radarr) upsert the media
// they discover locally so the desktop has an offline catalog with no cloud
// dependency. Written via ctx.db against the bare `media` name — plugins must
// be granted `table:media` (see SYSTEM_TABLE_GRANTS in plugins/manager.ts);
// do NOT declare `media` in a plugin's db.tables or it gets namespace-prefixed.

import type { Migration, SqlRunner } from '../migration-service'

const migration: Migration = {
  id: 10,
  name: 'local_media_catalog',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'movie',
        title TEXT,
        year INTEGER,
        overview TEXT,
        poster_url TEXT,
        backdrop_url TEXT,
        genres TEXT,
        runtime INTEGER,
        rating REAL,
        file_path TEXT,
        source_instance TEXT,
        source_instance_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    sql.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_media_provider_id ON media (provider, media_type, provider_id)
    `)
    sql.exec('CREATE INDEX IF NOT EXISTS idx_media_media_type ON media (media_type)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_media_source_instance ON media (source_instance)')
    sql.exec('CREATE INDEX IF NOT EXISTS idx_media_source_instance_id ON media (source_instance_id)')
  },
}

export default migration
