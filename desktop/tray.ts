import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;

let updaterState: {
  status: string;
  version?: string;
  progressPercent?: number;
} = {
  status: 'idle',
};

function loadIcon(): Electron.NativeImage {
  const p1 = path.join(process.resourcesPath, 'assets', 'tray-icon.png');
  const iconPath = fs.existsSync(p1) ? p1 : path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const img = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    img.setTemplateImage(true);
  }
  return img;
}

function showMainWindow(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.show();
  if (mainWindowRef.isMinimized()) mainWindowRef.restore();
  mainWindowRef.focus();
}

function buildContextMenu(): Menu {
  const menuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Show Otix',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
  ];

  // Dynamic update item based on current updater state
  if (updaterState.status === 'downloaded') {
    menuItems.push({
      label: updaterState.version
        ? `Restart to Install v${updaterState.version}`
        : 'Restart to Install Update',
      click: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { installDownloadedUpdate } = require('./ipc/updater');
          installDownloadedUpdate?.();
        } catch (err) {
          console.error('[tray] Failed to install update:', err);
        }
      },
    });
  } else if (updaterState.status === 'available') {
    menuItems.push({
      label: updaterState.version
        ? `Download Update v${updaterState.version}`
        : 'Download Update',
      click: () => {
        showMainWindow();
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { downloadAvailableUpdate } = require('./ipc/updater');
          downloadAvailableUpdate?.();
        } catch (err) {
          console.error('[tray] Failed to download update:', err);
        }
      },
    });
  } else if (updaterState.status === 'downloading') {
    const percentText =
      updaterState.progressPercent !== undefined
        ? ` (${updaterState.progressPercent}%)`
        : '';
    menuItems.push({
      label: `Downloading Update...${percentText}`,
      enabled: false,
    });
  } else if (updaterState.status === 'checking') {
    menuItems.push({
      label: 'Checking for Updates...',
      enabled: false,
    });
  } else {
    menuItems.push({
      label: 'Check for Updates...',
      click: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { triggerManualUpdateCheck } = require('./ipc/updater');
          triggerManualUpdateCheck?.();
        } catch (err) {
          console.error('[tray] Failed to check for updates:', err);
        }
      },
    });
  }

  menuItems.push({ type: 'separator' }, {
    label: 'Quit',
    click: () => {
      tray?.destroy();
      tray = null;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(menuItems);
}

export function updateTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
  if (updaterState.status === 'downloaded') {
    tray.setToolTip(`Otix (v${updaterState.version || 'Update'} ready to install)`);
  } else {
    tray.setToolTip('Otix');
  }
}

export function setTrayUpdaterState(payload: {
  status: string;
  version?: string;
  progress?: { percent: number };
}): void {
  updaterState = {
    status: payload.status,
    version: payload.version,
    progressPercent: payload.progress?.percent,
  };
  updateTrayMenu();
}

export function createTray(mainWindow: BrowserWindow): Tray {
  mainWindowRef = mainWindow;

  if (tray) {
    destroyTray();
  }

  const icon = loadIcon();
  tray = new Tray(icon);

  // macOS: single click shows the menu; we also show on click
  if (process.platform === 'darwin') {
    tray.setPressedImage(icon);
  }

  tray.setToolTip('Otix');
  tray.setContextMenu(buildContextMenu());

  // Clicking the tray icon shows the window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      showMainWindow();
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
