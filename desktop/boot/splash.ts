import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export function createSplashWindow(): BrowserWindow {
  const desktopRootDir = path.resolve(__dirname, '..');
  const appDistDir = path.join(desktopRootDir, 'dist');

  const p1 = process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'icon.png') : '';
  const iconPath = p1 && fs.existsSync(p1) ? p1 : path.join(desktopRootDir, 'assets', 'icon.png');

  const splash = new BrowserWindow({
    width: 320,
    height: 360,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#07080a',
    title: 'Otix',
    icon: iconPath,
    show: false,
    center: true,
    hasShadow: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(appDistDir, 'splash-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const splashHtmlPath =
    process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'assets', 'splash.html'))
      ? path.join(process.resourcesPath, 'assets', 'splash.html')
      : path.join(desktopRootDir, 'assets', 'splash.html');

  if (fs.existsSync(splashHtmlPath)) {
    void splash.loadFile(splashHtmlPath);
  }

  splash.once('ready-to-show', () => {
    if (!splash.isDestroyed()) {
      splash.show();
      splash.focus();
    }
  });

  return splash;
}

export function closeSplashWindow(splash: BrowserWindow | null): void {
  if (splash && !splash.isDestroyed()) {
    try {
      splash.close();
    } catch {
      // ignore
    }
  }
}
