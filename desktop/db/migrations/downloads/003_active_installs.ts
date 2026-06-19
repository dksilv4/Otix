// desktop/db/migrations/downloads/003_active_installs.ts
import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 3,
  name: 'active_installs',
  up(sql: SqlRunner) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS active_installs (
        install_id TEXT PRIMARY KEY,
        pid        INTEGER NOT NULL,
        iso_path   TEXT NOT NULL,
        target_dir TEXT NOT NULL,
        game_title TEXT NOT NULL,
        start_time INTEGER NOT NULL
      )
    `)
  },
}

export default migration
