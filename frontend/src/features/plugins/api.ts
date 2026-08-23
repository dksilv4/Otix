// Shared plugin API surface for the renderer: IPC accessor, types, and
// presentational helpers (permission labels, icons, categories) used by the
// management page and the detail panel.

import type { PluginInfo, PluginSettingsTab } from '@/features/plugins/types/plugins'

// ── Plugin API (preload surface) ─────────────────────────────────────────────

export interface PluginAPI {
  list(): Promise<PluginInfo[]>
  get(id: string): Promise<PluginInfo | null>
  install(repoUrl: string, pluginPath?: string): Promise<PluginInfo>
  uninstall(id: string): Promise<void>
  update(id: string): Promise<PluginInfo>
  enable(id: string): Promise<void>
  disable(id: string): Promise<void>
  reload(id: string): Promise<PluginInfo[]>
  getConfig(pluginId: string): Promise<Record<string, unknown>>
  setConfig(pluginId: string, key: string, value: unknown): Promise<void>
  testInstance(url: string, apiKey: string): Promise<{ success: boolean; message: string }>
  testConfig(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; message: string }>
  getStatus(pluginId: string): Promise<Record<string, unknown>>
  discover(): Promise<void>
  fetchMarketplace(): Promise<{ success: boolean; plugins?: RegistryEntry[]; error?: string }>
  getRepos(): Promise<Array<{ url: string; label?: string; added_at: string }>>
  addRepo(url: string, label?: string): Promise<Array<{ url: string; label?: string; added_at: string }>>
  removeRepo(url: string): Promise<Array<{ url: string; label?: string; added_at: string }>>
  getPluginTabs(): Promise<PluginSettingsTab[]>
  getSlotData?(location: string): Promise<unknown>
  callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown>
}

export function getPluginAPI(): PluginAPI | null {
  const api = (window as any).desktopAPI?.plugin
  if (!api) return null
  return api as PluginAPI
}

// ── Registry / marketplace ───────────────────────────────────────────────────

export interface RegistryEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  repository: string
  path?: string
  icon?: string
  category?: string
  tags?: string[]
  min_app_version?: string
  permissions: string[]
  long_description?: string
  screenshots?: string[]
  downloads?: number
}

// ── Presentational helpers ───────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  'network:external': 'Network Access',
  'network:server': 'Local Server',
  'storage:local': 'Local Storage',
  'ui:settings': 'Settings Page',
  'ui:nav.item': 'Navigation Item',
  'ui:dashboard.widget': 'Dashboard Widget',
  'ui:list.actions': 'List Actions',
  'ui:media.actions': 'Media Actions',
  'notifications': 'Notifications',
  'worker:filesystem': 'File System Access',
  'ui:command': 'Commands',
  'api:proxy': 'API Proxy',
}

export function getPermissionLabel(perm: string): string {
  return PERMISSION_LABELS[perm] || perm
}

const PLUGIN_ICONS: Record<string, string> = {
  film: '\u{1F3AC}',
  music: '\u{1F3B5}',
  gamepad: '\u{1F3AE}',
  code: '\u{1F4BB}',
  download: '\u{1F4E5}',
  tool: '\u{1F527}',
  book: '\u{1F4DA}',
  tv: '\u{1F4FA}',
  star: '\u{2B50}',
  heart: '\u{2764}\u{FE0F}',
  default: '\u{1F4E6}',
}

export function getPluginIcon(icon?: string): string {
  return PLUGIN_ICONS[icon || ''] || PLUGIN_ICONS.default
}

const CATEGORY_STYLES: Record<string, { label: string; color: string; badge: string }> = {
  Scanners: { label: 'Scanners', color: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400' },
  Pipelines: { label: 'Pipelines', color: 'text-violet-400', badge: 'bg-violet-500/10 text-violet-400' },
  Providers: { label: 'Providers', color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400' },
  Services: { label: 'Services', color: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-400' },
  Utility: { label: 'Utility', color: 'text-white/40', badge: 'bg-white/5 text-white/40' },
}

export const CATEGORY_ORDER = ['Scanners', 'Pipelines', 'Providers', 'Services', 'Utility']

export function getCategoryStyle(category: string): { label: string; color: string; badge: string } {
  return CATEGORY_STYLES[category] || { label: category, color: 'text-white/40', badge: 'text-white/40 bg-white/5' }
}

export function getPluginCategory(plugin: PluginInfo | RegistryEntry): string {
  const name = plugin.name || ''
  const perms = 'permissions' in plugin ? plugin.permissions : plugin.manifest.permissions

  // Check manifest services (only available on PluginInfo)
  if ('manifest' in plugin && plugin.manifest.services && plugin.manifest.services.length > 0) {
    const types = plugin.manifest.services
    if (types.includes('downloads-orchestrator')) return 'Pipelines'
    if (types.includes('arr') || types.includes('downloader')) return 'Services'
  }

  // Scanner plugins — game library scanning
  if (perms.includes('worker:filesystem')) return 'Scanners'

  // Marketplace fallback — name heuristics when no manifest available
  if (name.includes('Pipeline') || name.includes('Download')) return 'Pipelines'
  if (name.includes('Searcher') || name.includes('Search')) return 'Providers'
  if (name.includes('Radarr') || name.includes('Sonarr') || name.includes('Lidarr') || name.includes('SABnzbd')) return 'Services'

  return 'Utility'
}
