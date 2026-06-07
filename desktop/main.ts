import { app, BrowserWindow, ipcMain, dialog, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { GameDetector } from './game-detector';
import { registerDownloadsIPC } from './ipc/downloads';
import { registerScannerIPC } from './ipc/scanner';
import { registerInstallerIPC } from './ipc/installer';
import { registerGameDetectorIPC } from './ipc/game-detector';
import { registerWindowIPC, notifyMaximizedChange } from './ipc/window';
import { registerDesktopSettingsIPC } from './ipc/settings';
import { loadDesktopSettings, applyDesktopSettings, getSettings } from './desktop-settings';
import { createTray, destroyTray, setTrayVisible, isTrayActive } from './tray';
import { ensureDb } from './db';
import { scheduledUpdateCheck } from './downloads';
import { SaveDaemon } from './save-daemon';
import { registerSaveIPC } from './ipc/saves';
import { populateKnownLocations } from './save-export';

let mainWindow: BrowserWindow | null = null;
let gameDetector: GameDetector | null = null;
let pendingDeepLink: string | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
    saveWindowState(mainWindow!)
    const settings = getSettings()
    if (settings.closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173/');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}`);
  }

  mainWindow.on('closed', () => {
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
  gameDetector = new GameDetector(app.getPath('userData'));

  // Forward game detection events to renderer
  gameDetector.on('game:started', (runningGame) => {
    mainWindow?.webContents.send('game:started', runningGame);
  });
  gameDetector.on('game:ended', (session) => {
    mainWindow?.webContents.send('game:ended', session);
  });

  // General utilities
  ipcMain.handle('ping', () => 'pong');

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
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

  // Init DB before any IPC handler or window — eliminates race where frontend calls
  // DB-dependent handlers before DB is ready.
  await ensureDb().catch((err) => {
    console.error('[main] DB init failed:', err);
    throw err;
  });

  // Register modular IPC handlers
  registerDownloadsIPC();
  registerScannerIPC(gameDetector);
  registerInstallerIPC();
  registerGameDetectorIPC(gameDetector);

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
  populateKnownLocations(saveDaemon);

  createWindow();

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

  // ── Scheduled update check ──
  // First check 5 minutes after startup, then every 12 hours
  setTimeout(() => {
    scheduledUpdateCheck().catch((err) =>
      console.error('[main] Initial update check failed:', err)
    );
  }, 5 * 60 * 1000);

  setInterval(() => {
    scheduledUpdateCheck().catch((err) =>
      console.error('[main] Periodic update check failed:', err)
    );
  }, 12 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  gameDetector?.stopAll();
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
