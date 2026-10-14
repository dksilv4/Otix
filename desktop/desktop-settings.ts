import { app, BrowserWindow, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface DesktopSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
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
}

const DEFAULT_SETTINGS: DesktopSettings = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  gamesDownloadPath: '',
  gamesInstallPath: '',
  isoDownloadPath: '',
  scanOnLaunch: false,
  embeddedNodeEnabled: true,
  embeddedNodePort: 8090,
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
