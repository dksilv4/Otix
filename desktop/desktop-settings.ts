import { app, BrowserWindow, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface DesktopSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  /** Whether GPU hardware acceleration is enabled (default: true). */
  hardwareAcceleration?: boolean;
  gamesDownloadPath?: string;
  gamesInstallPath?: string;
  isoDownloadPath?: string;
  /** Rescan configured library folders when the desktop app starts. */
  scanOnLaunch?: boolean;
  /** Custom executable path overrides per emulator ID (e.g. { pcsx2: 'D:/Emulators/PCSX2/pcsx2-qt.exe' }). */
  emulatorPaths?: Record<string, string>;
  /** Default emulator ID to use per platform (e.g. { ps2: 'pcsx2', snes: 'retroarch' }). */
  defaultPlatformEmulators?: Record<string, string>;
  /** Run the embedded Otix Node companion daemon in the background (default: true). */
  embeddedNodeEnabled?: boolean;
  /** Port for the embedded node daemon (default: 8090). */
  embeddedNodePort?: number;
  /** Automatically check for updates on startup (default: true). */
  autoCheckUpdates?: boolean;
  /** Automatically download update packages when available (default: true). */
  autoDownloadUpdates?: boolean;
  /** Include pre-release / beta builds when checking for updates (default: false). */
  allowPrerelease?: boolean;
  /** Personal Access Token for private GitHub updates. */
  githubToken?: string;
  /** In-game performance HUD overlay enabled (default: true). */
  overlayEnabled?: boolean;
  /** In-game performance HUD layout style (default: 'top-wide'). */
  overlayCorner?: string;
  /** In-game performance HUD assigned monitor (default: 'auto'). */
  overlayMonitor?: string;
  /** In-game performance HUD global toggle hotkey (default: 'Ctrl+`'). */
  overlayHotkey?: string;
  /** Show live FPS counter on HUD (default: true). */
  overlayShowFps?: boolean;
  /** Show 1% Low & Average framerates on HUD (default: true). */
  overlayShowPercentiles?: boolean;
  /** Show active session playtime clock on HUD (default: true). */
  overlayShowPlaytime?: boolean;
  /** Show game title and brand on HUD (default: true). */
  overlayShowTitle?: boolean;
  /** HUD opacity 0.0 - 1.0 (default: 0.92). */
  overlayOpacity?: number;
  /** Attached display monitors enumerated by the local node daemon. */
  overlayMonitors?: Array<{ id: string; name: string; device?: string; width?: number; height?: number; is_primary?: boolean; isPrimary?: boolean; left?: number; top?: number }>;
  /** Only detect and track FPS/sessions for games scanned in library or mapped in custom mappings (default: true). */
  onlyTrackScannedGames?: boolean;
  /** Backend API base URL override (e.g. http://127.0.0.1:8000 or https://otix.app). */
  apiBaseUrl?: string;
}

export function getDefaultGamesInstallPath(): string {
  if (process.platform === 'win32') {
    const drive = process.env.SystemDrive || 'C:';
    return `${drive}\\Otix`;
  }
  try {
    return path.join(app.getPath('home'), 'Otix');
  } catch {
    return '/Otix';
  }
}

const DEFAULT_SETTINGS: DesktopSettings = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  hardwareAcceleration: true,
  gamesDownloadPath: '',
  gamesInstallPath: getDefaultGamesInstallPath(),
  isoDownloadPath: '',
  scanOnLaunch: false,
  embeddedNodeEnabled: true,
  embeddedNodePort: 8090,
  autoCheckUpdates: true,
  autoDownloadUpdates: true,
  allowPrerelease: false,
  githubToken: '',
  overlayEnabled: true,
  overlayCorner: 'top-wide',
  overlayMonitor: 'auto',
  overlayHotkey: 'Ctrl+`',
  overlayShowFps: true,
  overlayShowPercentiles: true,
  overlayShowPlaytime: true,
  overlayShowTitle: true,
  overlayOpacity: 0.92,
  onlyTrackScannedGames: true,
  emulatorPaths: {},
  defaultPlatformEmulators: {
    snes: 'retroarch',
    nes: 'retroarch',
    gba: 'retroarch',
    gb: 'retroarch',
    gbc: 'retroarch',
    n64: 'retroarch',
    genesis: 'retroarch',
    mastersystem: 'retroarch',
    gamegear: 'retroarch',
    saturn: 'retroarch',
    arcade: 'retroarch',
    ps1: 'duckstation',
    ps2: 'pcsx2',
    ps3: 'rpcs3',
    gamecube: 'dolphin',
    wii: 'dolphin',
    wiiu: 'cemu',
    switch: 'ryujinx',
    psp: 'ppsspp',
    nds: 'melonds',
    '3ds': 'citra',
    xbox360: 'xenia',
    dreamcast: 'flycast',
  },
};

let cachedSettings: DesktopSettings | null = null;
let trayRef: Tray | null = null;
let winRef: BrowserWindow | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

export function loadDesktopSettings(): DesktopSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
    cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
    if (!cachedSettings.gamesInstallPath) {
      cachedSettings.gamesInstallPath = getDefaultGamesInstallPath();
    }
    return cachedSettings;
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
  }
}

export function saveDesktopSettings(settings: DesktopSettings): void {
  cachedSettings = settings;
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[desktop-settings] Failed to save settings:', err);
  }
}

export function getSettings(): DesktopSettings {
  if (!cachedSettings) return loadDesktopSettings();
  return cachedSettings;
}

/** Apply side effects of settings that require main-process APIs. */
export function applyDesktopSettings(
  settings: DesktopSettings,
  mainWindow: BrowserWindow,
  tray: Tray | null,
): void {
  winRef = mainWindow;
  trayRef = tray;

  // Launch on startup
  app.setLoginItemSettings({
    openAtLogin: settings.launchOnStartup,
  });

  // Always on top
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
}

/** Set the tray reference so close-to-tray logic can call tray methods later. */
export function setTrayRef(tray: Tray | null): void {
  trayRef = tray;
}
