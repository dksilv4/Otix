import { app, BrowserWindow, protocol, session as electronSession } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { getApiBaseUrl } from './config';
import { loadDesktopSettings } from './desktop-settings';
import type { StagedBootManager } from './boot/staged-boot';

// ── Fast Early Single-Instance Lock Check ─────────────────────────────────────
const isSetupExe =
  path.basename(process.execPath).toLowerCase().includes('setup') ||
  Boolean(
    process.env.PORTABLE_EXECUTABLE_FILE &&
    path.basename(process.env.PORTABLE_EXECUTABLE_FILE).toLowerCase().includes('setup') &&
    process.execPath.toLowerCase().includes('temp'),
  );

const isInstallerMode = process.argv.includes('--installer') || process.env.OTIX_INSTALLER === '1' || isSetupExe;
const isUninstallerMode = process.argv.includes('--uninstall') || process.env.OTIX_UNINSTALLER === '1';

if (!isInstallerMode && !isUninstallerMode) {
  const gotSingleLock = app.requestSingleInstanceLock();
  if (!gotSingleLock) {
    // A primary instance of Otix is already running.
    // Electron's C++ layer has already forwarded process.argv to the primary instance.
    // Terminate immediately with app.exit(0) so Windows never flashes or spawns a ghost window.
    app.exit(0);
  }
}

// ── High-Performance Non-Blocking Buffered File Logging ────────────────────────
const logFile = path.join(os.homedir(), 'otix-desktop.log');
let logStream: fs.WriteStream | null = null;
let logBuffer: string[] = [];
let logFlushTimer: NodeJS.Timeout | null = null;

function flushLogBuffer() {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  if (logBuffer.length === 0) return;
  try {
    if (!logStream) {
      logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }
    const chunk = logBuffer.join('');
    logBuffer = [];
    logStream.write(chunk);
  } catch {
    logBuffer = [];
  }
}

function formatLogArg(a: any): string {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object' && a !== null) {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }
  return String(a);
}

function fileLog(...args: any[]) {
  try {
    const text = args.length === 1 && typeof args[0] === 'string'
      ? args[0]
      : args.map(formatLogArg).join(' ');
    logBuffer.push(`[${new Date().toISOString()}] ${text}\n`);
    if (logBuffer.length >= 50) {
      flushLogBuffer();
    } else if (!logFlushTimer) {
      logFlushTimer = setTimeout(flushLogBuffer, 100);
    }
  } catch {}
}

process.on('beforeExit', flushLogBuffer);
process.on('exit', () => {
  if (logBuffer.length > 0) {
    try {
      fs.appendFileSync(logFile, logBuffer.join(''));
      logBuffer = [];
    } catch {}
  }
});

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
console.log = (...args: any[]) => { fileLog('[LOG]', ...args); origLog(...args); };
console.error = (...args: any[]) => { fileLog('[ERR]', ...args); origErr(...args); };
console.warn = (...args: any[]) => { fileLog('[WARN]', ...args); origWarn(...args); };

process.on('uncaughtException', (err) => {
  console.error('[main:FATAL uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main:FATAL unhandledRejection]', reason);
});

// Register privileged schemes before app ready
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
  {
    scheme: 'local-media',
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

import { setDefaultAutoSelectFamily } from 'node:net';
setDefaultAutoSelectFamily(false);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// GPU, V8 Bytecode Caching and Display Performance switches
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-disk-cache');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('v8-cache-options', 'code');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

try {
  const initialDesktopSettings = loadDesktopSettings();
  if (initialDesktopSettings.hardwareAcceleration === false || process.argv.includes('--disable-gpu')) {
    console.log('[main] Disabling GPU hardware acceleration (configured in settings or --disable-gpu flag)');
    app.disableHardwareAcceleration();
  }
} catch (err) {
  console.warn('[main] Failed to evaluate hardwareAcceleration desktop setting on startup:', err);
}

// Watch for GPU child process crashes and force repaint upon recovery
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU') {
    console.error('[main] GPU child process gone:', details.reason, 'exitCode:', details.exitCode);
    const win = bootManager?.getContext().mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.invalidate();
    }
  }
});

// ── Custom Protocol (otix://) and Media File Launching ─────────────────────────
const PROTOCOL = 'otix';
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.3gp', '.ts',
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma',
]);

function findMediaFileArg(argv: string[]): string | null {
  for (const raw of argv) {
    if (!raw || typeof raw !== 'string') continue;
    const arg = raw.replace(/^"|"$/g, '').trim();
    if (!arg || arg.startsWith('-') || arg.startsWith(`${PROTOCOL}://`)) continue;
    try {
      const ext = path.extname(arg).toLowerCase();
      if (MEDIA_EXTENSIONS.has(ext) && fs.existsSync(arg)) {
        return path.resolve(arg);
      }
    } catch {}
  }
  return null;
}

export function registerDefaultProtocolClient(): void {
  try {
    if (process.defaultApp || !app.isPackaged) {
      const appPath = path.resolve(__dirname, '..');
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  } catch (err) {
    console.warn('[main] Failed to register default protocol client:', err);
  }
}

let pendingDeepLink: string | null = null;
const initialDeepLink = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`));
const initialMediaFile = findMediaFileArg(process.argv);
if (initialDeepLink) {
  pendingDeepLink = initialDeepLink;
} else if (initialMediaFile) {
  pendingDeepLink = `otix://media/play?path=${encodeURIComponent(initialMediaFile)}`;
}

// ── Auto-Elevation Check ──────────────────────────────────────────────────────

function isProcessElevated(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execSync('fltmc', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (process.platform === 'win32' && (isInstallerMode || isUninstallerMode) && !isProcessElevated() && !process.argv.includes('--no-elevate')) {
  const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const modeArg = isUninstallerMode ? '--uninstall' : '--installer';
  const psCmd = `Start-Process -FilePath '${targetExe.replace(/'/g, "''")}' -ArgumentList '${modeArg}' -Verb RunAs`;
  try {
    execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { stdio: 'ignore' });
    process.exit(0);
  } catch (elevErr) {
    console.warn('[main] Auto-elevation declined or cancelled by user:', elevErr);
  }
}

// Primary instance: register second-instance handler for deep-links and file opens
let bootManager: StagedBootManager | null = null;

if (!isInstallerMode && !isUninstallerMode) {
  app.on('second-instance', (_event, argv) => {
    const dl = argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
    const mediaFile = findMediaFileArg(argv);
    const targetLink = dl || (mediaFile ? `otix://media/play?path=${encodeURIComponent(mediaFile)}` : null);
    if (targetLink && bootManager) bootManager.handleDeepLink(targetLink);
    const ctx = bootManager?.getContext();
    const win = ctx?.mainWindow;
    const splash = ctx?.splashWindow;
    if (splash && !splash.isDestroyed() && splash.isVisible()) {
      splash.focus();
    } else if (!win || win.isDestroyed()) {
      bootManager?.boot();
    } else {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith(`${PROTOCOL}://`)) {
    if (bootManager) bootManager.handleDeepLink(url);
    else pendingDeepLink = url;
  }
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const url = `otix://media/play?path=${encodeURIComponent(filePath)}`;
  if (bootManager) {
    bootManager.handleDeepLink(url);
    const win = bootManager.getContext().mainWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  } else {
    pendingDeepLink = url;
  }
});

async function createInstallerWindow(mode: 'installer' | 'uninstaller') {
  const isUninstaller = mode === 'uninstaller';
  const width = isUninstaller ? 600 : 780;
  const height = isUninstaller ? 400 : 540;

  const iconPath = fs.existsSync(path.join(process.resourcesPath, 'assets', 'icon.png'))
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '..', 'assets', 'icon.png');

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
    show: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--otix-api-base-url=${getApiBaseUrl()}`],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      partition: 'persist:main',
      backgroundThrottling: false,
    },
  });

  const { registerAppInstallerIPC } = await import('./ipc/app-installer');
  registerAppInstallerIPC(win);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 800);

  const pagePath = isUninstaller ? 'uninstaller' : 'installer';
  const targetUrl = isDev && process.env.NODE_ENV === 'development'
    ? `http://127.0.0.1:5174/${pagePath}`
    : `app://otix/${pagePath}`;

  win.webContents.session.clearCache().catch(() => {}).finally(() => {
    if (!win.isDestroyed()) {
      void win.loadURL(targetUrl);
    }
  });

  win.on('closed', () => {
    app.quit();
  });

  return win;
}

export function markAppQuitting(): void {
  bootManager?.markQuitting();
}

// ── Application Ready Entry Point ──────────────────────────────────────────────
app.on('ready', async () => {
  if (isInstallerMode || isUninstallerMode) {
    const { registerAppProtocol } = await import('./boot/protocols');
    const sess = electronSession.fromPartition('persist:main');
    registerAppProtocol(sess, process.resourcesPath, __dirname);
    await createInstallerWindow(isUninstallerMode ? 'uninstaller' : 'installer');
    return;
  }

  // Lazy-load StagedBootManager so main.js require is near-instantaneous
  const { StagedBootManager } = await import('./boot/staged-boot');
  bootManager = new StagedBootManager(isDev);
  if (pendingDeepLink) {
    bootManager.setPendingDeepLink(pendingDeepLink);
    pendingDeepLink = null;
  }
  await bootManager.boot();
});
