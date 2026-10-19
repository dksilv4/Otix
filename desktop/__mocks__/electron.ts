import { EventEmitter } from 'events'
import * as os from 'os'
import * as path from 'path'

const tmpBase = path.join(os.tmpdir(), 'otix-test')

const mockApp = new EventEmitter() as any
mockApp.getPath = (name: string): string => {
  return path.join(tmpBase, name)
}
mockApp.getAppPath = () => path.join(tmpBase, 'app')
mockApp.isPackaged = false
mockApp.requestSingleInstanceLock = () => true
mockApp.setAsDefaultProtocolClient = () => {}
mockApp.commandLine = { appendSwitch: () => {} }

const mockIpcMain = new EventEmitter() as any
const ipcHandlers = new Map<string, Function>()
mockIpcMain.handle = (channel: string, handler: Function) => {
  ipcHandlers.set(channel, handler)
}
mockIpcMain.removeHandler = (channel: string) => {
  ipcHandlers.delete(channel)
}
mockIpcMain._invoke = async (channel: string, ...args: any[]) => {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({ sender: {} }, ...args)
}
mockApp.getVersion = () => '0.1.0'

module.exports = {
  app: mockApp,
  BrowserWindow: class {},
  ipcMain: mockIpcMain,
  dialog: {},
  shell: {},
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [],
  },
  session: { fromPartition: () => ({ webRequest: { onHeadersReceived: () => {} } }) },
}
