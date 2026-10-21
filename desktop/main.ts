import { app, BrowserWindow, ipcMain, dialog, screen, shell, nativeImage, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'media-cache',
    privileges: {
      standard: true,
      bypassCSP: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
import { getApiBaseUrl } from './config';
import { GameDetector, type RunningGame, type PlaySession } from './game/detector';
import { registerDownloadsIPC, setPluginCaller } from './ipc/downloads';
import { registerScannerIPC, setScanOrchestrator, registerPluginScanIPC, setPluginManager } from './ipc/scanner';
import { registerInstallerIPC } from './ipc/installer';
import { rehydrateActiveInstalls } from './installer';
import { registerGameDetectorIPC } from './ipc/game-detector';
import { Cs2GsiManager } from './game/cs2-gsi';
import { registerWindowIPC, notifyMaximizedChange } from './ipc/window';
import { registerDesktopSettingsIPC } from './ipc/settings';
import { loadDesktopSettings, applyDesktopSettings, getSettings } from './desktop-settings';
import { createTray, destroyTray, setTrayVisible, isTrayActive } from './tray';
import { initDatabase, closeDb, PluginsRepository } from './db';
import { setNotifyTarget, getAllGames } from './game/storage';
import type { LocalGame } from './preload-api';
import { purgeOldDeletedDownloads } from './downloads';
import { SaveDaemon } from './saves';
import * as SaveService from './saves/service';
import { registerSaveIPC } from './ipc/saves';
import { populateKnownLocations } from './saves/export';
import { PermissionManager } from './plugin-runtime/permissions';
import { PluginManager } from './plugin-runtime/manager';
import { eventBus } from './plugin-runtime/event-bus';
import { registerPluginIPC, setPluginMainWebContents } from './plugin-runtime/ipc';
import { wireOrchestratorEvents } from './ipc/plugins';
import { GameScanOrchestrator } from './game/orchestrator'; import { FetchWorkerBridge } from './fetch/bridge';
import { registerNotificationIPC } from './ipc/notifications';
import {
  registerUpdaterIPC,
  checkForUpdatesOnStartup,
  startPeriodicUpdateChecks,
  stopPeriodicUpdateChecks,
} from './ipc/updater';
import { NodeDaemonManager } from './node-daemon';
import { registerNodeDaemonIPC } from './ipc/node-daemon';
import { registerAppInstallerIPC } from './ipc/app-installer';
import { setDefaultAutoSelectFamily } from 'node:net';

// Node 24's happy-eyeballs (autoSelectFamily) intermittently ETIMEDOUTs
// dual-stack hostnames when the machine has no working IPv6. Disable it so
// undici fetches (plugins, image cache) reliably connect first try.
setDefaultAutoSelectFamily(false);

let mainWindow: BrowserWindow | null = null;
let gameDetector: GameDetector | null = null;
let cs2GsiManager: Cs2GsiManager | null = null;
let pluginManager: PluginManager | null = null;
let saveDaemon: SaveDaemon | null = null;
let currentAuthToken = '';
let permissionManager: PermissionManager | null = null;
let fetchBridge: FetchWorkerBridge | null = null;
let nodeDaemon: NodeDaemonManager | null = null;
let pendingDeepLink: string | null = null;
let isQuitting = false;

export function markAppQuitting(): void {
  isQuitting = true;
}

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

// Wires browser-style history navigation into a window's webContents so the
// user can go back/forward naturally: Cmd+[/] (macOS), Alt+Left/Right
// (Windows/Linux), with Ctrl+[/] and the browser mouse back/forward buttons
// as fallbacks.
function enableHistoryNavigation(win: BrowserWindow): void {
  const wc = win.webContents
  const isMac = process.platform === 'darwin'

  const go = (dir: -1 | 1) => {
    const nav = wc.navigationHistory
    if (dir === -1) {
      if (nav.canGoBack()) nav.goBack()
    } else if (nav.canGoForward()) {
      nav.goForward()
    }
  }

  wc.on('before-input-event', (event, input) => {
    let back: boolean
    let forward: boolean
    if (isMac) {
      back = input.meta && input.key === '['
      forward = input.meta && input.key === ']'
    } else {
      back = input.alt && input.key === 'ArrowLeft'
      forward = input.alt && input.key === 'ArrowRight'
    }
    const button = (input as unknown as { button?: number }).button
    back = back || (input.control && input.key === '[') || (input.type === 'mouseDown' && button === 3)
    forward = forward || (input.control && input.key === ']') || (input.type === 'mouseDown' && button === 4)
    if (back || forward) {
      event.preventDefault()
      go(back ? -1 : 1)
    }
  })
}

// Opens a URL in a standalone app window on the DEFAULT session — the same
// session plugin OAuth windows use, so the window carries the user's logged-in
// web session (e.g. Epic Games Store after Epic OAuth). It behaves like a small
// in-app browser: back/forward navigation is supported and target=_blank links
// navigate in place so history stays intact.
function openStandaloneWindow(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return

  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  enableHistoryNavigation(win)
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void win.webContents.loadURL(target)
    return { action: 'deny' }
  })
  void win.loadURL(url)
}

function createInstallerWindow(mode: 'installer' | 'uninstaller') {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'otix-installer-debug.log'),
      `[WINDOW] createInstallerWindow mode=${mode} isDev=${isDev} NODE_ENV=${process.env.NODE_ENV} isPackaged=${app.isPackaged}\n`
    );
  } catch {}

  const isUninstaller = mode === 'uninstaller';
  const width = isUninstaller ? 600 : 780;
  const height = isUninstaller ? 400 : 540;

  const iconPath = fs.existsSync(path.join(process.resourcesPath, 'assets', 'icon.png'))
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '..', 'assets', 'icon.png');

  const logInstaller = (msg: string) => {
    try {
      fs.appendFileSync(path.join(os.tmpdir(), 'otix-installer-debug.log'), `[INSTALLER] ${new Date().toISOString()} ${msg}\n`);
    } catch {}
  };

  const win = new BrowserWindow({
    width,
    height,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#07080a',
    title: isUninstaller ? 'Otix Uninstaller' : 'Otix Setup',
    icon: iconPath,
    show: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      partition: 'persist:main',
    },
  });

  registerAppInstallerIPC(win);

  win.once('ready-to-show', () => {
    logInstaller('ready-to-show fired');
    win.show();
    win.focus();
  });

  // Fallback to guarantee visibility
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      logInstaller('visibility fallback triggered - showing window');
      win.show();
      win.focus();
    }
  }, 800);

  const pagePath = isUninstaller ? 'uninstaller' : 'installer';
  const targetUrl = isDev && process.env.NODE_ENV === 'development'
    ? `http://127.0.0.1:5174/${pagePath}`
    : `app://otix/${pagePath}`;

  logInstaller(`loading URL: ${targetUrl}`);
  void win.loadURL(targetUrl);

  win.webContents.on('did-finish-load', () => {
    logInstaller(`did-finish-load url=${win.webContents.getURL()}`);
  });

  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    logInstaller(`Page load failed: code=${code} desc=${desc} url=${url}`);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logInstaller(`[renderer console][level ${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logInstaller(`render-process-gone: ${JSON.stringify(details)}`);
  });

  win.on('closed', () => {
    logInstaller('win closed');
    app.quit();
  });

  return win;
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
    icon: fs.existsSync(path.join(process.resourcesPath, 'assets', 'icon.png'))
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(__dirname, '..', 'assets', 'icon.png'),
    title: 'Otix',
    backgroundColor: '#000000',
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
  setPluginMainWebContents(mainWindow.webContents);
  nodeDaemon?.setWebContents(mainWindow.webContents);

  // Route renderer window.open() calls (e.g. Epic claim links) into a
  // nav-enabled standalone window so the user can go back naturally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) openStandaloneWindow(url);
    return { action: 'deny' };
  });

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
    if (isQuitting) {
      return;
    }
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

  // Keyboard shortcut to toggle DevTools (F12 / Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  if (isDev && process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://127.0.0.1:5174/');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://otix/');
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

  // ── Register window & updater IPC ──
  registerWindowIPC(mainWindow);
  registerUpdaterIPC(mainWindow);
}

// ── Custom protocol (otix://) for OAuth deep links ───────────────
const PROTOCOL = 'otix';
app.setAsDefaultProtocolClient(PROTOCOL);

// ── Installer / Uninstaller mode detection ────────────────────────
const isSetupExe =
  path.basename(process.execPath).toLowerCase().includes('setup') ||
  Boolean(
    process.env.PORTABLE_EXECUTABLE_FILE &&
    path.basename(process.env.PORTABLE_EXECUTABLE_FILE).toLowerCase().includes('setup'),
  );

const isInstallerMode = process.argv.includes('--installer') || process.env.OTIX_INSTALLER === '1' || isSetupExe;
const isUninstallerMode = process.argv.includes('--uninstall') || process.env.OTIX_UNINSTALLER === '1';

try {
  fs.appendFileSync(
    path.join(os.tmpdir(), 'otix-installer-debug.log'),
    `[START] ${new Date().toISOString()} execPath=${process.execPath} argv=${JSON.stringify(process.argv)} PORTABLE_EXECUTABLE_FILE=${process.env.PORTABLE_EXECUTABLE_FILE} PORTABLE_EXECUTABLE_DIR=${process.env.PORTABLE_EXECUTABLE_DIR} isInstallerMode=${isInstallerMode} isSetupExe=${isSetupExe}\n`
  );
} catch {}

// Single-instance lock: on Windows/Linux, deep links arrive via argv
// of a second instance rather than an open-url event.
if (!isInstallerMode && !isUninstallerMode) {
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

  // Register app:// scheme to serve the production frontend safely with SPA fallback
  const candidateDirs = [
    path.join(process.resourcesPath, 'frontend'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../dist'),
  ];
  const frontendDir = candidateDirs.find((p) => fs.existsSync(p)) || candidateDirs[0];

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };

  const handleAppProtocol = async (request: Request) => {
    try {
      const parsed = new URL(request.url);
      let relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (!relativePath) relativePath = 'index.html';

      let targetPath = path.normalize(path.join(frontendDir, relativePath));
      const normFrontendDir = path.normalize(frontendDir);
      if (!targetPath.startsWith(normFrontendDir)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(targetPath) && parsed.pathname.includes('/assets/')) {
        const assetsIdx = parsed.pathname.indexOf('/assets/');
        const fallbackAsset = path.normalize(path.join(frontendDir, parsed.pathname.slice(assetsIdx + 1)));
        if (fallbackAsset.startsWith(normFrontendDir) && fs.existsSync(fallbackAsset) && fs.statSync(fallbackAsset).isFile()) {
          targetPath = fallbackAsset;
        }
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        if (!ext || ext === '.html') {
          targetPath = path.join(frontendDir, 'index.html');
        } else {
          return new Response('Not found', { status: 404 });
        }
      }

      const fileUrl = pathToFileURL(targetPath).toString();
      const response = await net.fetch(fileUrl);
      const targetExt = path.extname(targetPath).toLowerCase();
      const mime = MIME_TYPES[targetExt];
      if (mime) {
        const headers = new Headers(response.headers);
        headers.set('content-type', mime);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    } catch (err) {
      console.error('[main] app protocol error:', err);
      return new Response('Internal error', { status: 500 });
    }
  };

  if (!sess.protocol.isProtocolHandled('app')) {
    sess.protocol.handle('app', handleAppProtocol);
  }
  if (!protocol.isProtocolHandled('app')) {
    protocol.handle('app', handleAppProtocol);
  }

  // If running in installer or uninstaller mode, open custom installer window and exit startup sequence
  if (isInstallerMode || isUninstallerMode) {
    createInstallerWindow(isUninstallerMode ? 'uninstaller' : 'installer');
    return;
  }

  // Register media-cache protocol handler for caching images locally
  sess.protocol.handle('media-cache', async (request: Request) => {
    const originalUrl = 'https://' + request.url.replace(/^media-cache:(?:\/\/)?/, '');
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

  let runningGameSyncTimer: NodeJS.Timeout | null = null;

  const syncRunningGamesToBackend = async (games: RunningGame[]) => {
    if (!currentAuthToken) return;
    const apiBase = getApiBaseUrl();
    const url = `${apiBase}/api/v1/library/game-running`;
    const isRunning = games.length > 0;
    const single = games[0];
    const payload = isRunning
      ? {
          running: true,
          game: {
            id: single.game.id,
            title: single.game.title,
            platform: single.game.platform || 'pc',
            exe_path: single.game.exePath || '',
            process_name: single.game.exePath ? path.basename(single.game.exePath) : (single.game as any).processName || '',
            otix_media_id: single.game.otixMediaId,
            poster_url: single.game.posterUrl || single.game.otixPosterUrl,
            backdrop_url: (single.game as any).backdropUrl,
            start_time: single.startTime,
          },
          games: games.map((g) => ({
            id: g.game.id,
            title: g.game.title,
            platform: g.game.platform || 'pc',
            exe_path: g.game.exePath || '',
            process_name: g.game.exePath ? path.basename(g.game.exePath) : (g.game as any).processName || '',
            otix_media_id: g.game.otixMediaId,
            poster_url: g.game.posterUrl || g.game.otixPosterUrl,
            backdrop_url: (g.game as any).backdropUrl,
            start_time: g.startTime,
          })),
        }
      : {
          running: false,
          game: null,
          games: [],
        };

    try {
      await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentAuthToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.debug('[main] Failed to sync running game to backend:', err);
    }
  };

  const syncGameSessionToBackend = async (sessions: PlaySession | PlaySession[]) => {
    if (!currentAuthToken) return;
    const apiBase = getApiBaseUrl();
    const url = `${apiBase}/api/v1/library/game-sessions`;
    const list = Array.isArray(sessions) ? sessions : [sessions];
    if (list.length === 0) return;
    const payload = { sessions: list };

    try {
      await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentAuthToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.debug('[main] Failed to sync game session to backend:', err);
    }
  };

  let desktopNodeHeartbeatTimer: NodeJS.Timeout | null = null;

  const syncDesktopNodeToBackend = async (isOnline = true) => {
    if (!currentAuthToken) return;
    const apiBase = getApiBaseUrl();
    const url = `${apiBase}/api/v1/library/nodes/desktop-heartbeat`;
    const deviceId = fetchBridge?.deviceId || os.hostname();
    const platformLabel =
      process.platform === 'darwin' ? 'This Mac' : process.platform === 'win32' ? 'This PC' : 'This computer';
    const name = `${platformLabel} (${os.hostname()})`;
    const runningList = gameDetector ? gameDetector.getRunningGames() : [];
    const totalFiles = gameDetector ? gameDetector.getLibrary().length : 0;

    const payload = {
      name,
      device_id: deviceId,
      is_online: isOnline,
      total_files: totalFiles,
      running_games: runningList.map((g) => ({
        id: g.game.id,
        title: g.game.title,
        platform: g.game.platform || 'pc',
        exe_path: g.game.exePath || '',
        process_name: g.game.exePath ? path.basename(g.game.exePath) : (g.game as any).processName || '',
        otix_media_id: g.game.otixMediaId,
        poster_url: g.game.posterUrl || g.game.otixPosterUrl,
        backdrop_url: (g.game as any).backdropUrl,
        start_time: g.startTime,
      })),
    };

    try {
      await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentAuthToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.debug('[main] Failed to sync desktop node heartbeat to backend:', err);
    }
  };

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
      node: runningGame.node ?? null,
      hardware: runningGame.hardware ?? null,
      shareEligible: runningGame.shareEligible ?? false,
    });

    if (gameDetector) {
      const runningList = gameDetector.getRunningGames();
      void syncRunningGamesToBackend(runningList);
      if (!runningGameSyncTimer) {
        runningGameSyncTimer = setInterval(() => {
          if (gameDetector && gameDetector.getRunningGames().length > 0) {
            void syncRunningGamesToBackend(gameDetector.getRunningGames());
          } else if (runningGameSyncTimer) {
            clearInterval(runningGameSyncTimer);
            runningGameSyncTimer = null;
          }
        }, 25000);
      }
    }
  });
  gameDetector.on('game:ended', (session) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:ended', session);
      mainWindow.webContents.send('game:sessions-updated', session);
    }
    eventBus.emit('game:ended', {
      gameId: session.gameId,
      gameTitle: session.gameTitle,
      startTime: session.startTime,
      endTime: session.endTime,
      launchedByOtix: session.launchedByOtix,
      node: session.node ?? null,
      hardware: session.hardware ?? null,
      shareEligible: session.shareEligible ?? false,
    });

    if (gameDetector) {
      const runningList = gameDetector.getRunningGames();
      void syncRunningGamesToBackend(runningList);
      if (runningList.length === 0 && runningGameSyncTimer) {
        clearInterval(runningGameSyncTimer);
        runningGameSyncTimer = null;
      }
    }

    // Auto-save backup or cloud sync on game session end
    void syncGameSessionToBackend(session);
    if (saveDaemon) {
      (async () => {
        try {
          const cloudSettings = await saveDaemon!.getCloudSettings(session.gameId);
          if (cloudSettings?.autoSync) {
            const profile = SaveService.getActiveProfile(session.gameId);
            const profileId = profile?.id || 'default';
            if (currentAuthToken) {
              await saveDaemon!.syncCloud(
                session.gameId,
                session.gameTitle,
                profileId,
                getApiBaseUrl(),
                currentAuthToken,
              );
            } else {
              const discovery = await saveDaemon!.discoverForGame(session.gameId, session.gameTitle);
              if (discovery.detectedPaths.length > 0) {
                await saveDaemon!.backupToVault(session.gameId, discovery.detectedPaths);
              }
            }
          }
        } catch (err) {
          console.warn(`[main] Auto-save backup for ${session.gameTitle} failed:`, err);
        }
      })();
    }
  });

  // FPS data now comes from the fps-capture plugin via eventBus (not GameDetector).
  eventBus.on('fps:live', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:fps', payload);
    }
  }, 'main');
  eventBus.on('fps:stats', (payload: any) => {
    if (payload?.gameId && payload?.fpsStats && gameDetector) {
      gameDetector.updateSessionFpsStats(payload.gameId, payload.fpsStats);
      const recent = gameDetector.getRecentSessions();
      const updated = recent.find((s) => s.gameId === payload.gameId);
      if (updated) {
        void syncGameSessionToBackend(updated);
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:fps-stats', payload);
      mainWindow.webContents.send('game:sessions-updated', payload);
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

  // Opens a URL in a standalone app window on the DEFAULT session — the same
  // session plugin OAuth windows use, so the window carries the user's
  // logged-in web session (e.g. Epic Games Store after Epic OAuth). It behaves
  // like a small in-app browser: back/forward navigation is supported and
  // target=_blank links navigate in place so history stays intact.
  ipcMain.handle('shell:open-session-window', (_event, url: string) => {
    openStandaloneWindow(url);
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

  const pluginsRepo = new PluginsRepository();

  // Rehydrate any installs that were running before Electron last closed
  if (dbReady) { try { rehydrateActiveInstalls() } catch (err) { console.error('[main] rehydrateActiveInstalls failed:', err) } }

  // Register modular IPC handlers (safe — registration doesn't touch DB)
  registerDownloadsIPC();
  registerScannerIPC(gameDetector);
  registerInstallerIPC();
  nodeDaemon = new NodeDaemonManager(app.getPath('userData'), process.resourcesPath);
  registerNodeDaemonIPC(nodeDaemon);
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
  saveDaemon = new SaveDaemon(path.join(app.getPath('userData'), 'saves'));
  registerSaveIPC(saveDaemon);

  // Populate known save locations from the built-in database (async, non-blocking)
  if (dbReady) { populateKnownLocations(saveDaemon) }

  createWindow();

  // ── Initialize plugin system ──
  if (dbReady) {
    const packagedPluginsDir = path.join(process.resourcesPath, 'plugins');
    const extensionsDir = isDev
      ? path.resolve(__dirname, '..', '..', 'extensions', 'plugins')
      : (fs.existsSync(packagedPluginsDir)
          ? packagedPluginsDir
          : path.join(app.getPath('userData'), 'extensions'));
    const devExtensionsDir = isDev
      ? path.join(app.getPath('userData'), 'extensions')
      : undefined;
    permissionManager = new PermissionManager();
    pluginManager = new PluginManager(extensionsDir, pluginsRepo, app.getPath('userData'), devExtensionsDir);
    pluginManager.setPermissionManager(permissionManager);
    saveDaemon?.setServiceRegistry(pluginManager.serviceRegistry);
    setPluginCaller((pluginId, method, args) => pluginManager!.callPluginData(pluginId, method, args));
    permissionManager.setWebContents(mainWindow!.webContents);
    registerPluginIPC(pluginManager, mainWindow!, permissionManager);
    cs2GsiManager = new Cs2GsiManager();
    cs2GsiManager.start().catch((err) => {
      console.warn('[main] Failed to start CS2 GSI listener:', err);
    });
    try {
      cs2GsiManager.setupCs2GsiConfig();
    } catch {
      // Non-fatal if Steam / CS directory is not yet found
    }
    cs2GsiManager.on('update', (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game:cs2-gsi-update', state);
      }
    });
    registerGameDetectorIPC(gameDetector, pluginManager, cs2GsiManager);

    // ── Initialize GameScanOrchestrator ──
    const orchestrator = new GameScanOrchestrator(pluginManager);
    orchestrator.setApiBaseUrl(getApiBaseUrl());

    // ── Proxy-fetch worker (Phase 2.2b) ──
    // Answers provider fetches for a connected Otix server that lacks the
    // provider key (desktop/fetch bridge): registers this device, holds the
    // user's fetch_request SSE stream, and mirrors with the user's local keys.
    fetchBridge = new FetchWorkerBridge({
      filePath: path.join(app.getPath('userData'), 'fetch-client.json'),
    });

    // Wire auth token changes
    const origSetAuth = pluginManager.setAuthToken.bind(pluginManager);
    pluginManager.setAuthToken = (token: string) => {
      origSetAuth(token);
      currentAuthToken = token;
      orchestrator.setAuthToken(token);
      fetchBridge?.setCredentials(getApiBaseUrl(), token);
      if (token) {
        void syncDesktopNodeToBackend(true);
        if (!desktopNodeHeartbeatTimer) {
          desktopNodeHeartbeatTimer = setInterval(() => {
            void syncDesktopNodeToBackend(true);
          }, 30000);
        }
        if (gameDetector && gameDetector.getRunningGames().length > 0) {
          void syncRunningGamesToBackend(gameDetector.getRunningGames());
        }
        if (gameDetector) {
          const recent = gameDetector.getRecentSessions();
          if (recent.length > 0) {
            void syncGameSessionToBackend(recent);
          }

        }
      } else {
        if (desktopNodeHeartbeatTimer) {
          clearInterval(desktopNodeHeartbeatTimer);
          desktopNodeHeartbeatTimer = null;
        }
      }
    };
    setScanOrchestrator(orchestrator);
    setPluginManager(pluginManager);
    // Dev-only: reload plugins when their source files change on disk
    pluginManager.watchPluginSources();
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
      const DEFAULT_PLUGINS = ['fps-capture', 'local-files'];
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
      // Mirror the IGDB source-plugin credentials into the proxy-fetch bridge so
      // a desktop whose launcher already fetches IGDB can serve that provider to
      // a connected Otix server. Refresh on later config edits (setConfig emits
      // plugin:config-changed). Only igdb auto-seeds here; tmdb + others await a
      // dedicated key store/UI (2.2c).
      const igdbPluginKeys = (): { client_id: string; client_secret: string } | null => {
        if (!fetchBridge) return null;
        const cfg = pluginManager!.getConfig('igdb-source');
        const clientId = cfg?.igdb_client_id;
        const clientSecret = cfg?.igdb_client_secret;
        if (typeof clientId === 'string' && clientId && typeof clientSecret === 'string' && clientSecret) {
          return { client_id: clientId, client_secret: clientSecret };
        }
        return null;
      };
      // Startup: seed the bridge only when the plugin already has IGDB keys and
      // the bridge store does not (a future dedicated key store may set igdb
      // independently, so never wipe on launch).
      const seededIgdb = igdbPluginKeys();
      if (seededIgdb && !fetchBridge!.configured.includes('igdb')) {
        fetchBridge!.setProvider('igdb', seededIgdb);
      }
      // Later plugin config edits mirror exactly (adding or removing igdb).
      eventBus.on('plugin:config-changed', ({ pluginId }) => {
        if (pluginId !== 'igdb-source') return;
        fetchBridge!.setProvider('igdb', igdbPluginKeys() ?? undefined);
      }, 'main');
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
    registerDesktopSettingsIPC(mainWindow, tray, nodeDaemon)

    // Register notification IPC
    registerNotificationIPC(mainWindow)

    // Handle startMinimized: hide window immediately
    if (settings.startMinimized && tray) {
      mainWindow.hide()
    }
  }

  // Launch embedded Otix Node companion daemon if enabled
  if (settings.embeddedNodeEnabled !== false && nodeDaemon) {
    nodeDaemon.start({ port: settings.embeddedNodePort || 8090 }).catch((err) => {
      console.warn('[main] Failed to launch embedded node daemon on startup:', err);
    });
  }

  // Check for auto-updates in the background (packaged release only)
  checkForUpdatesOnStartup();
  startPeriodicUpdateChecks();

  // Signal renderer that all IPC handlers are registered.
  // The renderer's loadFromDatabase() waits for this before calling IPC.
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('main:ipc-ready');
  });

  // ── Clean-quit signal for last-route restore ──
  app.on('before-quit', () => {
    console.log('[main] before-quit fired');
    isQuitting = true;
    stopPeriodicUpdateChecks();
    if (desktopNodeHeartbeatTimer) {
      clearInterval(desktopNodeHeartbeatTimer);
      desktopNodeHeartbeatTimer = null;
    }
    if (currentAuthToken) {
      void syncDesktopNodeToBackend(false);
      if (gameDetector && gameDetector.getRunningGames().length > 0) {
        void syncRunningGamesToBackend([]);
      }
    }
    mainWindow?.webContents.send('app:clean-quit');
    nodeDaemon?.dispose().catch(() => {});
    pluginManager?.shutdown().catch(() => {});
    cs2GsiManager?.stop().catch(() => {});
    fetchBridge?.stop();
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
  cs2GsiManager?.stop().catch(() => {});
  fetchBridge?.stop();
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
