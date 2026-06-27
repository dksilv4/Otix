import { EventEmitter } from 'events'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

// Use the real OS tmpdir so better-sqlite3 can create DB files
const tmpBase = path.join(os.tmpdir(), 'otix-test')
fs.mkdirSync(tmpBase, { recursive: true })

const mockApp = new EventEmitter() as any
mockApp.getPath = (name: string): string => {
  return path.join(tmpBase, name)
}
mockApp.getAppPath = () => path.join(tmpBase, 'app')
mockApp.isPackaged = false
mockApp.requestSingleInstanceLock = () => true
mockApp.setAsDefaultProtocolClient = () => {}
mockApp.commandLine = { appendSwitch: () => {} }

module.exports = {
  app: mockApp,
  BrowserWindow: class {},
  ipcMain: new EventEmitter(),
  dialog: {},
  shell: {},
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [],
  },
  session: { fromPartition: () => ({ webRequest: { onHeadersReceived: () => {} } }) },
}
