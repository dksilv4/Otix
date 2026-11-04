// desktop/db/migrations/downloads/014_scanned_games_indexes.ts
// Secondary indexes on scanned_games to eliminate full table scans during
// library scanning, platform filtering, catalog matching, and directory management.

import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 14,
  name: 'scanned_games_indexes',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_scanned_games_platform ON scanned_games(platform);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_otix_media_id ON scanned_games(otix_media_id);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_install_dir ON scanned_games(install_dir);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_exe_path ON scanned_games(exe_path);
    `)
  },
}

export default migration
