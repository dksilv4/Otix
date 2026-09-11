// Shared plugin API surface for the renderer: IPC accessor, types, and
// presentational helpers (permission labels, icons, categories) used by the
// management page and the detail panel.

import { createServerPluginAPI } from '@/features/plugins/server-api'
import type { PluginInfo, PluginSettingsTab } from '@/features/plugins/types/plugins'
import {
  BookOpen, Clapperboard, Cloud, Download, Film, Folder, Gamepad2, Gauge, Heart,
  Image, Laptop, Library, Music, Package, Rocket, Search, Star, Swords, Tag, Tv, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Plugin API (preload surface) ─────────────────────────────────────────────

export interface PluginAPI {
  list(): Promise<PluginInfo[]>
  get(id: string): Promise<PluginInfo | null>
  uninstall(id: string): Promise<void>
  enable(id: string): Promise<void>
  /** Disables the plugin plus everything that depends on it; resolves with the full list of disabled ids. */
  disable(id: string): Promise<string[]>
  reload(id: string): Promise<PluginInfo[]>
  getConfig(pluginId: string): Promise<Record<string, unknown>>
  setConfig(pluginId: string, key: string, value: unknown): Promise<void>
  testInstance(url: string, apiKey: string): Promise<{ success: boolean; message: string }>
  testConfig(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; message: string }>
  getStatus(pluginId: string): Promise<Record<string, unknown>>
  discover(): Promise<void>
  getPluginTabs(): Promise<PluginSettingsTab[]>
  getSlotData?(location: string, context?: Record<string, unknown>): Promise<unknown>
  callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown>
}

export function getPluginAPI(): PluginAPI | null {
  const api = (window as any).desktopAPI?.plugin
  if (api) return api as PluginAPI
  // Browser / self-hosted server: plugins live on the server (backend
  // /api/v1/plugins/*), not behind an Electron preload.
  return createServerPluginAPI()
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

const PLUGIN_ICONS: Record<string, LucideIcon> = {
  // Common manifest icon keys
  film: Film,
  music: Music,
  gamepad: Gamepad2,
  code: Laptop,
  download: Download,
  tool: Wrench,
  book: BookOpen,
  tv: Tv,
  star: Star,
  heart: Heart,
  // Accurate per-plugin icons
  'gamepad-2': Gamepad2,
  rocket: Rocket,
  swords: Swords,
  folder: Folder,
  library: Library,
  'book-open': BookOpen,
  cloud: Cloud,
  image: Image,
  tag: Tag,
  search: Search,
  clapperboard: Clapperboard,
  gauge: Gauge,
  default: Package,
}

export function getPluginIcon(icon?: string): LucideIcon {
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

export function getPluginCategory(plugin: PluginInfo): string {
  const perms = plugin.manifest.permissions as readonly string[]

  // Services — the plugin integrates an external service
  const services = plugin.manifest.services
  if (services && services.length > 0) {
    const types = services.map((s) => (typeof s === 'string' ? s : s.type))
    if (types.includes('downloads-orchestrator')) return 'Pipelines'
    if (types.includes('arr') || types.includes('downloader')) return 'Services'
    if (types.includes('catalog-source')) return 'Providers'
  }

  // Scanner plugins — game library scanning (local FS scan or store/account scan)
  const scanSlots = plugin.manifest.slots
  const isScanner =
    perms.includes('worker:filesystem') ||
    !!scanSlots?.some((s) => s.location === 'library:scan' || s.location === 'matching:scan')
  if (isScanner) return 'Scanners'

  // Matching pipeline plugins — the offline game matching consumer
  if (scanSlots?.some((s) => s.location === 'matching:pipeline')) return 'Pipelines'

  return 'Utility'
}
