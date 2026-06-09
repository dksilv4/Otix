import { app, BrowserWindow, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export type AiModelStatus = 'not_available' | 'downloading' | 'loading' | 'ready' | 'error';

export interface DesktopSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  aiAddonEnabled: boolean;
  aiModelStatus: AiModelStatus;
  aiSystemPrompt: string;
}

const DEFAULT_PROMPT = 'You are a helpful assistant that helps users discover movies, TV shows, games, and music. You have access to a media library. Keep responses concise and friendly.';

const DEFAULT_SETTINGS: DesktopSettings = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  aiAddonEnabled: false,
  aiModelStatus: 'not_available',
  aiSystemPrompt: DEFAULT_PROMPT,
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
