import { app, BrowserWindow, ipcMain, dialog, screen, shell, nativeImage, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media-cache',
    privileges: {
      bypassCSP: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
import { GameDetector } from './game/detector';
import { registerDownloadsIPC, setPluginCaller } from './ipc/downloads';
import { registerScannerIPC, setScanOrchestrator, registerPluginScanIPC, setPluginManager } from './ipc/scanner';
import { registerInstallerIPC } from './ipc/installer';
import { rehydrateActiveInstalls } from './installer';
import { registerGameDetectorIPC } from './ipc/game-detector';
import { registerWindowIPC, notifyMaximizedChange } from './ipc/window';
import { registerDesktopSettingsIPC } from './ipc/settings';
import { loadDesktopSettings, applyDesktopSettings, getSettings } from './desktop-settings';
import { createTray, destroyTray, setTrayVisible, isTrayActive } from './tray';
import { initDatabase, closeDb, PluginsRepository } from './db';
import { setNotifyTarget, getAllGames } from './game/storage';
import type { LocalGame } from './preload-api';
import { purgeOldDeletedDownloads } from './downloads';
import { SaveDaemon } from './saves';
import { registerSaveIPC } from './ipc/saves';
import { populateKnownLocations } from './saves/export';
import { PermissionManager } from './plugins/permissions';
import { PluginManager } from './plugins/manager';
import { eventBus } from './plugins/event-bus';
import { registerPluginIPC } from './plugins/ipc';
import { wireOrchestratorEvents } from './ipc/plugins';
import { GameScanOrchestrator } from './game/orchestrator';
import { registerNotificationIPC } from './ipc/notifications';

let mainWindow: BrowserWindow | null = null;
let gameDetector: GameDetector | null = null;
let pluginManager: PluginManager | null = null;
let permissionManager: PermissionManager | null = null;
let pendingDeepLink: string | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Disable GPU disk cache to prevent 'Unable to move the cache: Access is denied'
// errors on some Windows configurations (typically after unclean shutdown).
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// ── Window position persistence ───────────────────────────────
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_SIZE: WindowState = { width: 1280, height: 800, maximized: false }

function statePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState | null {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8')
    return JSON.parse(raw) as WindowState
  } catch {
    return null
  }
}

function saveWindowState(win: BrowserWindow) {
  let bounds: Electron.Rectangle
  if (win.isMaximized()) {
    bounds = win.getNormalBounds()
    fs.writeFileSync(statePath(), JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: true }))
  } else {
    bounds = win.getBounds()
    fs.writeFileSync(statePath(), JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: false }))
  }
}

function ensureVisible(saved: WindowState): Electron.Rectangle {
  const pri = screen.getPrimaryDisplay().workArea
  const w = saved.width || DEFAULT_SIZE.width
  const h = saved.height || DEFAULT_SIZE.height

  // If x/y are undefined (maximized save) or off-screen, center on primary
  if (saved.x === undefined || saved.y === undefined) {
    return {
      x: pri.x + Math.max(0, (pri.width - w) / 2),
      y: pri.y + Math.max(0, (pri.height - h) / 2),
      width: w,
      height: h,
    }
  }

  const onScreen = screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      saved.x! >= x && saved.x! + w <= x + width &&
      saved.y! >= y && saved.y! + h <= y + height
    )
  })

  if (onScreen) {
    return { x: saved.x, y: saved.y, width: w, height: h }
  }

  return {
    x: pri.x + Math.max(0, (pri.width - w) / 2),
    y: pri.y + Math.max(0, (pri.height - h) / 2),
    width: w,
    height: h,
  }
}

function createWindow() {
  // If a deep link was received before the window was created, forward it
  if (pendingDeepLink) {
    handleDeepLink(pendingDeepLink);
    pendingDeepLink = null;
  }
  const saved = loadWindowState()
  const bounds = saved ? ensureVisible(saved) : DEFAULT_SIZE

  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    title: 'Otix',
    // macOS: hidden title bar keeps native traffic lights
    // Windows/Linux: fully frameless — we draw our own title bar
    titleBarStyle: isMac ? 'hidden' : 'default',
    frame: isMac ? true : false,
    trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      partition: 'persist:main',
    },
  });

  // Wire game-storage-service change notifications to this window
  setNotifyTarget(mainWindow);

  if (saved?.maximized) {
    mainWindow.maximize()
  }


  // Save window state on resize, move, maximize, unmaximize, and close
  mainWindow.on('resize', () => saveWindowState(mainWindow!))
  mainWindow.on('move', () => saveWindowState(mainWindow!))
  mainWindow.on('maximize', () => {
    saveWindowState(mainWindow!)
    notifyMaximizedChange(true)
  })
  mainWindow.on('unmaximize', () => {
    saveWindowState(mainWindow!)
    notifyMaximizedChange(false)
  })

  // Handle close-to-tray
  mainWindow.on('close', (event) => {
    console.log('[main] Window close event fired');
    saveWindowState(mainWindow!)
    const settings = getSettings()
    if (settings.closeToTray) {
      console.log('[main] closeToTray enabled — hiding instead of closing');
      event.preventDefault()
      mainWindow?.hide()
      return
    }
  })

  mainWindow.on('hide', () => console.log('[main] Window hidden'))
  mainWindow.on('show', () => console.log('[main] Window shown'))
  mainWindow.on('minimize', () => console.log('[main] Window minimized'))

  // Crash diagnostics
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] RENDERER GONE:', details.reason, 'exitCode:', details.exitCode)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (isMainFrame) console.error('[main] PAGE LOAD FAILED:', code, desc, url)
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[main] RENDERER UNRESPONSIVE')
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5174/');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}`);
  }

  // Ensure window is visible
  mainWindow.show();
  mainWindow.focus();
  console.log('[main] Window created — visible:', mainWindow.isVisible(), 'minimized:', mainWindow.isMinimized());

  mainWindow.on('closed', () => {
    console.log('[main] Window closed');
    gameDetector?.stopAll();
    mainWindow = null;
  });

  // ── Register window IPC ──
  registerWindowIPC(mainWindow);
}

// ── Custom protocol (otix://) for OAuth deep links ───────────────
const PROTOCOL = 'otix';
app.setAsDefaultProtocolClient(PROTOCOL);

// Single-instance lock: on Windows/Linux, deep links arrive via argv
// of a second instance rather than an open-url event.
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const dl = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (dl) handleDeepLink(dl);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS: deep links arrive via the open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith(`${PROTOCOL}://`)) {
    handleDeepLink(url);
  }
});

function parseDeepLink(url: string): { action: string; params: Record<string, string> } {
  try {
    const u = new URL(url);
    const params: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    return { action: u.hostname + u.pathname, params };
  } catch {
    return { action: 'refocus', params: {} };
  }
}

function handleDeepLink(url: string) {
  if (!mainWindow) {
    pendingDeepLink = url;
    return;
  }
  const data = parseDeepLink(url);
  mainWindow.webContents.send('deep-link', data);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

app.on('ready', async () => {
  // macOS dock icon — in dev mode the default Electron icon is used otherwise
  if (process.platform === 'darwin') {
    app.dock!.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')));
  }

  // PresentMon is managed by the fps-capture plugin — no startup download needed here.
  gameDetector = new GameDetector(app.getPath('userData'));

  // Purge old deleted downloads every hour
  purgeOldDeletedDownloads().catch(() => {});
  setInterval(() => purgeOldDeletedDownloads().catch(() => {}), 3600000);

  // Fix SameSite cookies for cross-origin requests from file:// (frontend) to backend
  const { session } = require('electron');
  const sess = session.fromPartition('persist:main');

  sess.webRequest.onHeadersReceived((details: any, callback: any) => {
    let responseHeaders = details.responseHeaders || {};
    const setCookie = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];
    if (setCookie) {
      responseHeaders['set-cookie'] = setCookie.map((cookie: string) => {
        let newCookie = cookie;
        if (/SameSite=Lax/i.test(newCookie)) {
          newCookie = newCookie.replace(/SameSite=Lax/ig, 'SameSite=None');
        }
        if (/SameSite=None/i.test(newCookie) && !/Secure/i.test(newCookie)) {
          newCookie += '; Secure';
        }
        return newCookie;
      });
    }
    callback({ cancel: false, responseHeaders });
  });

  // Register media-cache protocol handler for caching images locally
  sess.protocol.handle('media-cache', async (request: Request) => {
    const originalUrl = 'https://' + request.url.replace(/^media-cache:\/\//, '');
    const cacheDir = path.join(app.getPath('userData'), 'image-cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(originalUrl).digest('hex');
    const cachePath = path.join(cacheDir, hash);

    const getMimeType = (url: string) => {
      const ext = url.split('.').pop()?.toLowerCase();
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'svg') return 'image/svg+xml';
      return 'image/jpeg';
    };

    if (fs.existsSync(cachePath)) {
      const buffer = fs.readFileSync(cachePath);
      return new Response(buffer, {
        headers: { 'content-type': getMimeType(originalUrl) },
      });
    }

    try {
      const response = await net.fetch(originalUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(cachePath, Buffer.from(buffer));
        return new Response(buffer, {
          headers: {
            'content-type': response.headers.get('content-type') || getMimeType(originalUrl),
          },
          status: response.status,
          statusText: response.statusText,
        });
      }
      return response;
    } catch (err) {
      console.error('[ImageCache] Fetch failed for', originalUrl, err);
      return new Response('Fetch failed', { status: 500 });
    }
  });

  // Intercept HTTPS image requests and redirect them to media-cache protocol
  sess.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (details: any, callback: any) => {
    if (details.resourceType === 'image' && details.url.startsWith('https://')) {
      const url = details.url;
      // Do not cache images from localhost/127.0.0.1 (local backend or local dev server)
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        callback({ redirectURL: 'media-cache://' + url.slice(8) });
        return;
      }
    }
    callback({});
  });

  // Forward game detection events to renderer AND bridge to plugin event bus.
  // Guard with isDestroyed() — detector fires from timer callbacks
  // that may outlive the window.
  gameDetector.on('game:started', (runningGame) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:started', runningGame);
    }
    eventBus.emit('game:started', {
      gameId: runningGame.game.id,
      gameTitle: runningGame.game.title,
      pid: runningGame.pid ?? 0,
      launchedByOtix: runningGame.launchedByOtix,
    });
  });
  gameDetector.on('game:ended', (session) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:ended', session);
    }
    eventBus.emit('game:ended', {
      gameId: session.gameId,
      gameTitle: session.gameTitle,
      startTime: session.startTime,
      endTime: session.endTime,
      launchedByOtix: session.launchedByOtix,
    });
  });

  // FPS data now comes from the fps-capture plugin via eventBus (not GameDetector).
  eventBus.on('fps:live', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:fps', payload);
    }
  }, 'main');
  eventBus.on('fps:permission-needed', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fps:permission-needed', payload);
    }
  }, 'main');

  // ── FPS permission fix (delegates to fps-capture plugin) ──
  ipcMain.handle('fps:fix-permissions', async () => {
    if (!pluginManager) return { success: false, error: 'Plugin system not ready' };
    try {
      return await pluginManager.callPluginData('fps-capture', 'fixPermissions');
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // General utilities
  ipcMain.handle('ping', () => 'pong');

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  // Open a URL in a standalone app window on the DEFAULT session — the same
  // session plugin OAuth windows use, so the window carries the user's
  // logged-in web session (e.g. Epic Games Store after Epic OAuth).
  ipcMain.handle('shell:open-session-window', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    } catch {
      return;
    }
    const win = new BrowserWindow({
      width: 1200,
      height: 850,
      autoHideMenuBar: true,
      backgroundColor: '#09090b',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    await win.loadURL(url);
  });

  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game Directory or Steam Library Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ── Disk space utility ──
  ipcMain.handle('get-disk-space', () => {
    try {
      if (process.platform === 'win32') {
        const out = execSync(
          'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Json"',
          { encoding: 'utf-8', timeout: 5000 }
        );
        const drives = JSON.parse(out.trim());
        const arr = Array.isArray(drives) ? drives : [drives];
        return arr.map((d: any) => ({
          drive: d.Name + ':/',
          free: d.Free,
          used: d.Used,
        }));
      } else {
        const out = execSync('df -k /', { encoding: 'utf-8', timeout: 5000 });
        const lines = out.trim().split('\n');
        if (lines.length < 2) return [];
        const parts = lines[1].split(/\s+/);
        if (parts.length < 4) return [];
        const totalKb = parseInt(parts[1], 10);
        const usedKb = parseInt(parts[2], 10);
        const availKb = parseInt(parts[3], 10);
        return [{
          drive: parts[0],
          total: totalKb * 1024,
          used: usedKb * 1024,
          free: availKb * 1024,
        }];
      }
    } catch {
      return [];
    }
  });

  // ── Query cache persistence ──
  const cachePath = path.join(app.getPath('userData'), 'query-cache.json');
  ipcMain.handle('cache:load', async () => {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch { return null; }
  });
  ipcMain.handle('cache:save', async (_event, data: unknown) => {
    try { fs.writeFileSync(cachePath, JSON.stringify(data), 'utf-8'); }
    catch (err) { console.error('[Cache] persist failed', err); }
  });

  // Init all databases before any IPC handler or window.
  // Failure is non-fatal — app opens with degraded DB functionality.
  let dbReady = false;
  await initDatabase().then(() => { dbReady = true }).catch((err) => {
    console.error('[main] DB init failed (app will run with reduced functionality):', err.message);
  });

  // Seed the default plugin repo if none exist (first run)
  const pluginsRepo = new PluginsRepository();
  if (dbReady) {
    const existingRepos = pluginsRepo.getRepos();
    if (existingRepos.length === 0) {
      pluginsRepo.addRepo('https://raw.githubusercontent.com/dksilv4/otix-plugins/main/registry.json', 'Otix Default');
    }
  }

  // Rehydrate any installs that were running before Electron last closed
  if (dbReady) { try { rehydrateActiveInstalls() } catch (err) { console.error('[main] rehydrateActiveInstalls failed:', err) } }

  // Register modular IPC handlers (safe — registration doesn't touch DB)
  registerDownloadsIPC();
  registerScannerIPC(gameDetector);
  registerInstallerIPC();
  // game-detector IPC registered after pluginManager init (needs plugin ref for session queries)

  // Seed detector with previously-scanned games so it can detect
  // games already running when the app loads.
  if (dbReady) {
    try {
      const existingGames = getAllGames({ installed: true });
      if (existingGames.length > 0) {
        gameDetector?.setLibrary(existingGames as LocalGame[]);
        gameDetector?.startPeriodicScan();
        console.log(`[main] Seeded detector with ${existingGames.length} installed game(s) from DB`);
      }
    } catch (err) {
      console.error('[main] Failed to seed detector from DB:', err);
    }
  }

  // Pre-download innounp on startup (ready for ISO installs)
  try {
    const { ensureInnounp } = require('./installer');
    ensureInnounp().then((p: string | null) => {
      if (p) console.log('[startup] innounp ready');
      else console.warn('[startup] innounp failed (will retry on demand)');
    });
  } catch {}

  // ── Initialize Save Daemon —────
  const saveDaemon = new SaveDaemon(path.join(app.getPath('userData'), 'saves'));
  registerSaveIPC(saveDaemon);

  // Populate known save locations from the built-in database (async, non-blocking)
  if (dbReady) { populateKnownLocations(saveDaemon) }

  createWindow();

  // ── Initialize plugin system ──
  if (dbReady) {
    const extensionsDir = isDev
      ? path.resolve(__dirname, '..', '..', 'extensions', 'otix-plugins', 'plugins')
      : path.join(app.getPath('userData'), 'extensions');
    const devExtensionsDir = isDev
      ? path.join(app.getPath('userData'), 'extensions')
      : undefined;
    permissionManager = new PermissionManager();
    pluginManager = new PluginManager(extensionsDir, pluginsRepo, app.getPath('userData'), devExtensionsDir);
    pluginManager.setPermissionManager(permissionManager);
    setPluginCaller((pluginId, method, args) => pluginManager!.callPluginData(pluginId, method, args));
    permissionManager.setWebContents(mainWindow!.webContents);
    registerPluginIPC(pluginManager, mainWindow!, permissionManager);
    registerGameDetectorIPC(gameDetector, pluginManager);

    // ── Initialize GameScanOrchestrator ──
    const orchestrator = new GameScanOrchestrator(pluginManager);
    orchestrator.setApiBaseUrl(pluginManager.getApiBaseUrl());
    // Wire auth token changes
    const origSetAuth = pluginManager.setAuthToken.bind(pluginManager);
    pluginManager.setAuthToken = (token: string) => {
      origSetAuth(token);
      orchestrator.setAuthToken(token);
    };
    setScanOrchestrator(orchestrator);
    setPluginManager(pluginManager);
    registerPluginScanIPC();
    wireOrchestratorEvents(orchestrator, mainWindow!);

    // Fire-and-forget: discover and load enabled plugins (don't block window load)
    if (devExtensionsDir) {
      console.log('[plugins] UserData extensions dir:', devExtensionsDir);
      console.log('[plugins] Exists:', require('fs').existsSync(devExtensionsDir));
    }
    pluginManager.discoverPlugins().then(async () => {
      const all = pluginManager!.getAllPlugins();
      console.log(`[plugins] Discovery complete, ${all.length} plugin(s) in DB:`, all.map(p => `${p.id} (${p.status})`).join(', '));

      // Auto-enable default plugins (always enabled, no user action needed)
      const DEFAULT_PLUGINS = ['fps-capture', 'battlenet'];
      for (const id of DEFAULT_PLUGINS) {
        const p = pluginManager!.getPlugin(id);
        if (p && p.status !== 'enabled') {
          try {
            await pluginManager!.enable(id);
            console.log(`[plugins] Auto-enabled default plugin: ${id}`);
          } catch (err) {
            console.error(`[plugins] Failed to auto-enable default plugin ${id}:`, err);
          }
        }
      }

      return pluginManager!.loadEnabledPlugins();
    }).then(async () => {
      // Migrate existing scan paths to local-files plugin config (if plugin is discovered)
      // so paths are ready when user enables the plugin.
      const localFiles = pluginManager!.getPlugin('local-files');
      if (localFiles) {
        const cfg = pluginManager!.getConfig('local-files');
        const scanDirs = (cfg?.scanDirectories as string[] | undefined) ?? [];
        const isoDirs = (cfg?.isoDirectories as string[] | undefined) ?? [];
        if (!scanDirs.length && !isoDirs.length) {
          const { getScanPaths } = require('./game/storage') as typeof import('./game/storage');
          const paths = getScanPaths();
          const gamePaths = paths.filter(p => p.type === 'game').map(p => p.path);
          const isoPaths = paths.filter(p => p.type === 'iso').map(p => p.path);
          if (gamePaths.length || isoPaths.length) {
            pluginManager!.setConfig('local-files', 'scanDirectories', gamePaths);
            pluginManager!.setConfig('local-files', 'isoDirectories', isoPaths);
            console.log(`[main] Migrated ${gamePaths.length} game + ${isoPaths.length} ISO scan paths to local-files plugin config`);
          }
        }
      }
    }).catch(err => {
      console.error('[plugins] Discovery failed:', err);
    });
  } else {
    console.warn('[plugins] Skipping plugin init — database not available');
  }

  // ── Load desktop settings and apply side effects ──
  const settings = loadDesktopSettings();

  // Create tray if minimizeToTray or closeToTray is enabled, or startMinimized
  const needsTray = settings.minimizeToTray || settings.closeToTray || settings.startMinimized
  let tray: ReturnType<typeof createTray> | null = null
  if (needsTray && mainWindow) {
    tray = createTray(mainWindow)
  }

  if (mainWindow) {
    applyDesktopSettings(settings, mainWindow, tray)

    // Register desktop settings IPC (needs window + tray references)
    registerDesktopSettingsIPC(mainWindow, tray)

    // Register notification IPC
    registerNotificationIPC(mainWindow)

    // Handle startMinimized: hide window immediately
    if (settings.startMinimized && tray) {
      mainWindow.hide()
    }
  }

  // Signal renderer that all IPC handlers are registered.
  // The renderer's loadFromDatabase() waits for this before calling IPC.
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('main:ipc-ready');
  });

  // ── Clean-quit signal for last-route restore ──
  app.on('before-quit', () => {
    console.log('[main] before-quit fired');
    mainWindow?.webContents.send('app:clean-quit');
    pluginManager?.shutdown().catch(() => {});
    try { closeDb() } catch (err) {
      console.error('[main] Failed to close database connections:', err);
    }
  });

  // ── Scheduled update check ──
  // First check 5 minutes after startup, then every 12 hours
  // Delegated to the downloads plugin; these calls serve as a fallback
  setTimeout(() => {
    pluginManager?.callPluginData('downloads', 'poll-queue').catch((err: any) =>
      console.error('[main] Initial update check failed:', err)
    );
  }, 5 * 60 * 1000);

  setInterval(() => {
    pluginManager?.callPluginData('downloads', 'poll-queue').catch((err: any) =>
      console.error('[main] Periodic update check failed:', err)
    );
  }, 12 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed fired');
  gameDetector?.stopAll();
  pluginManager?.shutdown().catch(() => {});
  try { closeDb() } catch (err) {
    console.error('[main] Failed to close database connections:', err);
  }
  // Kill any running game install
  try {
    const { cancelCurrentInstall } = require('./installer');
    cancelCurrentInstall();
  } catch {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
});
