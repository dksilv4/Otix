// desktop/plugins/ipc.ts
// IPC surface for the plugin feature. All plugin channels registered here so the
// engine is self-contained (see oauth-window.ts for the OAuth login helper).

import { ipcMain, BrowserWindow } from 'electron'
import type { PluginManager } from './manager'
import type { PermissionManager } from './permissions'
import { eventBus } from './event-bus'
import { openOAuthWindow } from './oauth-window'

// The main window can be recreated (e.g. macOS activate after close), so the
// reference is stored here and refreshed via setPluginMainWebContents rather
// than derived from BrowserWindow.getAllWindows()[0] — which can point at a
// secondary window (OAuth popup, standalone link window) once the main window
// has been recreated, causing valid renderer IPC to be rejected.
let mainWebContents: Electron.WebContents | null = null
let cleanupForwarders: (() => void)[] = []

export function setPluginMainWebContents(webContents: Electron.WebContents | null): void {
  mainWebContents = webContents
}

function safeHandle(channel: string, listener: (...args: any[]) => any): void {
  try {
    ipcMain.removeHandler(channel)
  } catch {}
  ipcMain.handle(channel, listener)
}

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  if (event.sender !== mainWebContents) {
    throw new Error('IPC call from unauthorized sender')
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`)
  }
}

export function registerPluginIPC(
  pluginManager: PluginManager,
  mainWindow: BrowserWindow,
  permissionManager?: PermissionManager,
): void {
  mainWebContents = mainWindow.webContents

  // ── Forward main-process plugin change events to the renderer ──
  cleanupForwarders.forEach((unsub) => unsub())
  cleanupForwarders = []

  const forward = <T extends 'plugin:config-changed' | 'plugin:status-changed' | 'plugin:slots-changed'>(
    channel: T,
  ) => {
    const unsub = eventBus.on(channel, (payload) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload)
      }
    }, 'ipc')
    cleanupForwarders.push(unsub)
  }
  forward('plugin:config-changed')
  forward('plugin:status-changed')
  forward('plugin:slots-changed')

  // ── Query handlers (no sender validation needed) ──
  safeHandle('plugin:list', async () => {
    return await pluginManager.getAllPluginsWithStatuses()
  })

  safeHandle('plugin:get', async (_event, id: string) => {
    return pluginManager.getPlugin(id)
  })

  safeHandle('plugin:discover', async () => {
    return await pluginManager.discoverPlugins()
  })

  safeHandle('plugin:get-config', async (_event, pluginId: string) => {
    return await pluginManager.getConfig(pluginId)
  })

  safeHandle('plugin:get-status', async (_event, pluginId: string) => {
    return await pluginManager.getPluginStatus(pluginId)
  })

  safeHandle('plugin:get-activity', async () => {
    return pluginManager.getActivity()
  })

  // ── Slot endpoints ──
  safeHandle('plugin:get-slot-data', async (_event, location: string, context?: Record<string, unknown>) => {
    return await pluginManager.getSlotData(location, context)
  })

  safeHandle('plugin:get-page-slot-data', async (_event, pageId: string) => {
    return await pluginManager.getPageSlotData(pageId)
  })

  safeHandle('plugin:get-plugin-tabs', async () => {
    return pluginManager.getPluginTabs()
  })

  // ── Mutating handlers (sender validation required) ──
  safeHandle('plugin:uninstall', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.uninstall(id)
  })

  safeHandle('plugin:enable', async (_event, id: string) => {
    assertString(id, 'id')
    return await pluginManager.enable(id)
  })

  safeHandle('plugin:disable', async (_event, id: string) => {
    assertString(id, 'id')
    return await pluginManager.disable(id)
  })

  safeHandle('plugin:reload', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    await pluginManager.reload(id)
    return await pluginManager.getAllPlugins()
  })

  safeHandle('plugin:set-config', async (_event, pluginId: string, key: string, value: unknown) => {
    return await pluginManager.setConfig(pluginId, key, value)
  })

  safeHandle('plugin:set-auth-token', async (event, token: string) => {
    validateSender(event)
    pluginManager.setAuthToken(token)
  })

  safeHandle('plugin:set-api-base-url', async (event, url: string) => {
    validateSender(event)
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('API base URL must use http: or https: protocol')
    }
    pluginManager.setApiBaseUrl(url)
  })

  // ── Data calls ──
  safeHandle('plugin:call-data', async (event, pluginId: string, method: string, ...args: unknown[]) => {
    validateSender(event)
    assertString(pluginId, 'pluginId')
    assertString(method, 'method')
    return await pluginManager.callPluginData(pluginId, method, ...args)
  })

  safeHandle('plugin:test-instance', async (_event, url: string, apiKey: string) => {
    return await pluginManager.testInstance(url, apiKey)
  })

  safeHandle('plugin:test-config', async (_event, pluginId: string, configDraft: Record<string, unknown>) => {
    return await pluginManager.testPluginConfig(pluginId, configDraft)
  })

  safeHandle('plugin:emit-event', async (event, eventName: string, payload: unknown) => {
    validateSender(event)
    eventBus.emit(eventName as any, payload)
  })

  // ── Permission responses ──
  safeHandle('plugin:respond-permission', async (_event, requestId: string, response: { granted: boolean; duration?: string }) => {
    if (!permissionManager) throw new Error('PermissionManager not available')
    permissionManager.respondToRequest(requestId, {
      granted: response.granted,
      duration: response.duration === 'always' ? 'always' : 'once',
    })
  })

  // ── API base URL ──
  safeHandle('plugin:get-api-base-url', async () => {
    return pluginManager.getApiBaseUrl()
  })

  // ── Free games ──
  safeHandle('free-games:get-all', async () => {
    return await pluginManager.freeGames.getAll()
  })

  safeHandle('free-games:refresh', async () => {
    return await pluginManager.freeGames.refresh()
  })

  // ── OAuth window ──
  safeHandle('plugin:open-oauth-window', async (event, url: string, redirectPattern: string, options?: {
    tokenExtraction?: { type: 'url-param' | 'web-request' | 'local-storage'; key?: string }
  }) => {
    validateSender(event)
    assertString(url, 'url')
    assertString(redirectPattern, 'redirectPattern')
    return openOAuthWindow(url, redirectPattern, options)
  })
}
