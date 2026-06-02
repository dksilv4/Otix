import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { GameDetector } from './game-detector';
import { registerDownloadsIPC } from './ipc/downloads';
import { registerScannerIPC } from './ipc/scanner';
import { registerInstallerIPC } from './ipc/installer';
import { registerGameDetectorIPC } from './ipc/game-detector';
import { ensureDb } from './db';
import { scheduledUpdateCheck } from './downloads';

let mainWindow: BrowserWindow | null = null;
let gameDetector: GameDetector | null = null;
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
  const saved = loadWindowState()
  const bounds = saved ? ensureVisible(saved) : DEFAULT_SIZE

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'Otix',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      partition: 'persist:main',
    },
  });

  if (saved?.maximized) {
    mainWindow.maximize()
  }

  // Save window state on resize, move, maximize, unmaximize, and close
  mainWindow.on('resize', () => saveWindowState(mainWindow!))
  mainWindow.on('move', () => saveWindowState(mainWindow!))
  mainWindow.on('maximize', () => saveWindowState(mainWindow!))
  mainWindow.on('unmaximize', () => saveWindowState(mainWindow!))

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
}

app.on('ready', () => {
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

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game Directory or Steam Library Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Register modular IPC handlers
  registerDownloadsIPC();
  registerScannerIPC(gameDetector);
  registerInstallerIPC();
  registerGameDetectorIPC(gameDetector);

  // Initialize database eagerly so failures surface at startup, not on first IPC call
  ensureDb().catch((err) => console.error('[main] DB init failed:', err));

  createWindow();

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
