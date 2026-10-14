import { ipcMain } from 'electron';
import type { NodeDaemonManager, NodeDaemonStatus } from '../node-daemon';

export function registerNodeDaemonIPC(daemon: NodeDaemonManager): void {
  ipcMain.handle('node-daemon:get-status', (): NodeDaemonStatus => {
    return daemon.getStatus();
  });

  ipcMain.handle('node-daemon:start', async (_event, port?: number): Promise<NodeDaemonStatus> => {
    return await daemon.start(port ? { port } : undefined);
  });

  ipcMain.handle('node-daemon:stop', async (): Promise<NodeDaemonStatus> => {
    return await daemon.stop();
  });

  ipcMain.handle('node-daemon:restart', async (_event, port?: number): Promise<NodeDaemonStatus> => {
    return await daemon.restart(port ? { port } : undefined);
  });
}
