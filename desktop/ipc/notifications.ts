import { Notification } from 'electron';
import { ipcMain, BrowserWindow } from 'electron';

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
      icon: opts.icon,
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
