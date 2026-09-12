// desktop/db/index.ts
// Single-source-of-truth database bootstrap. All migrations — downloads,
// games, saves, plugins, and the legacy consolidation — run against the one
// otix.db connection.

import { createMigrationService } from './migration-service'
import migration001 from './migrations/downloads/001_initial'
import migration002 from './migrations/downloads/002_save_tables'
import migration003 from './migrations/downloads/003_active_installs'
import migration004 from './migrations/downloads/004_scanned_games'
import migration005 from './migrations/downloads/005_game_rejected'
import migration006 from './migrations/downloads/006_game_update_tracking'
import pluginsMigration001 from './migrations/plugins/001_initial'
import migration008 from './migrations/008_consolidate'
import migration009 from './migrations/009_repair_imports'
import migration010 from './migrations/010_media'
import migration011 from './migrations/011_media_status'
import migration012 from './migrations/downloads/012_download_source'

// Sequential chain against one schema_version table. The plugin migration was
// id 1 in its own file; it becomes id 7 in the consolidated chain.
const migrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  { ...pluginsMigration001, id: 7 },
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
]

export async function initDatabase(): Promise<void> {
  createMigrationService().runMigrations(migrations)
}

export { closeDb, getDb, getDbPath } from './connection'
export { createMigrationService } from './migration-service'
export type { Migration, SqlRunner } from './migration-service'
export { DownloadsRepository } from './repositories/downloads'
export type { DownloadRow, CreateDownload } from './repositories/downloads'
export { GamesRepository } from './repositories/games'
export type { ScannedGameRow, CreateScannedGame } from './repositories/games'
export { PluginsRepository } from './repositories/plugins'
export type { PluginRegistryRow } from './repositories/plugins'
