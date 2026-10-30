// HTTP-backed PluginAPI for the browser / self-hosted server.
//
// The desktop renders plugin management over Electron IPC (window.desktopAPI);
// on the server the same surface lives behind /api/v1/plugins/*. This adapter
// implements the shared PluginAPI contract against those endpoints so the
// management page + generic data-method dispatch work from any browser without
// the Electron preload.
//
// Plugin config/payloads are arbitrary JSON with plugin-authored keys, so this
// uses its own axios instance — the shared apiClient snake_cases outgoing keys
// and camel_cases responses, which would corrupt keys the plugin defined.

import axios from 'axios'
import { isDesktop } from '@/lib/desktop'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import type { PluginAPI } from '@/features/plugins/api'
import type { PluginInfo, PluginManifest, PluginSettingsTab, PluginStatus } from '@/features/plugins/types/plugins'

const BASE_URL = isDesktop()
  ? import.meta.env.VITE_API_BASE_URL || (import.meta.env?.VITE_LOCAL_BACKEND === 'true' ? 'http://127.0.0.1:8000/api/v1' : 'https://otix.app/api/v1')
  : import.meta.env.VITE_API_BASE_URL || '/api/v1'

const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Backend registry-row shape (snake_case; no case conversion on this path) ─

export interface ServerPluginRow {
  id: string
  version: string
  description: string
  author: string
  repository: string
  icon?: string
  stage?: string
  system?: boolean
  enabled: boolean
  error?: string
  permissions_declared?: string[]
  permissions_granted?: string[]
  config?: Record<string, unknown>
  instances?: unknown[]
  manifest: Record<string, unknown> & PluginManifest
  updated_at: string
}

export function toStatus(row: { enabled: boolean; error?: string }): PluginStatus {
  if (row.error) return 'error'
  return row.enabled ? 'enabled' : 'disabled'
}

export function mapServerPlugin(row: ServerPluginRow): PluginInfo {
  const manifest = row.manifest || {}
  return {
    id: row.id,
    name: (manifest.name as string) || row.id,
    version: row.version,
    description: row.description,
    author: row.author,
    repository: row.repository,
    status: toStatus(row),
    error: row.error || undefined,
    manifest: manifest as PluginManifest,
    installedAt: row.updated_at,
  }
}

// ── Data-method dispatch: backend plugins take one payload arg ───────────────

export function packPayload(args: unknown[]): unknown {
  if (args.length === 0) return null
  if (args.length === 1) return args[0]
  return args
}

async function callMethod(pluginId: string, method: string, payload: unknown) {
  const { data } = await http.post(`/plugins/${encodeURIComponent(pluginId)}/call`, {
    method,
    payload,
  })
  if (data?.ok === false) {
    throw new Error(data.error || `plugin call '${method}' failed`)
  }
  return data?.result
}

class ServerPluginAPI implements PluginAPI {
  async list(): Promise<PluginInfo[]> {
    const { data } = await http.get('/plugins/')
    return (data?.plugins ?? []).map(mapServerPlugin)
  }

  async get(id: string): Promise<PluginInfo | null> {
    const { data } = await http.get(`/plugins/${encodeURIComponent(id)}`)
    return data ? mapServerPlugin(data) : null
  }

  async uninstall(id: string): Promise<void> {
    await http.delete(`/plugins/${encodeURIComponent(id)}`)
  }

  async enable(id: string): Promise<void> {
    await http.post(`/plugins/${encodeURIComponent(id)}/enable`)
  }

  async disable(id: string): Promise<string[]> {
    const { data } = await http.post(`/plugins/${encodeURIComponent(id)}/disable`)
    const plugin = data?.plugin as ServerPluginRow | undefined
    return plugin ? [plugin.id] : []
  }

  async reload(id: string): Promise<PluginInfo[]> {
    await http.post(`/plugins/${encodeURIComponent(id)}/reload`)
    return this.list()
  }

  async getConfig(pluginId: string): Promise<Record<string, unknown>> {
    const { data } = await http.get(`/plugins/${encodeURIComponent(pluginId)}/config`)
    return data?.config ?? {}
  }

  async setConfig(pluginId: string, key: string, value: unknown): Promise<void> {
    const current = await this.getConfig(pluginId)
    await http.put(`/plugins/${encodeURIComponent(pluginId)}/config`, {
      config: { ...current, [key]: value },
    })
  }

  // Server plugins have no generic connection probe yet; surface a clear no-op
  // so the shared UI's Test button degrades instead of crashing. Args are dropped
  // (the interface allows fewer params) to keep lint happy.
  async testInstance(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Server plugins do not support connection tests.' }
  }

  async testConfig(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Server plugins do not support connection tests.' }
  }

  async getStatus(pluginId: string): Promise<Record<string, unknown>> {
    const { data } = await http.get(`/plugins/${encodeURIComponent(pluginId)}`)
    const row = data as ServerPluginRow | undefined
    if (!row) return {}
    const status: Record<string, unknown> = { status: toStatus(row) }
    if (row.error) status.error = row.error
    return status
  }

  async discover(): Promise<void> {
    await http.post('/plugins/')
  }

  async getPluginTabs(): Promise<PluginSettingsTab[]> {
    const plugins = await this.list()
    const tabs: PluginSettingsTab[] = []
    for (const plugin of plugins) {
      const declared = plugin.manifest.settings?.tabs ?? []
      for (const tab of declared) {
        tabs.push({ ...tab, pluginId: plugin.id })
      }
    }
    return tabs
  }

  async getSlotData(): Promise<unknown> {
    return undefined
  }

  async callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown> {
    return callMethod(pluginId, method, packPayload(args))
  }
}

let cached: ServerPluginAPI | null = null

/** Browser transport: the /api/v1/plugins endpoints. Desktop keeps Electron IPC. */
export function createServerPluginAPI(): ServerPluginAPI {
  if (!cached) cached = new ServerPluginAPI()
  return cached
}

// ── Gateway access token ──────────────────────────────────────────────────────

export interface IssuedPluginToken {
  name: string
  /** Plaintext secret — only ever returned by the mint response. */
  token: string
}

/** Mint (or replace) the whole-scope token for a plugin. Rotating retires the
 * plugin's previous active token server-side; the plaintext comes back once.
 * Tokens follow the plugin's enabled state, so this is the rotate/reveal path
 * rather than an explicit grant. */
export async function issuePluginToken(pluginId: string): Promise<IssuedPluginToken> {
  const { data } = await http.post(`/plugins/${encodeURIComponent(pluginId)}/access-token`)
  return data
}
