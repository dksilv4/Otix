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
import type { RemoteDownloadOptions } from '../downloads/remote-downloader';

// Lazy loader for heavy downloader engine
let _downloader: typeof import('../downloads/downloader') | null = null;
async function dl() {
  if (!_downloader) {
    _downloader = await import('../downloads/downloader');
  }
  return _downloader;
}

// Lazy loader for RemoteDownloadManager
let _remoteManager: import('../downloads/remote-downloader').RemoteDownloadManager | null = null;
async function getRemoteMgr() {
  if (!_remoteManager) {
    const { getRemoteDownloadManager } = await import('../downloads/remote-downloader');
    _remoteManager = getRemoteDownloadManager();
    _remoteManager.on('progress', (progress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('downloads:remote:progress', progress);
        }
      }
    });

    _remoteManager.on('completed', (data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('downloads:remote:completed', data);
          win.webContents.send('scanner:game-updated');
        }
      }
    });
  }
  return _remoteManager;
}

// ── IPC handler registration ─────────────────────────────────────────────

export function registerDownloadsIPC(): void {
  // ── Config (direct DB access) ──────────────────────────────────────────

  ipcMain.handle('downloads:get-config', (_, userId: string) => {
    try {
      return getConfig(userId);
    } catch {
      return null;
    }
  });

  ipcMain.handle('downloads:save-config', (_, config: any) => {
    try {
      return saveConfig(config);
    } catch {
      return null;
    }
  });

  // ── Search & Filter (native implementation) ────────────────────────────

  ipcMain.handle('downloads:search', async (_, query: string, apiKey?: string) => {
    const d = await dl();
    return await d.searchNzbPlanet(query, apiKey);
  });

  ipcMain.handle('downloads:filter-results', async (_, results: any[]) => {
    const d = await dl();
    return d.filterQualityResults(results);
  });

  ipcMain.handle('downloads:auto-pick', async (_, results: any[], allowHypervisor?: boolean) => {
    const d = await dl();
    return d.autoPickBest(results, undefined, allowHypervisor);
  });

  // ── Search & Download (native implementation) ──────────────────────────

  ipcMain.handle('downloads:scan-wishlist', async (_, userId: string, wishlistGames: { id: string; title: string }[]) => {
    const d = await dl();
    return await d.scanWishlist(userId, wishlistGames);
  });

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) => {
    const d = await dl();
    return await d.searchAndDownload(userId, mediaItemId, gameName, allowHypervisor);
  });

  // ── Download CRUD ──────────────────────────────────────────────────────

  ipcMain.handle('downloads:get-download', (_, id: string) => {
    try {
      return getDownload(id);
    } catch {
      return null;
    }
  });

  ipcMain.handle('downloads:get-user-downloads', async () => {
    try {
      return await getUserDownloads();
    } catch (err: any) {
      console.warn('[downloads:get-user-downloads] Error:', err?.message || err);
      return [];
    }
  });

  ipcMain.handle('downloads:delete', async (_, id: string) => {
    const d = await dl();
    return await d.deleteDownloadWithJob(id);
  });

  // ── Poll queue (native SABnzbd polling) ─────────────────────────────────

  ipcMain.handle('downloads:poll-queue', async (_, userId?: string) => {
    const d = await dl();
    return await d.pollAndUpdateDownloads(userId);
  });

  // ── Connection testing (native SABnzbd & NZBPlanet) ────────────────────

  ipcMain.handle('downloads:test-sabnzbd', async (_, host?: string, port?: number, apiKey?: string, useSsl?: boolean) => {
    const d = await dl();
    return await d.testSabnzbdConnection(host, port, apiKey, useSsl);
  });

  ipcMain.handle('downloads:test-nzbplanet', async (_, apiKey?: string) => {
    const d = await dl();
    return await d.testNzbPlanetConnection(apiKey);
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
    const d = await dl();
    return await d.postProcessDownload(downloadId, configId, fallbackSource, fallbackDest);
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
    const d = await dl();
    return await d.scheduledUpdateCheck();
  });

  // ── Naming template helpers (dynamic imports) ──────────────────────────

  ipcMain.handle('downloads:preview-naming-template', async (_, template: string, sampleName: string) => {
    const { previewNamingTemplate } = await import('../downloads/organizer');
    return previewNamingTemplate(template, sampleName);
  });

  ipcMain.handle('downloads:validate-naming-template', async (_, template: string) => {
    const { validateNamingTemplate } = await import('../downloads/organizer');
    return validateNamingTemplate(template);
  });

  // ── Remote Server Downloads (HTTP Range chunked streaming) ─────────────

  ipcMain.handle('downloads:remote:start', async (_, options: RemoteDownloadOptions) => {
    const rm = await getRemoteMgr();
    return await rm.startDownload(options);
  });

  ipcMain.handle('downloads:remote:pause', async (_, downloadId: string) => {
    const rm = await getRemoteMgr();
    return rm.pauseDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:resume', async (_, downloadId: string) => {
    const rm = await getRemoteMgr();
    return rm.resumeDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:cancel', async (_, downloadId: string) => {
    const rm = await getRemoteMgr();
    return rm.cancelDownload(downloadId);
  });

  ipcMain.handle('downloads:remote:get-active', async () => {
    const rm = await getRemoteMgr();
    return rm.getActiveTransfers();
  });
}
