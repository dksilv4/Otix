import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import type { FpsCaptureService } from '../game/fps-capture';

function enableHistoryNavigation(win: BrowserWindow): void {
  const wc = win.webContents;
  const isMac = process.platform === 'darwin';

  const go = (dir: -1 | 1) => {
    const nav = wc.navigationHistory;
    if (dir === -1) {
      if (nav.canGoBack()) nav.goBack();
    } else if (nav.canGoForward()) {
      nav.goForward();
    }
  };

  wc.on('before-input-event', (event, input) => {
    let back: boolean;
    let forward: boolean;
    if (isMac) {
      back = Boolean(input.meta && input.key === '[');
      forward = Boolean(input.meta && input.key === ']');
    } else {
      back = Boolean(input.alt && input.key === 'ArrowLeft');
      forward = Boolean(input.alt && input.key === 'ArrowRight');
    }
    const button = (input as unknown as { button?: number }).button;
    back = back || Boolean(input.control && input.key === '[') || (input.type === 'mouseDown' && button === 3);
    forward = forward || Boolean(input.control && input.key === ']') || (input.type === 'mouseDown' && button === 4);
    if (back || forward) {
      event.preventDefault();
      go(back ? -1 : 1);
    }
  });
}

export function openStandaloneWindow(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;

  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  enableHistoryNavigation(win);
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void win.webContents.loadURL(target);
    return { action: 'deny' };
  });
  void win.loadURL(url);
}

/**
 * Register system, shell, file dialog, disk space, and machine mapping IPC handlers.
 */
export function registerSystemIPC(getFpsService?: () => FpsCaptureService | null): void {
  ipcMain.handle('ping', () => 'pong');

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:open-session-window', (_event, url: string) => {
    openStandaloneWindow(url);
  });

  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle('media:get-folder-tracks', async (_event, filePath: string) => {
    try {
      const normalizedPath = path.normalize(filePath);
      const dir = path.dirname(normalizedPath);
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const audioExts = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);
      const files = entries
        .filter((e) => e.isFile() && audioExts.has(path.extname(e.name).toLowerCase()))
        .map((e) => path.join(dir, e.name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      // Look for folder cover artwork
      const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
      const coverNames = new Set(['cover', 'folder', 'front', 'album', 'artwork']);
      let folderCoverPath: string | null = null;
      for (const e of entries) {
        if (e.isFile() && imageExts.has(path.extname(e.name).toLowerCase())) {
          const baseName = path.parse(e.name).name.toLowerCase();
          if (coverNames.has(baseName)) {
            folderCoverPath = path.join(dir, e.name);
            break;
          }
        }
      }

      return {
        folder: dir,
        tracks: files.length > 0 ? files : [normalizedPath],
        folderCoverPath,
      };
    } catch {
      return { folder: path.dirname(filePath), tracks: [filePath], folderCoverPath: null };
    }
  });

  ipcMain.handle('dialog:select-directory', async (event, defaultPath?: string) => {
    const parentWin = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || BrowserWindow.getFocusedWindow();
    const opts = {
      title: 'Select Game Directory or Steam Library Folder',
      defaultPath,
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const result = parentWin ? await dialog.showOpenDialog(parentWin, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  let diskSpaceCache: { timestamp: number; data: any[] } | null = null;

  ipcMain.handle('get-disk-space', async () => {
    const now = Date.now();
    if (diskSpaceCache && now - diskSpaceCache.timestamp < 30_000) {
      return diskSpaceCache.data;
    }
    try {
      if (process.platform === 'win32') {
        const out = await new Promise<string>((resolve, reject) => {
          exec(
            'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Json"',
            { encoding: 'utf-8', timeout: 5000 },
            (err: any, stdout: string) => {
              if (err) reject(err);
              else resolve(stdout);
            }
          );
        });
        const drives = JSON.parse(out.trim());
        const arr = Array.isArray(drives) ? drives : [drives];
        const res = arr.map((d: any) => ({
          drive: d.Name + ':/',
          free: d.Free,
          used: d.Used,
        }));
        diskSpaceCache = { timestamp: now, data: res };
        return res;
      } else {
        const out = await new Promise<string>((resolve, reject) => {
          exec('df -k /', { encoding: 'utf-8', timeout: 5000 }, (err: any, stdout: string) => {
            if (err) reject(err);
            else resolve(stdout);
          });
        });
        const lines = out.trim().split('\n');
        if (lines.length < 2) return [];
        const parts = lines[1].split(/\s+/);
        if (parts.length < 4) return [];
        const res = [{
          drive: parts[0],
          total: parseInt(parts[1], 10) * 1024,
          used: parseInt(parts[2], 10) * 1024,
          free: parseInt(parts[3], 10) * 1024,
        }];
        diskSpaceCache = { timestamp: now, data: res };
        return res;
      }
    } catch {
      return diskSpaceCache?.data ?? [];
    }
  });

  const cachePath = path.join(app.getPath('userData'), 'query-cache.json');
  ipcMain.handle('cache:load', async () => {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('cache:save', async (_event, data: unknown) => {
    try {
      await fs.promises.writeFile(cachePath, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('[Cache] persist failed', err);
    }
  });

  ipcMain.handle('settings:sync-machine-mappings', async (_event, mappings: any) => {
    const { syncMachineMappings } = await import('../unc-resolver');
    syncMachineMappings(mappings);
    return true;
  });

  ipcMain.handle('settings:get-machine-mappings', async () => {
    const { getRegisteredMachineMappings } = await import('../unc-resolver');
    return getRegisteredMachineMappings();
  });

  ipcMain.handle('fps:fix-permissions', async () => {
    const fps = getFpsService?.();
    if (fps) return fps.fixPermissions();
    return { success: false, error: 'FPS capture service not available' };
  });
}
