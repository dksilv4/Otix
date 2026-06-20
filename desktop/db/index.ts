// desktop/db/index.ts
import { createMigrationService } from './migration-service'
import migration001 from './migrations/downloads/001_initial'
import migration002 from './migrations/downloads/002_save_tables'
import migration003 from './migrations/downloads/003_active_installs'
import migration004 from './migrations/downloads/004_scanned_games'
import migration005 from './migrations/downloads/005_game_rejected'
import migration006 from './migrations/downloads/006_game_update_tracking'
import pluginsMigration001 from './migrations/plugins/001_initial'

const downloadsMigrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
]

export async function initAllDatabases(): Promise<void> {
  const downloadsService = createMigrationService('downloads')
  downloadsService.runMigrations(downloadsMigrations)

  const pluginsService = createMigrationService('plugins')
  pluginsService.runMigrations([pluginsMigration001])
}

export { closeAllConnections, getConnection, getDbPath, closeConnection } from './connection'
export { createMigrationService } from './migration-service'
export type { Migration, SqlRunner } from './migration-service'
export { DownloadsRepository } from './repositories/downloads'
export type { DownloadRow, CreateDownload } from './repositories/downloads'
export { GamesRepository } from './repositories/games'
export type { ScannedGameRow, CreateScannedGame } from './repositories/games'
export { PluginsRepository } from './repositories/plugins'
export type { PluginRegistryRow } from './repositories/plugins'
