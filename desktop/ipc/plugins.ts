import { ipcMain, BrowserWindow } from 'electron'
import type { PluginManager } from '../plugins/manager'
import type { PermissionManager } from '../plugins/permissions'
import type { GameScanOrchestrator } from '../game/orchestrator'
import { eventBus } from '../plugins/event-bus'

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (event.sender !== mainWindow?.webContents) {
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
  // ── Query handlers (no sender validation needed) ──
  ipcMain.handle('plugin:list', async () => {
    return await pluginManager.getAllPlugins()
  })

  ipcMain.handle('plugin:get', async (_event, id: string) => {
    return pluginManager.getPlugin(id)
  })

  ipcMain.handle('plugin:discover', async () => {
    return await pluginManager.discoverPlugins()
  })

  ipcMain.handle('plugin:get-config', async (_event, pluginId: string) => {
    return await pluginManager.getConfig(pluginId)
  })

  ipcMain.handle('plugin:get-status', async (_event, pluginId: string) => {
    return await pluginManager.getPluginStatus(pluginId)
  })

  ipcMain.handle('plugin:get-repos', async () => {
    return await pluginManager.getRepos()
  })

  ipcMain.handle('plugin:fetch-marketplace', async () => {
    return await pluginManager.fetchMarketplace()
  })

  // ── Slot endpoints ──
  ipcMain.handle('plugin:get-slot-data', async (_event, location: string) => {
    return await pluginManager.getSlotData(location)
  })

  ipcMain.handle('plugin:get-page-slot-data', async (_event, pageId: string) => {
    return await pluginManager.getPageSlotData(pageId)
  })

  ipcMain.handle('plugin:get-plugin-tabs', async () => {
    return pluginManager.getPluginTabs()
  })

  // ── Mutating handlers (sender validation required) ──
  ipcMain.handle('plugin:install', async (event, repoUrl: string, pluginPath?: string) => {
    validateSender(event)
    assertString(repoUrl, 'repoUrl')
    return await pluginManager.installFromGit(repoUrl, pluginPath)
  })

  ipcMain.handle('plugin:uninstall', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.uninstall(id)
  })

  ipcMain.handle('plugin:update', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.updatePlugin(id)
  })

  ipcMain.handle('plugin:enable', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.enable(id)
  })

  ipcMain.handle('plugin:disable', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    return await pluginManager.disable(id)
  })

  ipcMain.handle('plugin:reload', async (event, id: string) => {
    validateSender(event)
    assertString(id, 'id')
    await pluginManager.disable(id)
    await pluginManager.enable(id)
    return await pluginManager.getAllPlugins()
  })

  ipcMain.handle('plugin:set-config', async (event, pluginId: string, key: string, value: unknown) => {
    validateSender(event)
    return await pluginManager.setConfig(pluginId, key, value)
  })

  ipcMain.handle('plugin:set-auth-token', async (event, token: string) => {
    validateSender(event)
    pluginManager.setAuthToken(token)
  })

  ipcMain.handle('plugin:set-api-base-url', async (event, url: string) => {
    validateSender(event)
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('API base URL must use http: or https: protocol')
    }
    pluginManager.setApiBaseUrl(url)
  })

  ipcMain.handle('plugin:add-repo', async (event, url: string, label?: string) => {
    validateSender(event)
    assertString(url, 'url')
    return await pluginManager.addRepo(url, label)
  })

  ipcMain.handle('plugin:remove-repo', async (event, url: string) => {
    validateSender(event)
    assertString(url, 'url')
    return await pluginManager.removeRepo(url)
  })

  // ── Data calls ──
  ipcMain.handle('plugin:call-data', async (_event, pluginId: string, method: string, ...args: unknown[]) => {
    return await pluginManager.callPluginData(pluginId, method, ...args)
  })

  ipcMain.handle('plugin:test-instance', async (_event, url: string, apiKey: string) => {
    return await pluginManager.testInstance(url, apiKey)
  })

  ipcMain.handle('plugin:test-config', async (_event, pluginId: string, configDraft: Record<string, unknown>) => {
    return await pluginManager.testPluginConfig(pluginId, configDraft)
  })

  ipcMain.handle('plugin:emit-event', async (event, eventName: string, payload: unknown) => {
    validateSender(event)
    eventBus.emit(eventName as any, payload)
  })

  // ── Permission responses ──
  ipcMain.handle('plugin:respond-permission', async (_event, requestId: string, response: { granted: boolean; duration?: string }) => {
    if (!permissionManager) throw new Error('PermissionManager not available')
    permissionManager.respondToRequest(requestId, {
      granted: response.granted,
      duration: response.duration === 'always' ? 'always' : 'once',
    })
  })

  // ── API base URL ──
  ipcMain.handle('plugin:get-api-base-url', async () => {
    return pluginManager.getApiBaseUrl()
  })

  // ── OAuth window ──
  ipcMain.handle('plugin:open-oauth-window', async (event, url: string, redirectPattern: string) => {
    validateSender(event)
    assertString(url, 'url')
    assertString(redirectPattern, 'redirectPattern')

    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 800,
        height: 700,
        title: 'Sign In',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      let resolved = false

      const handleRedirect = (navUrl: string) => {
        if (resolved) return
        if (navUrl.includes(redirectPattern)) {
          try {
            const u = new URL(navUrl)
            const code = u.searchParams.get('authorizationCode') || u.searchParams.get('code')
            if (code) {
              // Code in URL — capture immediately
              resolved = true
              win.close()
              resolve({ success: true, code, redirectUrl: navUrl })
            }
            // No code yet — page will render JSON body, let did-navigate handle it
          } catch { /* parse error — let did-navigate try */ }
        }
      }

      win.webContents.on('will-redirect', (_event: any, navUrl: string) => handleRedirect(navUrl))
      win.webContents.on('will-navigate', (_event: any, navUrl: string) => handleRedirect(navUrl))

      win.webContents.on('did-finish-load', async () => {
        if (resolved) return
        const currentUrl = win.webContents.getURL()
        if (currentUrl.includes(redirectPattern)) {
          try {
            const content = await win.webContents.executeJavaScript('document.body.innerText')
            const data = JSON.parse(content)
            if (data.authorizationCode) {
              resolved = true
              win.close()
              resolve({ success: true, code: data.authorizationCode })
              return
            }
          } catch { /* page may not have JSON body yet */ }
        }
      })

      win.on('closed', () => {
        if (!resolved) {
          resolved = true
          resolve({ success: false, error: 'Login window closed' })
        }
      })

      win.loadURL(url)
    })
  })
}

// ── Orchestrator event forwarding ──

export function wireOrchestratorEvents(
  orchestrator: GameScanOrchestrator,
  mainWindow: BrowserWindow,
): void {
  orchestrator.on('game:matching:progress', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:progress', event);
    }
  });

  orchestrator.on('game:matching:complete', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:complete', event);
    }
  });
}
