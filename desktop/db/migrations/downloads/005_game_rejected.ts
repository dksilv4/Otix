// desktop/db/migrations/downloads/005_game_rejected.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 5,
  name: 'game_rejected_suggestions',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_rejected_suggestions (
        id TEXT PRIMARY KEY,
        game_title TEXT NOT NULL,
        game_platform TEXT NOT NULL,
        suggestion_media_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(game_title, game_platform, suggestion_media_id)
      )
    `)
    sql.exec('CREATE INDEX IF NOT EXISTS idx_rejected_suggestions_lookup ON game_rejected_suggestions(game_title, game_platform)')
  },
}

export default migration
