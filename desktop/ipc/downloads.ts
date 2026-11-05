import { ipcMain, BrowserWindow } from 'electron';
import { getDb } from '../db';
import {
  getConfig,
  saveConfig,
  getDownload,
  getUserDownloads,
  getWishlistTracking,
  skipWishlistItem,
  getPathMappings,
  addPathMapping,
  removePathMapping,
} from '../framework/downloads';
import {
  searchNzbPlanet,
  testNzbPlanetConnection,
  testSabnzbdConnection,
  searchAndDownload,
  pollAndUpdateDownloads,
  postProcessDownload,
  scanWishlist,
  deleteDownloadWithJob,
  scheduledUpdateCheck,
  filterQualityResults,
  autoPickBest,
} from '../downloads/downloader';
import { previewNamingTemplate, validateNamingTemplate } from '../downloads/organizer';
import { getRemoteDownloadManager, type RemoteDownloadOptions } from '../downloads/remote-downloader';

// ── IPC handler registration ─────────────────────────────────────────────

export function registerDownloadsIPC(): void {
  // ── Config (direct DB access) ──────────────────────────────────────────

  ipcMain.handle('downloads:get-config', (_, userId: string) => {
    return getConfig(userId);
  });

  ipcMain.handle('downloads:save-config', (_, config: any) => {
    return saveConfig(config);
  });

  // ── Search & Filter (native implementation) ────────────────────────────

  ipcMain.handle('downloads:search', async (_, query: string, apiKey?: string) => {
    return await searchNzbPlanet(query, apiKey);
  });

  ipcMain.handle('downloads:filter-results', (_, results: any[]) => {
    return filterQualityResults(results);
  });

  ipcMain.handle('downloads:auto-pick', (_, results: any[], allowHypervisor?: boolean) => {
    return autoPickBest(results, undefined, allowHypervisor);
  });

  // ── Search & Download (native implementation) ──────────────────────────

  ipcMain.handle('downloads:scan-wishlist', async (_, userId: string, wishlistGames: { id: string; title: string }[]) => {
    return await scanWishlist(userId, wishlistGames);
  });

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) => {
    return await searchAndDownload(userId, mediaItemId, gameName, allowHypervisor);
  });

  // ── Download CRUD ──────────────────────────────────────────────────────

  ipcMain.handle('downloads:get-download', (_, id: string) => {
    return getDownload(id);
  });

  ipcMain.handle('downloads:get-user-downloads', () => {
    return getUserDownloads();
  });

  ipcMain.handle('downloads:delete', async (_, id: string) => {
    return await deleteDownloadWithJob(id);
  });

  // ── Poll queue (native SABnzbd polling) ─────────────────────────────────

  ipcMain.handle('downloads:poll-queue', async (_, userId?: string) => {
    return await pollAndUpdateDownloads(userId);
  });

  // ── Connection testing (native SABnzbd & NZBPlanet) ────────────────────

  ipcMain.handle('downloads:test-sabnzbd', async (_, host?: string, port?: number, apiKey?: string, useSsl?: boolean) => {
    return await testSabnzbdConnection(host, port, apiKey, useSsl);
  });

  ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey?: string) => {
    return await testNzbPlanetConnection(apiKey);
  });

  // ── Wishlist tracking (direct DB access) ───────────────────────────────

  ipcMain.handle('downloads:get-wishlist-tracking', (_, userId: string) => {
    return getWishlistTracking(userId);
  });

  ipcMain.handle('downloads:skip-wishlist-item', (_, userId: string, mediaItemId: string) => {
    return skipWishlistItem(userId, mediaItemId);
  });

  // ── Post-process (native auto-organizer / relocation) ──────────────────

  ipcMain.handle('downloads:post-process', async (_, downloadId: string, configId?: string, fallbackSource?: string, fallbackDest?: string) => {
    return await postProcessDownload(downloadId, configId, fallbackSource, fallbackDest);
  });

  // ── Path mappings (direct DB access) ───────────────────────────────────

  ipcMain.handle('downloads:get-path-mappings', async (_, configId: string) => {
    return await getPathMappings(configId);
  });

  ipcMain.handle('downloads:add-path-mapping', async (_, configId: string, sourcePath: string, destPath: string) => {
    return await addPathMapping(configId, sourcePath, destPath);
  });

  ipcMain.handle('downloads:remove-path-mapping', async (_, id: string) => {
    return await removePathMapping(id);
  });

  // ── Game tracking (direct DB query) ────────────────────────────────────

  ipcMain.handle('downloads:get-tracked-game', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM game_update_tracking ORDER BY media_item_title').all() as any[];
    return rows.map((row) => ({
      mediaItemId: row.media_item_id,
      mediaItemTitle: row.media_item_title,
      downloadedUpdateTags: JSON.parse(row.downloaded_updates || '[]'),
      lastUpdateCheck: row.last_update_check || null,
    }));
  });

  // ── Update check (native update checker) ───────────────────────────────

  ipcMain.handle('downloads:check-updates', async () => {
    return await scheduledUpdateCheck();
  });

  // ── Naming template helpers (direct imports) ───────────────────────────

  ipcMain.handle('downloads:preview-naming-template', (_, template: string, sampleName: string) => {
    return previewNamingTemplate(template, sampleName);
  });

  ipcMain.handle('downloads:validate-naming-template', (_, template: string) => {
    return validateNamingTemplate(template);
  });

  // ── Remote Server Downloads (HTTP Range chunked streaming) ─────────────

  const remoteManager = getRemoteDownloadManager();

  remoteManager.on('progress', (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('downloads:remote:progress', progress);
      }
    }
  });

  remoteManager.on('completed', (data) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('downloads:remote:completed', data);
        win.webContents.send('scanner:game-updated');
      }
    }
  });

  ipcMain.handle('downloads:remote:start', async (_, options: RemoteDownloadOptions) => {
    return await remoteManager.startDownload(options);
  });

  ipcMain.handle('downloads:remote:pause', async (_, downloadId: string) => {
    return remoteManager.pauseDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:resume', async (_, downloadId: string) => {
    return remoteManager.resumeDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:cancel', async (_, downloadId: string) => {
    return remoteManager.cancelDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:get-active', () => {
    return remoteManager.getActiveTransfers();
  });
}
