/* ── Save export/import helpers ── */

import { SaveDaemon } from './index';
import { SAVE_LOCATIONS } from './locations';

/**
 * Export a profile to a .otixsave directory (zippable by the user).
 * Returns the export path.
 */
export async function exportProfile(daemon: SaveDaemon, profileId: string, targetDir: string): Promise<string> {
  return daemon.exportProfile(profileId, targetDir);
}

/**
 * Import saves from a directory (previously exported .otixsave or any save folder).
 * Returns the new profile ID.
 */
export async function importSaves(daemon: SaveDaemon, gameId: string, sourceDir: string): Promise<string> {
  return daemon.importSaves(gameId, sourceDir);
}

/**
 * Populate the DB with the built-in known save locations.
 */
export async function populateKnownLocations(daemon: SaveDaemon): Promise<void> {
  try {
    await daemon.populateKnownLocations(SAVE_LOCATIONS.games);
    console.log(`[SaveExport] Populated ${SAVE_LOCATIONS.games.length} known save locations`);
  } catch (err) {
    console.error('[SaveExport] Failed to populate known save locations:', err);
  }
}
