import { ipcMain, BrowserWindow } from 'electron';
import { getDb } from '../db';
import {
  getConfig, saveConfig, getDownload, getUserDownloads, deleteDownload,
  getWishlistTracking, skipWishlistItem,
  getPathMappings, addPathMapping, removePathMapping,
} from '../framework/downloads';
import { previewNamingTemplate, validateNamingTemplate } from '../downloads/organizer';
import { getRemoteDownloadManager, type RemoteDownloadOptions } from '../downloads/remote-downloader';

// ── Plugin call router ───────────────────────────────────────────────────
// Set after PluginManager is initialized in main.ts

let _callPlugin: ((pluginId: string, method: string, args?: any) => Promise<any>) | null = null;

export function setPluginCaller(caller: (pluginId: string, method: string, args?: any) => Promise<any>): void {
  _callPlugin = caller;
}

// ── Inline quality-filter helpers ────────────────────────────────────────
// (Moved from downloads/index.ts to the plugin; kept here for IPC convenience)

const DEMO_PATTERNS = ['demo', 'trial', 'beta', 'alpha'];
const SCENE_TAGS = ['iso', 'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl', 'skidrow', 'flt'];
const HYPERVISOR_TAGS = ['hv', 'hypervisor', 'vm', 'vmware', 'virtualbox', 'qemu', 'vmic'];
const CRACK_ONLY_PATTERNS = ['crack by', 'crack-only', 'crack only', 'crackfix', 'standalone crack'];

function isFullGame(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return !DEMO_PATTERNS.some(p => title.includes(p));
}

function hasSceneTags(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return SCENE_TAGS.some(tag => title.includes(tag));
}

function hasPreferredRepacker(r: any, repackers: string[]): boolean {
  if (repackers.length === 0) return false;
  const title = (r.title || '').toLowerCase();
  return repackers.some(rep => title.includes(rep.toLowerCase()));
}

function hasHypervisorTags(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return HYPERVISOR_TAGS.some(tag => {
    if (tag === 'hv') {
      return title.includes(' hv ') || title.startsWith('hv ') || title.endsWith(' hv') || title === 'hv';
    }
    return title.includes(tag);
  });
}

function isNotCrackOnly(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return !CRACK_ONLY_PATTERNS.some(p => title.includes(p));
}

function filterQualityResults(results: any[]): any[] {
  const filtered = results.filter(r => isFullGame(r) && isNotCrackOnly(r));
  return filtered.length > 0 ? filtered : results;
}

function compareByVersion(a: any, b: any): number {
  const verA = a._parsedVersion != null ? a._parsedVersion : null;
  const verB = b._parsedVersion != null ? b._parsedVersion : null;
  if (verA !== null && verB !== null) return verB - verA;
  if (verA !== null) return -1;
  if (verB !== null) return 1;
  return 0;
}

function autoPickBest(results: any[], _preferredRepackers?: string | null, allowHypervisor?: boolean): any | null {
  let quality = filterQualityResults(results);
  if (quality.length === 0) return null;

  if (!allowHypervisor) {
    quality = quality.filter(r => !hasHypervisorTags(r));
    if (quality.length === 0) return null;
  }

  const repackerList = _preferredRepackers
    ? _preferredRepackers.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  if (repackerList.length > 0) {
    const preferred = quality.filter(r => hasPreferredRepacker(r, repackerList));
    const others = quality.filter(r => !hasPreferredRepacker(r, repackerList));
    const prefScene = preferred.filter(r => hasSceneTags(r)).sort(compareByVersion);
    const prefNonScene = preferred.filter(r => !hasSceneTags(r)).sort(compareByVersion);
    const otherScene = others.filter(r => hasSceneTags(r)).sort(compareByVersion);
    const otherNonScene = others.filter(r => !hasSceneTags(r)).sort(compareByVersion);
    const ranked = [...prefScene, ...prefNonScene, ...otherScene, ...otherNonScene];
    return ranked[0];
  }

  const scene = quality.filter(r => hasSceneTags(r)).sort(compareByVersion);
  const nonScene = quality.filter(r => !hasSceneTags(r)).sort(compareByVersion);
  const ranked = [...scene, ...nonScene];
  return ranked[0];
}

// ── IPC handler registration ─────────────────────────────────────────────

export function registerDownloadsIPC(): void {
  // ── Config (direct DB access) ──────────────────────────────────────────

  ipcMain.handle('downloads:get-config', (_, userId: string) => {
    return getConfig(userId);
  });

  ipcMain.handle('downloads:save-config', (_, config: any) => {
    return saveConfig(config);
  });

  // ── Search (routed to plugins) ─────────────────────────────────────────

  ipcMain.handle('downloads:search', async (_, query: string) => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('nzbplanet', 'search', { query });
  });

  ipcMain.handle('downloads:filter-results', (_, results: any[]) => {
    return filterQualityResults(results);
  });

  ipcMain.handle('downloads:auto-pick', (_, results: any[], allowHypervisor?: boolean) => {
    return autoPickBest(results, undefined, allowHypervisor);
  });

  // ── Search & Download (routed to plugins) ──────────────────────────────

  ipcMain.handle('downloads:scan-wishlist', async (_, userId: string, wishlistGames: { id: string; title: string }[]) => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');

    const results: { mediaItemId: string; success: boolean; downloadId?: string; error?: string }[] = [];
    for (const game of wishlistGames) {
      try {
        const result = await _callPlugin('downloads', 'search-and-download', { query: game.title });
        if (result && result.downloadId) {
          results.push({ mediaItemId: game.id, success: true, downloadId: result.downloadId });
        } else if (result && result.error) {
          results.push({ mediaItemId: game.id, success: false, error: result.error });
        } else {
          results.push({ mediaItemId: game.id, success: false, error: 'Unknown error' });
        }
      } catch (err: any) {
        results.push({ mediaItemId: game.id, success: false, error: err.message });
      }
    }
    return results;
  });

  ipcMain.handle('downloads:search-and-download', async (_, userId: string, mediaItemId: string | null, gameName: string, allowHypervisor?: boolean) => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('downloads', 'search-and-download', { query: gameName, allowHypervisor });
  });

  // ── Download CRUD (routed to downloads plugin for history) ────────────

  ipcMain.handle('downloads:get-download', (_, id: string) => {
    return getDownload(id);
  });

  ipcMain.handle('downloads:get-user-downloads', () => {
    return getUserDownloads();
  });

  ipcMain.handle('downloads:delete', (_, id: string) => {
    return deleteDownload(id);
  });

  // ── Poll queue (routed to plugins) ─────────────────────────────────────

  ipcMain.handle('downloads:poll-queue', async () => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('downloads', 'poll-queue');
  });

  // ── Connection testing (routed to plugins) ─────────────────────────────

  ipcMain.handle('downloads:test-sabnzbd', async () => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('sabnzbd', 'test-connection');
  });

  ipcMain.handle('downloads:test-nzbplanet', async () => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('nzbplanet', 'test-connection');
  });

  // ── Wishlist tracking (direct DB access) ───────────────────────────────

  ipcMain.handle('downloads:get-wishlist-tracking', (_, userId: string) => {
    return getWishlistTracking(userId);
  });

  ipcMain.handle('downloads:skip-wishlist-item', (_, userId: string, mediaItemId: string) => {
    return skipWishlistItem(userId, mediaItemId);
  });

  // ── Post-process (routed to plugins) ───────────────────────────────────

  ipcMain.handle('downloads:post-process', async (_, downloadId: string, _configId: string, fallbackSource?: string, fallbackDest?: string) => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    return _callPlugin('downloads', 'post-process', {
      downloadPath: fallbackSource,
      destPath: fallbackDest,
    });
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
    return rows.map(row => ({
      mediaItemId: row.media_item_id,
      mediaItemTitle: row.media_item_title,
      downloadedUpdateTags: JSON.parse(row.downloaded_updates || '[]'),
      lastUpdateCheck: row.last_update_check || null,
    }));
  });

  // ── Update check (routed to plugins) ───────────────────────────────────

  ipcMain.handle('downloads:check-updates', async () => {
    if (!_callPlugin) throw new Error('Plugin system not initialized');
    try {
      const queue = await _callPlugin('downloads', 'poll-queue');
      return Array.isArray(queue) ? queue : [];
    } catch {
      return [];
    }
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
