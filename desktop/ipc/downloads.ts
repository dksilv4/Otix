import { ipcMain } from 'electron';
import {
  getConfig, saveConfig, getDownload, getUserDownloads, deleteDownload,
  searchNzbPlanet, testNzbPlanetConnection, testSabnzbdConnection,
  searchAndDownload, pollAndUpdateDownloads, postProcessDownload,
  filterQualityResults, autoPickBest,
  getWishlistTracking, skipWishlistItem,
  getPathMappings, addPathMapping, removePathMapping,
  getTrackedGames, scheduledUpdateCheck,
} from '../downloads';
import { previewNamingTemplate, validateNamingTemplate } from '../auto-organizer';

export function registerDownloadsIPC(): void {
  ipcMain.handle('downloads:get-config', (_, userId: string) => {
    return getConfig(userId);
  });

  ipcMain.handle('downloads:save-config', (_, config: any) => {
    return saveConfig(config);
  });

  ipcMain.handle('downloads:search', async (_, query: string, apiKey: string) => {
    return await searchNzbPlanet(query, apiKey);
  });

  ipcMain.handle('downloads:scan-wishlist', async (_, userId: string, wishlistGames: { id: string; title: string }[]) => {
    const config = await getConfig(userId);
    if (!config) return { error: 'No download config' };

    const results: { mediaItemId: string; success: boolean; downloadId?: string; error?: string }[] = [];
    for (const game of wishlistGames) {
      const result = await searchAndDownload(userId, game.id, game.title);
      if ('download' in result) {
        results.push({ mediaItemId: game.id, success: true, downloadId: result.download.id });
      } else {
        results.push({ mediaItemId: game.id, success: false, error: result.error });
      }
    }
    return results;
  });

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) => {
    return await searchAndDownload(userId, mediaItemId, gameName, allowHypervisor);
  });

  ipcMain.handle('downloads:filter-results', (_, results: any[]) => {
    return filterQualityResults(results);
  });

  ipcMain.handle('downloads:auto-pick', (_, results: any[], allowHypervisor?: boolean) => {
    return autoPickBest(results, undefined, allowHypervisor);
  });

  ipcMain.handle('downloads:get-download', (_, id: string) => {
    return getDownload(id);
  });

  ipcMain.handle('downloads:get-user-downloads', (_, userId: string) => {
    return getUserDownloads(userId);
  });

  ipcMain.handle('downloads:delete', (_, id: string) => {
    return deleteDownload(id);
  });

  ipcMain.handle('downloads:poll-queue', async (_, userId: string) => {
    return await pollAndUpdateDownloads(userId);
  });

  ipcMain.handle('downloads:test-sabnzbd', async (_, host: string, port: number, apiKey: string, useSsl: boolean) => {
    return await testSabnzbdConnection(host, port, apiKey, useSsl);
  });

  ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey: string) => {
    console.log('[IPC] downloads:test-nzbplanet called, key length:', apiKey?.length ?? 0);
    const result = await testNzbPlanetConnection(apiKey);
    console.log('[IPC] downloads:test-nzbplanet result:', result);
    return result;
  });

  ipcMain.handle('downloads:get-wishlist-tracking', (_, userId: string) => {
    return getWishlistTracking(userId);
  });

  ipcMain.handle('downloads:skip-wishlist-item', (_, userId: string, mediaItemId: string) => {
    return skipWishlistItem(userId, mediaItemId);
  });

  ipcMain.handle('downloads:post-process', (_, downloadId: string, configId: string, fallbackSource?: string, fallbackDest?: string) => {
    return postProcessDownload(downloadId, configId, fallbackSource, fallbackDest);
  });

  ipcMain.handle('downloads:get-path-mappings', async (_, configId: string) => {
    return await getPathMappings(configId);
  });

  ipcMain.handle('downloads:add-path-mapping', async (_, configId: string, sourcePath: string, destPath: string) => {
    return await addPathMapping(configId, sourcePath, destPath);
  });

  ipcMain.handle('downloads:remove-path-mapping', async (_, id: string) => {
    return await removePathMapping(id);
  });

  ipcMain.handle('downloads:get-tracked-game', async () => {
    return await getTrackedGames();
  });

  ipcMain.handle('downloads:check-updates', async () => {
    return await scheduledUpdateCheck();
  });

  // ── Naming template helpers ──────────────────────────────────────────────

  ipcMain.handle('downloads:preview-naming-template', (_, template: string, sampleName: string) => {
    return previewNamingTemplate(template, sampleName);
  });

  ipcMain.handle('downloads:validate-naming-template', (_, template: string) => {
    return validateNamingTemplate(template);
  });
}
