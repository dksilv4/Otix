import { Notification } from 'electron';
import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function getDefaultNotificationIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'assets', 'icon.png'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(__dirname, '../../assets/icon.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

interface NotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export function registerNotificationIPC(mainWindow: BrowserWindow): void {
  try {
    ipcMain.removeHandler('notifications:show');
  } catch {}

  ipcMain.handle('notifications:show', async (_event, opts: NotificationPayload) => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      icon: opts.icon || getDefaultNotificationIcon(),
    });
    notification.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('notifications:navigate', {
          type: opts.type,
          metadata: opts.metadata,
        });
      }
    });
    notification.show();
  });
}
