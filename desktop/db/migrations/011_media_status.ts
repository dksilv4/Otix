// desktop/db/migrations/011_media_status.ts
// Add a nullable download-status column to the shared `media` catalog so
// Radarr-synced movies can reflect their live state (missing / downloading /
// downloaded). The Radarr plugin writes it during sync and while polling the
// active download queue.

import type { Migration, SqlRunner } from '../migration-service'

const migration: Migration = {
  id: 11,
  name: 'media_download_status',
  up(sql: SqlRunner) {
    const has = sql
      .getDb()
      .prepare("SELECT 1 AS x FROM pragma_table_info('media') WHERE name = 'status'")
      .get()
    if (!has) {
      sql.exec('ALTER TABLE media ADD COLUMN status TEXT')
      sql.exec('CREATE INDEX IF NOT EXISTS idx_media_status ON media (status)')
    }
  },
}

export default migration
