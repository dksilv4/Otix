import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashAPI', {
  onStatus: (callback: (payload: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('splash:status', handler);
    return () => ipcRenderer.removeListener('splash:status', handler);
  },
});
