// desktop/db/migrations/013_achievements.ts
// Local persistence for game achievements: schema definitions and player unlocks.
// Supports Windows PC games (Steam, Goldberg, CODEX, RUNE, GOG) and emulators (RetroAchievements).

import type { Migration, SqlRunner } from '../migration-service'

const migration: Migration = {
  id: 13,
  name: 'game_achievements',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS game_achievements (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        app_id TEXT,
        api_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        icon_url TEXT,
        icon_locked_url TEXT,
        hidden INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 10,
        rarity_percentage REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_game_achievements_game_id ON game_achievements(game_id);
      CREATE INDEX IF NOT EXISTS idx_game_achievements_app_id ON game_achievements(app_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_game_achievements_unique ON game_achievements(game_id, api_name);

      CREATE TABLE IF NOT EXISTS unlocked_achievements (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        api_name TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_unlocked_achievements_game_id ON unlocked_achievements(game_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unlocked_achievements_unique ON unlocked_achievements(game_id, api_name);
    `)
  },
}

export default migration
