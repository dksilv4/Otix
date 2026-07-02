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
    return await pluginManager.getAllPluginsWithStatuses()
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
  ipcMain.handle('plugin:get-slot-data', async (_event, location: string, context?: Record<string, unknown>) => {
    return await pluginManager.getSlotData(location, context)
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

  ipcMain.handle('plugin:enable', async (_event, id: string) => {
    assertString(id, 'id')
    return await pluginManager.enable(id)
  })

  ipcMain.handle('plugin:disable', async (_event, id: string) => {
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

  ipcMain.handle('plugin:set-config', async (_event, pluginId: string, key: string, value: unknown) => {
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

  // ── Free games ──
  ipcMain.handle('free-games:get-all', async () => {
    return await pluginManager.freeGames.getAll()
  })

  ipcMain.handle('free-games:refresh', async () => {
    return await pluginManager.freeGames.refresh()
  })

  // ── OAuth window ──
  ipcMain.handle('plugin:open-oauth-window', async (event, url: string, redirectPattern: string, options?: {
    tokenExtraction?: { type: 'url-param' | 'web-request' | 'local-storage'; key?: string }
  }) => {
    validateSender(event)
    assertString(url, 'url')
    assertString(redirectPattern, 'redirectPattern')

    return new Promise(async (resolve) => {
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
      const extraction = options?.tokenExtraction || { type: 'url-param' }

      // ── Diagnostics ──
      win.webContents.on('console-message', (_event: any, level: number, message: string) => {
        console.log(`[OAuth:${win.id}] [page] ${message}`)
      })
      win.webContents.on('did-fail-load', (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
        console.log(`[OAuth:${win.id}] FAILED to load: ${validatedURL} (${errorCode}: ${errorDescription})`)
      })
      win.webContents.on('page-title-updated', (_event: any, title: string) => {
        console.log(`[OAuth:${win.id}] Title: "${title}"`)
      })
      win.webContents.on('will-redirect', (_event: any, redirectUrl: string) => {
        console.log(`[OAuth:${win.id}] Redirect: ${redirectUrl.slice(0, 500)}`)
        // Capture ST (login ticket) from OAuth authorize redirects for token exchange
        if (!resolved && redirectUrl.includes('oauth.battle.net/authorize') && redirectUrl.includes('ST=')) {
          try {
            const stMatch = redirectUrl.match(/ST=([^&]+)/)
            if (stMatch) {
              const loginTicket = decodeURIComponent(stMatch[1])
              console.log(`[OAuth:${win.id}] Captured login ticket: ${loginTicket.slice(0, 60)}`)
              // Fire-and-forget token exchange — races with the OAuth authorize request
              const url = new URL('https://oauth.battle.net/token')
              const params = new URLSearchParams({
                grant_type: 'urn:blizzard:params:oauth:grant-type:implicit-exchange',
                login_ticket: loginTicket,
              })
              const req = (require('https') as typeof import('https')).request({
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Accept': 'application/json',
                },
              }, (res: any) => {
                let body = ''
                res.on('data', (chunk: string) => body += chunk)
                res.on('end', () => {
                  try {
                    const data = JSON.parse(body)
                    if (data.access_token) {
                      console.log(`[OAuth:${win.id}] Token exchange with login_ticket SUCCEEDED!`)
                      resolved = true
                      win.close()
                      resolve({ success: true, code: data.access_token, redirectUrl })
                    }
                  } catch {}
                })
              })
              req.on('error', () => {})
              req.write(params.toString())
              req.end()
            }
          } catch {}
        }
      })
      win.webContents.on('will-navigate', (_event: any, navUrl: string) => {
        if (navUrl.includes('battle.net/oauth/authorize') || navUrl.includes('oauth/')) {
          console.log(`[OAuth:${win.id}] OAuth navigate: ${navUrl.slice(0, 600)}`)
          // Also capture login ticket from client-side navigations
          if (!resolved && navUrl.includes('ST=')) {
            try {
              const stMatch = navUrl.match(/ST=([^&]+)/)
              if (stMatch) {
                const loginTicket = decodeURIComponent(stMatch[1])
                console.log(`[OAuth:${win.id}] Captured login ticket (navigate): ${loginTicket.slice(0, 60)}`)
                const params = new URLSearchParams({
                  grant_type: 'urn:blizzard:params:oauth:grant-type:implicit-exchange',
                  login_ticket: loginTicket,
                })
                const req = (require('https') as typeof import('https')).request({
                  hostname: 'oauth.battle.net',
                  path: '/token',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                }, (res: any) => {
                  let body = ''
                  res.on('data', (chunk: string) => body += chunk)
                  res.on('end', () => {
                    try { const data = JSON.parse(body); if (data.access_token) { resolved = true; win.close(); resolve({ success: true, code: data.access_token, redirectUrl: navUrl }) } } catch {}
                  })
                })
                req.on('error', () => {})
                req.write(params.toString())
                req.end()
              }
            } catch {}
          }
        }
      })

      // ── Strategy: intercept web request Authorization headers / token endpoint ──
      if (extraction.type === 'web-request') {
        console.log(`[OAuth:${win.id}] Using web-request strategy for ${url}`)
        // Setup CDP debugger asynchronously so it doesn't block loadURL.
        // Debugger needs a live renderer — attach after a short tick or after page starts loading.
        let debuggerAttached = false
        const setupCDP = async () => {
          try {
            await win.webContents.debugger.attach('1.3')
            await win.webContents.debugger.sendCommand('Network.enable')
            debuggerAttached = true
            console.log(`[OAuth:${win.id}] CDP debugger attached`)

            // Inject fetch/XHR interceptor that runs on EVERY document load (before page JS)
            // This captures ALL API response bodies and stores any Bearer token found
            try {
              await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
                source: `
                  (() => {
                    if (window.__otixTokenPatched) return;
                    window.__otixTokenPatched = true;
                    window.__otixToken = null;
                    // Patch fetch to intercept all JSON responses
                    const origFetch = window.fetch;
                    window.fetch = function() {
                      return origFetch.apply(this, arguments).then(function(resp) {
                        if (resp.ok && resp.headers && resp.headers.get('content-type')?.includes('application/json')) {
                          resp.clone().json().then(function(data) {
                            if (data && typeof data === 'object') {
                              const token = data.access_token || data.token || data.id_token;
                              if (token && typeof token === 'string' && token.length > 20) {
                                window.__otixToken = token;
                              }
                            }
                          }).catch(function(){});
                        }
                        return resp;
                      }).catch(function(err) { throw err; });
                    };
                    // Patch XMLHttpRequest to intercept JSON responses
                    const origOpen = XMLHttpRequest.prototype.open;
                    const origSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.open = function() {
                      this._otixUrl = arguments[1];
                      return origOpen.apply(this, arguments);
                    };
                    XMLHttpRequest.prototype.send = function() {
                      this.addEventListener('load', function() {
                        try {
                          const ct = this.getResponseHeader('content-type') || '';
                          if (ct.includes('application/json')) {
                            const data = JSON.parse(this.responseText);
                            if (data && typeof data === 'object') {
                              const token = data.access_token || data.token || data.id_token;
                              if (token && typeof token === 'string' && token.length > 20) {
                                window.__otixToken = token;
                              }
                            }
                          }
                        } catch(e) {}
                      });
                      return origSend.apply(this, arguments);
                    };
                  })();
                `,
              })
              console.log(`[OAuth:${win.id}] Fetch/XHR interceptor injected`)
            } catch (e: any) {
              console.log(`[OAuth:${win.id}] Fetch/XHR interceptor injection failed: ${e.message}`)
            }

            win.webContents.debugger.on('message', (_event: any, method: string, params: any) => {
              if (resolved) return

              // Log all API-like requests for debugging
              if (method === 'Network.requestWillBeSent' && params?.request?.url) {
                const url = params.request.url
                if (!url.match(/\.(js|css|png|jpg|svg|woff2?|ttf|ico|webp)/)) {
                  const authHeader = params.request.headers['Authorization'] || params.request.headers['authorization']
                  if (authHeader || url.includes('token') || url.includes('oauth') || url.includes('auth') || url.includes('login') || url.includes('api') || url.includes('profile') || url.includes('userinfo')) {
                    console.log(`[OAuth:${win.id}] [CDP] REQ: ${url.slice(0, 300)}${authHeader ? ' [AUTH]' : ''}`)
                  }
                }
              }
              if (method === 'Network.responseReceived' && params?.response?.url) {
                const url = params.response.url
                if (!url.match(/\.(js|css|png|jpg|svg|woff2?|ttf|ico|webp)/)) {
                  console.log(`[OAuth:${win.id}] [CDP] RES: ${url.slice(0, 300)} [${params.response.status}] ${params.response.mimeType}`)
                }
              }

              const resp = params?.response
              // Catch any JSON response that might contain an access token
              if (method === 'Network.responseReceived' && resp?.mimeType?.includes('json') && resp?.url && (resp.url.includes('token') || resp.url.includes('oauth') || resp.url.includes('auth') || resp.url.includes('/api/') || resp.url.includes('profile') || resp.url.includes('login') || resp.url.includes('userinfo'))) {
                win.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
                  .then((result: any) => {
                    try {
                      const data = JSON.parse(result.body)
                      if (data.access_token && data.token_type?.toLowerCase() === 'bearer') {
                        resolved = true
                        win.close()
                        resolve({ success: true, code: data.access_token, redirectUrl: resp.url })
                      }
                    } catch { /* not JSON or no access_token */ }
                  })
                  .catch(() => {})
              }

              // Also catch Authorization headers from outgoing API requests
              if (method === 'Network.requestWillBeSent' && params?.request?.headers) {
                const auth = params.request.headers['Authorization'] || params.request.headers['authorization']
                if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
                  const token = auth.slice(7)
                  if (token && token.length > 20) {
                    resolved = true
                    win.close()
                    resolve({ success: true, code: token, redirectUrl: params.request.url })
                  }
                }
              }
            })
          } catch (e: any) {
            console.log(`[OAuth:${win.id}] CDP setup failed: ${e.message}`)
          }
        }
        // Register webRequest fallback synchronously (before loadURL), so it's always active
        const fallbackUrl = extraction.key || '*.battle.net'
        const fallbackFilter = { urls: [`*://${fallbackUrl}/*`] }
        win.webContents.session.webRequest.onBeforeSendHeaders(fallbackFilter, (details, callback) => {
          if (resolved) { callback({ requestHeaders: details.requestHeaders }); return }
          if (details.url.includes('.js') || details.url.includes('.css') || details.url.includes('.png') || details.url.includes('.svg') || details.url.includes('.woff')) {
            callback({ requestHeaders: details.requestHeaders })
            return
          }
          const auth = details.requestHeaders['Authorization']
          if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
            const token = auth.slice(7)
            if (token && token.length > 20) {
              resolved = true
              win.close()
              resolve({ success: true, code: token, redirectUrl: details.url })
              callback({ requestHeaders: details.requestHeaders })
              return
            }
          }
          callback({ requestHeaders: details.requestHeaders })
        })
        // Kick off CDP setup without awaiting — page load is not blocked
        setupCDP()
      }

      // ── Strategy: url-param (default, for Epic-style redirects) ──
      if (extraction.type === 'url-param') {
        const handleRedirect = (navUrl: string) => {
          if (resolved) return
          if (navUrl.includes(redirectPattern)) {
            try {
              const u = new URL(navUrl)
              const code = u.searchParams.get('authorizationCode') || u.searchParams.get('code')
              if (code) {
                resolved = true
                win.close()
                resolve({ success: true, code, redirectUrl: navUrl })
              }
            } catch { /* parse error — let other strategies try */ }
          }
        }

        win.webContents.on('will-redirect', (_event: any, navUrl: string) => handleRedirect(navUrl))
        win.webContents.on('will-navigate', (_event: any, navUrl: string) => handleRedirect(navUrl))
      }

      // ── Strategy: localStorage extraction ──
      win.webContents.on('did-finish-load', async () => {
        const currentUrl = win.webContents.getURL()
        console.log(`[OAuth:${win.id}] did-finish-load: ${currentUrl}`)
        if (resolved) return

        // localStorage extraction for Battle.net-style logins
        if (extraction.type === 'local-storage') {
          if (currentUrl.includes(redirectPattern)) {
            const keys = extraction.key ? [extraction.key] : ['access_token', 'cached::access_token', 'cached.access_token', 'auth_token']
            for (const k of keys) {
              try {
                const val = await win.webContents.executeJavaScript(
                  `(() => { try { return localStorage.getItem(${JSON.stringify(k)}) } catch { return null } })()`
                )
                if (val) {
                  resolved = true
                  win.close()
                  resolve({ success: true, code: val })
                  return
                }
              } catch { /* key not accessible */ }
            }
          }
        }

        // For web-request type: delayed JS extraction (gives SPA time to initialize)
        if (extraction.type === 'web-request' && currentUrl.includes(redirectPattern)) {
          // Check for the patched fetch token first
          win.webContents.debugger.sendCommand('Runtime.evaluate', {
            expression: 'window.__otixToken',
            returnByValue: true,
          }).then((result: any) => {
            if (!resolved && result?.result?.value) {
              const t = result.result.value
              console.log(`[OAuth:${win.id}] Found token via fetch interceptor`)
              resolved = true
              win.close()
              resolve({ success: true, code: t })
            }
          }).catch(() => {})
          // Also check after a longer delay for token exchange
          setTimeout(async () => {
            if (resolved) return
            // Check fetch interceptor one more time
            try {
              const t = await win.webContents.debugger.sendCommand('Runtime.evaluate', {
                expression: 'window.__otixToken',
                returnByValue: true,
              })
              if (t?.result?.value) {
                console.log(`[OAuth:${win.id}] Found token via fetch interceptor (delayed)`)
                resolved = true
                win.close()
                resolve({ success: true, code: t.result.value })
                return
              }
            } catch {}
            // Strategy 1: Extract session cookies for plugin-side auth (Battle.net-style)
            // Only try on post-login pages — skip /login since login.key is set as a
            // tracking cookie on the login page itself, before the user has signed in.
            if (!currentUrl.includes('/login') && !currentUrl.includes('/signin')) {
              try {
                const cookies = await win.webContents.session.cookies.get({ url: 'https://account.battle.net' })
                const loginKey = cookies.find(c =>
                  c.name === 'BA-tassadar-login.key' || c.name === 'login.key'
                )
                if (loginKey) {
                  console.log(`[OAuth:${win.id}] Found session cookie: ${loginKey.name} on ${currentUrl}`)
                  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
                  resolved = true
                  win.close()
                  resolve({ success: true, code: JSON.stringify({ type: 'cookies', data: cookieStr }), redirectUrl: currentUrl })
                  return
                }
              } catch (e: any) {
                console.log(`[OAuth:${win.id}] Cookie extraction error: ${e.message}`)
              }
            }
            // Strategy 2: Execute JS to extract token from various storage locations
            try {
              const token = await win.webContents.executeJavaScript(`(async () => {
                const checks = [];
                // localStorage
                for (const k of ['access_token','cached::access_token','cached.access_token','bnet_access_token','auth_token','token','bearer_token','id_token','session_token']) {
                  try { const v = localStorage.getItem(k); if (v && v.length > 20) return v; } catch {}
                }
                // sessionStorage
                for (const k of ['access_token','cached::access_token','bnet_access_token','auth_token','token']) {
                  try { const v = sessionStorage.getItem(k); if (v && v.length > 20) return v; } catch {}
                }
                // window.__INITIAL_STATE__
                try {
                  if (window.__INITIAL_STATE__) {
                    const s = window.__INITIAL_STATE__;
                    const json = JSON.stringify(s);
                    const m = json.match(/"access_token"\s*:\s*"([^"]{20,})"/);
                    if (m) return m[1];
                    if (s.accessToken) return s.accessToken;
                    if (s.access_token) return s.access_token;
                    if (s.user?.accessToken) return s.user.accessToken;
                    if (s.session?.access_token) return s.session.access_token;
                  }
                } catch {}
                // Try React devtools internals (window.__REACT_DEVTOOLS_GLOBAL_HOOK__)
                try {
                  const root = document.getElementById('root');
                  if (root && root._reactRootContainer) {
                    const state = root._reactRootContainer._internalRoot?.current;
                    if (state) {
                      const json = JSON.stringify(state);
                      const m = json.match(/"access_token"\s*:\s*"([^"]{20,})"/);
                      if (m) return m[1];
                    }
                  }
                } catch {}
                // Try making authenticated fetch to profile API
                try {
                  const r = await fetch('https://profile-api.battle.net/userinfo', { credentials: 'include' });
                  if (r.ok) {
                    const data = await r.json();
                    if (data.access_token) return data.access_token;
                    if (data.token) return data.token;
                  }
                } catch {}
                return null;
              })()`)
              if (token) {
                console.log(`[OAuth:${win.id}] Token extracted via JS execution`)
                resolved = true
                win.close()
                resolve({ success: true, code: token })
              }
            } catch (e: any) {
              console.log(`[OAuth:${win.id}] JS extraction failed: ${e.message}`)
            }
            // Strategy 3: If page is on overview, try navigating to a profile API url directly in a separate context
            if (!resolved && currentUrl.includes('overview')) {
              try {
                const fetchResult = await win.webContents.executeJavaScript(`(async () => {
                  try {
                    const r = await fetch('https://profile-api.battle.net/userinfo', { credentials: 'include' });
                    if (r.ok) {
                      const d = await r.json();
                      if (d.access_token) return d.access_token;
                      if (d.id_token) return d.id_token;
                      return JSON.stringify(d);
                    }
                    return 'status:' + r.status;
                  } catch(e) { return 'error:' + e.message; }
                })()`)
                console.log(`[OAuth:${win.id}] Profile API fetch result: ${String(fetchResult).slice(0, 200)}`)
              } catch (e: any) {
                console.log(`[OAuth:${win.id}] Profile API fetch failed: ${e.message}`)
              }
            }
          }, 5000)
        }

        // Fallback: try JSON body with authorizationCode (for Epic-style)
        if (extraction.type === 'url-param' && currentUrl.includes(redirectPattern)) {
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

      // Listen for post-login navigation (login page → overview)
      const tryCookieExtraction = () => {
        const navUrl = win.webContents.getURL()
        if (resolved || !navUrl.includes('account.battle.net')) return
        if (navUrl.includes('/login') || navUrl.includes('/signin')) return
        console.log(`[OAuth:${win.id}] Post-login navigation: ${navUrl}`)
        setTimeout(async () => {
          if (resolved) return
          try {
            const cookies = await win.webContents.session.cookies.get({ url: 'https://account.battle.net' })
            const loginKey = cookies.find(c =>
              c.name === 'BA-tassadar-login.key' || c.name === 'login.key'
            )
            if (loginKey) {
              console.log(`[OAuth:${win.id}] Session cookie after navigation: ${loginKey.name}`)
              const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
              resolved = true
              win.close()
              resolve({ success: true, code: JSON.stringify({ type: 'cookies', data: cookieStr }), redirectUrl: navUrl })
            }
          } catch {}
        }, 2000)
      }
      win.webContents.on('did-navigate', tryCookieExtraction)
      win.webContents.on('did-navigate-in-page', tryCookieExtraction)

      // Timeout: 5 minutes max
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          win.close()
          resolve({ success: false, error: 'Login timed out' })
        }
      }, 300000)

      win.on('closed', () => {
        clearTimeout(timeout)
        try { win.webContents.debugger.detach() } catch {}
        if (!resolved) {
          resolved = true
          resolve({ success: false, error: 'Login window closed' })
        }
      })

      console.log(`[OAuth:${win.id}] Loading URL: ${url}`)
      win.loadURL(url).catch((err: Error) => {
        console.log(`[OAuth:${win.id}] loadURL failed: ${err.message}`)
      })
    })
  })
}

// ── Orchestrator event forwarding ──

export function wireOrchestratorEvents(
  orchestrator: GameScanOrchestrator,
  mainWindow: BrowserWindow,
): void {
  orchestrator.on('match:progress', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:progress', event);
    }
  });

  orchestrator.on('scan:complete', (event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:complete', event);
    }
  });

  orchestrator.on('scan:cancelled', (_event: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:matching:cancelled');
    }
  });
}
