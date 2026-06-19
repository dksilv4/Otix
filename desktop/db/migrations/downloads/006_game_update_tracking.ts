// desktop/db/migrations/downloads/006_game_update_tracking.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 6,
  name: 'game_update_tracking',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_update_tracking (
        media_item_id TEXT NOT NULL,
        media_item_title TEXT NOT NULL DEFAULT '',
        downloaded_updates TEXT NOT NULL DEFAULT '[]',
        last_update_check TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(media_item_id)
      )
    `)
  },
}

export default migration
