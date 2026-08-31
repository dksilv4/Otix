// desktop/db/migrations/downloads/012_download_source.ts
// Tag download rows with the source that created them (e.g. 'radarr' vs the
// game/usenet downloader) so the UI can distinguish cancels and provenance.

import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 12,
  name: 'download_source',
  up(sql: SqlRunner) {
    const has = sql
      .getDb()
      .prepare("SELECT 1 AS x FROM pragma_table_info('downloads') WHERE name = 'source'")
      .get()
    if (!has) sql.exec('ALTER TABLE downloads ADD COLUMN source TEXT')
  },
}

export default migration
