import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const img = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    img.setTemplateImage(true);
  }
  return img;
}

export function createTray(mainWindow: BrowserWindow): Tray {
  if (tray) {
    destroyTray();
  }

  const icon = loadIcon();
  tray = new Tray(icon);

  // macOS: single click shows the menu; we also show on click
  if (process.platform === 'darwin') {
    tray.setPressedImage(icon);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Otix',
      click: () => {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Otix');
  tray.setContextMenu(contextMenu);

  // Clicking the tray icon shows the window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function setTrayVisible(visible: boolean): void {
  if (visible && !tray) {
    // Can't create tray without a window reference here — call createTray externally
    return;
  }
  if (!visible && tray) {
    destroyTray();
  }
}

/** Check if tray is currently active */
export function isTrayActive(): boolean {
  return tray !== null;
}
