// desktop/db/migrations/downloads/015_performance_indexes.ts
// Performance indexes on scanned_games and game_matches to eliminate filesort
// and accelerate sorting by title, recents, and composite platform/media matching.

import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 15,
  name: 'performance_indexes',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_scanned_games_title ON scanned_games(title);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_last_played ON scanned_games(last_played_at);
      CREATE INDEX IF NOT EXISTS idx_scanned_games_plat_media ON scanned_games(platform, otix_media_id);
      CREATE INDEX IF NOT EXISTS idx_game_matches_title ON game_matches(otix_title);
    `)
  },
}

export default migration
