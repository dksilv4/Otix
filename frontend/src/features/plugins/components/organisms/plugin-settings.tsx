import { useState, useEffect, useCallback } from 'react'
import {
  Search, Loader2, Puzzle, ExternalLink, CheckCircle2, XCircle,
  AlertCircle, Download, RefreshCw, Settings, X, Store, ChevronDown,
  ShieldCheck, Database, ArrowUpCircle, ArrowRight, ChevronRight,
} from 'lucide-react'
import { useModal, SlidePanel } from '@/lib/modals'
import { PluginConfigPanel } from './plugin-config-panel'
import type { PluginInfo } from '@/features/plugins/types/plugins'
import { cn } from '@/lib/utils'
import { openExternal } from '@/lib/utils/open-external'
import { DkSwitch } from '@/old-features/ui/atoms/switch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistryEntry {
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
  getPluginTabs(): Promise<Array<{ pluginId: string; label: string; path: string }>>
  getSlotData?(location: string): Promise<unknown>
  callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function getPermissionLabel(perm: string): string {
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

const CATEGORY_STYLES: Record<string, { label: string; color: string; badge: string }> = {
  Scanners: { label: 'Scanners', color: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400' },
  Pipelines: { label: 'Pipelines', color: 'text-violet-400', badge: 'bg-violet-500/10 text-violet-400' },
  Providers: { label: 'Providers', color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400' },
  Services: { label: 'Services', color: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-400' },
  Utility: { label: 'Utility', color: 'text-white/40', badge: 'bg-white/5 text-white/40' },
}

const CATEGORY_ORDER = ['Scanners', 'Pipelines', 'Providers', 'Services', 'Utility']

function getPluginCategory(plugin: PluginInfo | RegistryEntry): string {
  const name = plugin.name || ''
  const perms = 'permissions' in plugin ? plugin.permissions : plugin.manifest.permissions

  // Check manifest services (only available on PluginInfo)
  if ('manifest' in plugin && plugin.manifest.services && plugin.manifest.services.length > 0) {
    const types = plugin.manifest.services.map((s) => s)
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

// ── Plugin API accessor ────────────────────────────────────────────────────────

export function getPluginAPI(): PluginAPI | null {
  const api = (window as any).desktopAPI?.plugin
  if (!api) return null
  return api as PluginAPI
}

// ── Topology Graph ─────────────────────────────────────────────────────────────

const NODE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f97316', // orange
  '#ec4899', // pink
]

function hashColor(id: string): string {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return NODE_COLORS[hash % NODE_COLORS.length]
}

interface GraphEdge {
  source: string
  target: string
  type: 'depends_on' | 'service' | 'same_author'
}

interface GraphNode {
  id: string
  name: string
  status: PluginInfo['status']
  color: string
}

function buildPluginGraph(enabled: PluginInfo[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = enabled.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    color: p.status === 'error' ? '#ef4444' : hashColor(p.id),
  }))

  const edges: GraphEdge[] = []
  const nodeIds = new Set(nodes.map((n) => n.id))

  // depends_on edges
  for (const plugin of enabled) {
    for (const dep of plugin.manifest.depends_on || []) {
      if (nodeIds.has(dep)) {
        edges.push({ source: plugin.id, target: dep, type: 'depends_on' })
      }
    }
  }

  // Service provider/consumer edges
  const providerServices = new Map<string, string[]>()
  for (const plugin of enabled) {
    for (const s of plugin.manifest.services || []) {
      const type = s
      if (!providerServices.has(type)) providerServices.set(type, [])
      providerServices.get(type)!.push(plugin.id)
    }
  }

  // Same-author edges
  const byAuthor = new Map<string, string[]>()
  for (const plugin of enabled) {
    const author = plugin.author.toLowerCase()
    if (!byAuthor.has(author)) byAuthor.set(author, [])
    byAuthor.get(author)!.push(plugin.id)
  }
  for (const [, ids] of byAuthor) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          edges.push({ source: ids[i], target: ids[j], type: 'same_author' })
        }
      }
    }
  }

  return { nodes, edges }
}

function PluginTopologyGraph({ enabledPlugins }: { enabledPlugins: PluginInfo[] }) {
  const graph = buildPluginGraph(enabledPlugins)
  const nodeCount = graph.nodes.length

  // Center + dimensions
  const cx = 130
  const cy = 90

  // Calculate positions: nodes on an ellipse around the center hub
  const radiusX = Math.min(75, 30 + nodeCount * 12)
  const radiusY = Math.min(55, 25 + nodeCount * 8)

  const positions = graph.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / graph.nodes.length - Math.PI / 2
    return {
      ...node,
      px: cx + radiusX * Math.cos(angle) - 18,
      py: cy + radiusY * Math.sin(angle) - 18,
    }
  })

  const posMap = new Map(positions.map((n) => [n.id, n]))

  // Edges between real plugins (not to hub)
  const pluginEdges = graph.edges.map((edge) => {
    const s = posMap.get(edge.source)
    const t = posMap.get(edge.target)
    if (!s || !t) return null
    return { x1: s.px + 18, y1: s.py + 18, x2: t.px + 18, y2: t.py + 18, ...edge }
  }).filter(Boolean) as (GraphEdge & { x1: number; y1: number; x2: number; y2: number })[]

  const maxNodes = 7
  const visiblePositions = positions.slice(0, maxNodes)

  const fallback = (
    <div className="relative w-[260px] h-[180px]">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 180">
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={[30, 236, 24, 242, 54, 218][i]}
            y2={[26, 24, 106, 100, 168, 162][i]}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-13 h-13 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 z-10 ring-[3px] ring-white/[0.04]">
        <Puzzle className="w-6 h-6 text-white" />
      </div>
      {[
        { x: 12, y: 8, c: '#95BF47' },
        { x: 218, y: 6, c: '#FF7A59' },
        { x: 6, y: 88, c: '#E37400' },
        { x: 224, y: 82, c: '#21759B' },
        { x: 36, y: 156, c: '#635BFF' },
        { x: 200, y: 150, c: '#4078c0' },
      ].map((n, i) => (
        <div key={i} className="absolute w-[36px] h-[36px] rounded-lg bg-white/90 shadow-sm flex items-center justify-center" style={{ left: n.x, top: n.y }}>
          <span className="text-[9px] font-bold text-gray-800">{['Sh', 'Hu', 'An', 'WP', 'St', 'Gi'][i]}</span>
        </div>
      ))}
    </div>
  )

  if (visiblePositions.length === 0) return fallback

  const edgeColor = 'rgba(255,255,255,0.1)'
  const strongEdgeColor = 'rgba(99,102,241,0.3)'

  return (
    <div className="relative">
      {/* Connection count label */}
      <div className="absolute -top-2 right-0 text-[10px] text-white/30 font-medium bg-white/[0.03] rounded-full px-2 py-0.5">
        {nodeCount} connected
      </div>

      <div className="relative w-[260px] h-[180px]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 180">
          {/* Hub-to-node lines */}
          {visiblePositions.map((n) => (
            <line
              key={`hub-${n.id}`}
              x1={cx} y1={cy}
              x2={n.px + 18} y2={n.py + 18}
              stroke={edgeColor}
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          ))}
          {/* Inter-plugin edges */}
          {pluginEdges.map((e, i) => {
            const stroke = e.type === 'same_author' ? edgeColor : strongEdgeColor
            const dash = e.type === 'same_author' ? '3 3' : undefined
            return (
              <line
                key={`edge-${i}`}
                x1={e.x1} y1={e.y1}
                x2={e.x2} y2={e.y2}
                stroke={stroke}
                strokeWidth={e.type === 'same_author' ? 1 : 1.5}
                strokeDasharray={dash}
              />
            )
          })}
        </svg>

        {/* Center hub */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-13 h-13 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 z-10 ring-[3px] ring-white/[0.04]">
          <Puzzle className="w-6 h-6 text-white" />
        </div>

        {/* Plugin nodes */}
        {visiblePositions.map((n) => (
          <div key={n.id} className="group absolute" style={{ left: n.px, top: n.py }}>
            <div
              className="w-[36px] h-[36px] rounded-lg shadow-sm flex items-center justify-center transition-transform hover:scale-110 cursor-default"
              style={{ backgroundColor: n.status === 'error' ? 'rgba(239,68,68,0.2)' : `${n.color}18`, border: `1.5px solid ${n.color}44` }}
            >
              <span className="text-[10px] font-bold" style={{ color: n.color }}>
                {n.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-lg bg-gray-900 border border-white/[0.06] text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
              {n.name}
            </div>
          </div>
        ))}

        {/* Connection legend */}
        {pluginEdges.length > 0 && (
          <div className="absolute bottom-0 left-0 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0 border-t border-dashed border-white/20" />
              <span className="text-[9px] text-white/25">same author</span>
            </div>
            {pluginEdges.some((e) => e.type !== 'same_author') && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0 border-t border-white/30" />
                <span className="text-[9px] text-white/25">depends</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hero Banner ────────────────────────────────────────────────────────────────

function HeroBanner({ plugins, onBrowseAll }: { plugins: PluginInfo[]; onBrowseAll: () => void }) {
  const enabledPlugins = plugins.filter((p) => p.status === 'enabled')

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent border border-white/[0.06]">
      <div className="flex items-center gap-10 px-8 py-10">
        {/* Left content */}
        <div className="flex-1 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Puzzle className="h-3 w-3" />
            {enabledPlugins.length > 0
              ? `${enabledPlugins.length} connected`
              : 'Plugin Ecosystem'}
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight tracking-tight">
            {enabledPlugins.length > 0
              ? 'Your connected ecosystem'
              : 'Powerful connections for better results'}
          </h1>
          <p className="mt-3 text-base text-white/50 leading-relaxed max-w-lg">
            {enabledPlugins.length > 0
              ? `You have ${enabledPlugins.length} plugin${enabledPlugins.length === 1 ? '' : 's'} active. Browse more to extend Otix with community-built plugins.`
              : 'Connect your favorite services and extend Otix with community-built plugins. Automate workflows, sync your library, and unlock new capabilities.'}
          </p>
          <button
            onClick={onBrowseAll}
            className="mt-6 inline-flex items-center gap-2 h-11 rounded-full bg-primary text-primary-foreground px-7 text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
          >
            Browse all plugins
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Right — Topology graph */}
        <div className="hidden lg:block shrink-0">
          <PluginTopologyGraph enabledPlugins={enabledPlugins} />
        </div>
      </div>
    </div>
  )
}

// ── Connected Card ─────────────────────────────────────────────────────────────

function ConnectedCard({
  plugin,
  hasUpdate,
  updateVersion,
  onManage,
  onToggle,
  toggling,
  updating,
  onUpdate,
}: {
  plugin: PluginInfo
  hasUpdate?: boolean
  updateVersion?: string
  onManage: () => void
  onToggle: () => void
  toggling: boolean
  updating?: boolean
  onUpdate?: () => void
}) {
  const pluginIcon = PLUGIN_ICONS[plugin.manifest.icon || ''] || PLUGIN_ICONS.default
  const isError = plugin.status === 'error'
  const isConnected = plugin.status === 'enabled'
  const statusBadge = isError
    ? { label: 'Error', className: 'text-red-400 bg-red-500/10' }
    : isConnected
      ? { label: 'Connected', className: 'text-green-400 bg-green-500/10' }
      : { label: 'Disabled', className: 'text-white/40 bg-white/5' }

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all shadow-sm flex flex-col',
        isError
          ? 'border-red-500/20 bg-red-500/[0.02]'
          : 'border-white/[0.06] bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.04]',
      )}
    >
      <div className="flex-1">
        {/* Header: logo + name + status badge */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg',
            isError ? 'bg-red-500/10' : 'bg-primary/10',
          )}
        >
          {pluginIcon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white truncate">{plugin.name}</h3>
            <span className="inline-flex items-center text-[10px] font-semibold text-amber-400 bg-amber-500/15 rounded px-1.5 py-0.5 shrink-0 leading-none">Beta</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0',
                statusBadge.className,
              )}
            >
              {isConnected && <CheckCircle2 className="h-3 w-3" />}
              {isError && <XCircle className="h-3 w-3" />}
              {statusBadge.label}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-1">{plugin.author} &middot; v{plugin.version}</p>
        </div>
      </div>

      {/* Description */}
      {plugin.description && (
        <p className="mt-3 text-sm text-white/50 leading-relaxed line-clamp-2">
          {plugin.description}
        </p>
      )}

      </div>{/* end content wrapper */}
      {/* Action footer */}
      <div className="mt-auto pt-3 border-t border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasUpdate && onUpdate && updateVersion && (
            <button
              type="button"
              onClick={onUpdate}
              disabled={updating}
              className="inline-flex items-center gap-1 h-7 rounded-lg px-2.5 text-[11px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {updating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-3 w-3" />
              )}
              Update v{updateVersion}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onManage}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              isError
                ? 'text-red-400/70 hover:text-red-400'
                : 'text-primary/70 hover:text-primary',
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            Manage
          </button>
          {!isError && (
            <DkSwitch
              checked={isConnected}
              onCheckedChange={onToggle}
              disabled={toggling}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Popular Card (marketplace browse) ──────────────────────────────────────────

function PopularCard({
  entry,
  isInstalled,
  installedVersion,
  onConnect,
  onConfigure,
  connecting,
  onClick,
}: {
  entry: RegistryEntry
  isInstalled: boolean
  installedVersion?: string
  onConnect: () => void
  onConfigure: () => void
  connecting: boolean
  onClick: () => void
}) {
  const icon = PLUGIN_ICONS[entry.icon || ''] || PLUGIN_ICONS.default
  const category = entry.category || getPluginCategory(entry)
  const needsUpdate = isInstalled && installedVersion && entry.version !== installedVersion

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all shadow-sm hover:border-white/10 hover:bg-white/[0.04] cursor-pointer group flex flex-col"
    >
      <div className="flex-1">
        {/* Header: logo + name + meta */}
        <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white truncate">{entry.name}</h3>
            <span className="inline-flex items-center text-[10px] font-semibold text-amber-400 bg-amber-500/15 rounded px-1.5 py-0.5 shrink-0 leading-none">Beta</span>
          </div>
          <p className="text-xs text-white/40 mt-0.5">{entry.author} &middot; v{entry.version}</p>
        </div>
        {isInstalled && !needsUpdate && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-500/10 rounded-full px-2 py-0.5 shrink-0">
            <CheckCircle2 className="h-3 w-3" /> Installed
          </span>
        )}
        {needsUpdate && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5 shrink-0">
            <ArrowUpCircle className="h-3 w-3" /> v{entry.version}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="mt-3 text-sm text-white/50 leading-relaxed line-clamp-2">
        {entry.description}
      </p>

      {/* Tags */}
      <div className="flex items-center gap-2 mt-3">
        <span className={cn('text-[11px] rounded-md px-2 py-0.5 font-medium', CATEGORY_STYLES[category]?.badge || 'text-white/40 bg-white/5')}>
          {CATEGORY_STYLES[category]?.label || category}
        </span>
        <span className="text-[11px] text-white/30">{entry.permissions.length} permissions</span>
      </div>

      </div>{/* end content wrapper */}
      {/* Footer: Connect button */}
      <div className="mt-auto pt-3 border-t border-white/[0.04]">
        {needsUpdate ? (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect() }}
            disabled={connecting}
            className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-4 text-xs font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Update
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); isInstalled ? onConfigure?.() : onConnect() }}
            disabled={connecting}
            className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-4 text-xs font-medium border border-white/20 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isInstalled ? (
              <Settings className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isInstalled ? 'Configure' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Marketplace Detail Panel ───────────────────────────────────────────────────

function MarketplaceDetailPanel({
  entry,
  isInstalled,
  installedVersion,
  installing,
  updating,
  onInstall,
  onUpdate,
  onClose,
  isExiting,
}: {
  entry: RegistryEntry
  isInstalled: boolean
  installedVersion?: string
  installing: boolean
  updating: boolean
  onInstall: () => void
  onUpdate?: () => void
  onClose: () => void
  isExiting?: boolean
}) {
  const icon = PLUGIN_ICONS[entry.icon || ''] || PLUGIN_ICONS.default

  return (
    <SlidePanel onClose={onClose} isExiting={isExiting}>
      {/* Header */}
      <div className="flex items-start gap-4 px-6 pt-6 pb-4">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl text-2xl shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{entry.name}</h2>
            <span className="inline-flex items-center text-[11px] font-semibold text-amber-400 bg-amber-500/15 rounded px-1.5 py-0.5 shrink-0 leading-none">Beta</span>
          </div>
          <p className="text-sm text-white/50">{entry.author} &middot; v{entry.version}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <p className="text-sm text-white/70 leading-relaxed">{entry.long_description || entry.description}</p>

        {/* Meta */}
        {(entry.category || (entry.tags && entry.tags.length > 0)) && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
            {entry.category && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30 w-20 shrink-0">Category</span>
                <span className="text-xs text-white/60 bg-white/5 rounded-lg px-2.5 py-1 capitalize">{entry.category}</span>
              </div>
            )}
            {entry.tags && entry.tags.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-white/30 w-20 shrink-0 mt-0.5">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="text-xs text-white/50 bg-white/5 rounded-md px-2 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Repository */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 flex items-center justify-between">
          <span className="text-xs text-white/30">Repository</span>
          <button
            onClick={() => openExternal(entry.repository)}
            className="text-xs text-primary/80 hover:text-primary flex items-center gap-1 truncate ml-4"
          >
            {entry.repository.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '')}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>

        {/* Permissions */}
        {entry.permissions.length > 0 && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
            <h4 className="text-sm font-medium text-white/60 mb-3">Permissions</h4>
            <div className="space-y-2">
              {entry.permissions.map((perm) => (
                <div key={perm} className="flex items-center gap-2 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <span className="text-white/60">{getPermissionLabel(perm)}</span>
                  <span className="text-white/20 ml-auto font-mono">{perm}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/[0.06]">
        {isInstalled && installedVersion && entry.version !== installedVersion ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <ArrowUpCircle className="h-4 w-4" /> Update available: v{installedVersion} &rarr; v{entry.version}
            </div>
            <button
              onClick={onUpdate}
              disabled={updating}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50 active:scale-[0.97]"
            >
              {updating ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</> : <><RefreshCw className="h-4 w-4" /> Update Plugin</>}
            </button>
          </div>
        ) : isInstalled ? (
          <div className="flex items-center justify-center gap-2 text-sm text-green-400 py-2">
            <CheckCircle2 className="h-4 w-4" /> Up to date (v{installedVersion})
          </div>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.97]"
          >
            {installing ? <><Loader2 className="h-4 w-4 animate-spin" /> Installing...</> : <><Download className="h-4 w-4" /> Install Plugin</>}
          </button>
        )}
      </div>
    </SlidePanel>
  )
}

// ── Plugin Settings Page ──────────────────────────────────────────────────────

export function PluginSettings() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-plugin action locks
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [updating, setUpdating] = useState<string | null>(null)

  // Marketplace
  const [marketplacePlugins, setMarketplacePlugins] = useState<RegistryEntry[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(true)
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null)
  const [installingMarketplaceId, setInstallingMarketplaceId] = useState<string | null>(null)

  // Config panel
  const [configuringPlugin, setConfiguringPlugin] = useState<string | null>(null)
  const [configKey, setConfigKey] = useState(0)

  // Repos
  const [repos, setRepos] = useState<Array<{ url: string; label?: string; added_at: string }>>([])
  const [addingRepo, setAddingRepo] = useState(false)
  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [newRepoLabel, setNewRepoLabel] = useState('')
  const [showRepoManager, setShowRepoManager] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Gate: don't call plugin IPC until main process registers handlers.
  const [ipcReady, setIpcReady] = useState(false)
  useEffect(() => {
    const api = (window as Window).desktopAPI as
      | { onMainIpcReady?: () => Promise<void> }
      | undefined
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) setIpcReady(true)
    }, 3000)
    Promise.resolve(api?.onMainIpcReady?.()).finally(() => {
      clearTimeout(timeout)
      if (!cancelled) setIpcReady(true)
    })
    return () => { cancelled = true }
  }, [])

  const api = getPluginAPI()
  const { openModal } = useModal()

  const fetchPlugins = useCallback(async () => {
    if (!api) {
      setLoading(false)
      return
    }
    try {
      setError(null)
      await api.discover()
      const result = await api.list()
      setPlugins(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins.')
    } finally {
      setLoading(false)
    }
  }, [api])

  // ── Marketplace ─────────────────────────────────────────────────────────────

  async function loadMarketplace() {
    if (!api) return
    setMarketplaceLoading(true)
    setMarketplaceError(null)
    try {
      const result = await api.fetchMarketplace()
      if (result.success && result.plugins) {
        setMarketplacePlugins(result.plugins)
      } else {
        setMarketplaceError(result.error || 'Failed to load marketplace')
      }
    } catch (err) {
      setMarketplaceError(err instanceof Error ? err.message : 'Failed to load marketplace')
    } finally {
      setMarketplaceLoading(false)
    }
  }

  async function handleMarketplaceInstall(entry: RegistryEntry) {
    if (!api) return
    setInstallingMarketplaceId(entry.id)
    try {
      await api.install(entry.repository, entry.path)
      await fetchPlugins()
      // Remove from marketplace view so it appears in Connected
      setMarketplacePlugins((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstallingMarketplaceId(null)
    }
  }

  async function handleUpdatePlugin(pluginId: string) {
    if (!api) return
    setUpdating(pluginId)
    try {
      await api.update(pluginId)
      await fetchPlugins()
      loadMarketplace()
    } catch (err) {
      setMarketplaceError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdating(null)
    }
  }

  // ── Repo management ─────────────────────────────────────────────────────────

  async function loadRepos() {
    if (!api) return
    try {
      setRepos(await api.getRepos())
    } catch (err: any) {
      console.error('Failed to load repos:', err)
      setError(err?.message || 'Failed to load repos')
    }
  }

  async function handleAddRepo() {
    if (!api || !newRepoUrl.trim()) return
    setAddingRepo(true)
    try {
      setRepos(await api.addRepo(newRepoUrl.trim(), newRepoLabel.trim() || undefined))
      setNewRepoUrl('')
      setNewRepoLabel('')
      loadMarketplace()
    } catch (err) {
      setMarketplaceError(err instanceof Error ? err.message : 'Failed to add repo')
    } finally {
      setAddingRepo(false)
    }
  }

  async function handleRemoveRepo(url: string) {
    if (!api) return
    try {
      setRepos(await api.removeRepo(url))
      loadMarketplace()
    } catch (err: any) {
      console.error('Failed to remove repo:', err)
      setError(err?.message || 'Failed to remove repo')
    }
  }

  useEffect(() => {
    if (ipcReady) fetchPlugins()
  }, [fetchPlugins, ipcReady])

  useEffect(() => {
    if (!ipcReady) return
    loadMarketplace()
    loadRepos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipcReady])

  // Detail panel — open via root modal system
  useEffect(() => {
    if (!selectedEntry) return

    let close: () => void = () => {}
    close = openModal(
      <MarketplaceDetailPanel
        entry={selectedEntry}
        isInstalled={plugins.some((p) => p.id === selectedEntry.id)}
        installedVersion={plugins.find((p) => p.id === selectedEntry.id)?.version}
        installing={installingMarketplaceId === selectedEntry.id}
        updating={updating === selectedEntry.id}
        onInstall={() => {
          handleMarketplaceInstall(selectedEntry)
          close()
        }}
        onUpdate={plugins.some((p) => p.id === selectedEntry.id) ? () => {
          handleUpdatePlugin(selectedEntry.id)
          close()
        } : undefined}
        onClose={() => close()}
      />,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry])

  // Config panel — open via root modal system
  useEffect(() => {
    if (!configuringPlugin) return

    const plugin = plugins.find((p) => p.id === configuringPlugin)

    let close: () => void = () => {}
    close = openModal(
      plugin ? (
        <PluginConfigPanel
          key={configKey}
          plugin={plugin}
          api={api!}
          onClose={() => { setConfiguringPlugin(null); close() }}
          onConfigSaved={() => {
            fetchPlugins()
            setConfigKey((k) => k + 1)
          }}
        />
      ) : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuringPlugin, configKey])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggle = useCallback(
    async (plugin: PluginInfo) => {
      if (!api) return
      const id = plugin.id
      setToggling((prev) => ({ ...prev, [id]: true }))
      try {
        if (plugin.status === 'enabled') {
          await api.disable(id)
          setPlugins((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: 'disabled' as const } : p)),
          )
        } else {
          await api.enable(id)
          setPlugins((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: 'enabled' as const } : p)),
          )
        }
      } catch (err: any) {
        console.error(`Failed to toggle plugin ${id}:`, err)
        setError(`Failed to toggle plugin: ${err?.message || 'Unknown error'}`)
      } finally {
        setToggling((prev) => ({ ...prev, [id]: false }))
      }
    },
    [api],
  )

  const openConfig = useCallback(
    (plugin: PluginInfo) => {
      if (!api) return
      setConfiguringPlugin(plugin.id)
    },
    [api],
  )

  // ── Derived data ────────────────────────────────────────────────────────────

  const query = searchQuery.toLowerCase().trim()

  const connectedPlugins = plugins
    .filter((p) => p.status === 'enabled')
    .filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query),
    )

  const otherPlugins = plugins
    .filter((p) => p.status !== 'enabled')
    .filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query),
    )

  // For the popular section, show marketplace entries not connected.
  // If there's a search query, filter across all marketplace names/descriptions.
  const popularPlugins = marketplacePlugins
    .filter((e) => !plugins.some((p) => p.id === e.id && p.status === 'enabled'))
    .filter(
      (e) =>
        !query ||
        e.name.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.author.toLowerCase().includes(query),
    )

  const hasAnyConnected = connectedPlugins.length > 0
  const hasAnyOther = otherPlugins.length > 0
  const hasAnyPopular = popularPlugins.length > 0
  const hasErrorPlugins = otherPlugins.some((p) => p.status === 'error')

  // ── Browser mode fallback ──

  if (!api) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-md)' }}
        >
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Plugins</h2>
            <p className="mt-1 text-sm text-white/50">
              Extend Otix with community-built plugins.
            </p>
          </div>
          <div className="flex items-center justify-center py-8 text-sm text-white/40">
            <Puzzle className="h-5 w-5 mr-2" />
            Plugins are only available in the Otix desktop app.
          </div>
        </div>
      </div>
    )
  }

  // ── Loading state ──

  if (loading) {
    return (
      <div className="space-y-6">
        <HeroBanner plugins={plugins} onBrowseAll={() => {}} />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  // ── Main content ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Hero Banner ── */}
      <HeroBanner
        plugins={plugins}
        onBrowseAll={() => {
          const el = document.getElementById('popular-plugins')
          el?.scrollIntoView({ behavior: 'smooth' })
        }}
      />

      {/* ── Search + Actions Row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins..."
            className="w-full h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/30 focus:bg-white/[0.06] transition-all"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowRepoManager(!showRepoManager)}
          className={cn(
            'inline-flex items-center gap-2 h-10 rounded-xl px-4 text-xs font-medium border transition-colors',
            showRepoManager
              ? 'border-primary/30 bg-primary/5 text-primary'
              : 'border-white/[0.06] text-white/50 hover:text-white hover:border-white/20',
          )}
        >
          <Database className="h-3.5 w-3.5" />
          Repositories
          <ChevronDown className={cn('h-3 w-3 transition-transform', showRepoManager && 'rotate-180')} />
        </button>
      </div>

      {/* ── Repo Manager (expandable) ── */}
      {showRepoManager && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
          <h4 className="text-sm font-semibold text-white">Plugin Repositories</h4>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRepoUrl}
              onChange={(e) => setNewRepoUrl(e.target.value)}
              placeholder="Repository URL..."
              className="flex-1 h-9 rounded-lg bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/30 border border-white/[0.06] focus:border-primary/30 transition-colors"
            />
            <input
              type="text"
              value={newRepoLabel}
              onChange={(e) => setNewRepoLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-36 h-9 rounded-lg bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/30 border border-white/[0.06] focus:border-primary/30 transition-colors"
            />
            <button
              type="button"
              onClick={handleAddRepo}
              disabled={addingRepo || !newRepoUrl.trim()}
              className="inline-flex items-center gap-2 h-9 rounded-lg px-4 text-sm font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 shrink-0"
            >
              {addingRepo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </button>
          </div>
          {repos.length > 0 && (
            <div className="space-y-1.5">
              {repos.map((repo) => (
                <div key={repo.url} className="flex items-center gap-2 text-xs group">
                  <Database className="h-3 w-3 text-white/20 shrink-0" />
                  <span className="text-white/50 truncate flex-1">{repo.label || repo.url}</span>
                  <span className="text-white/20 shrink-0">{new Date(repo.added_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleRemoveRepo(repo.url)}
                    className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {repos.length === 0 && (
            <p className="text-xs text-white/20">No repos configured. Add a registry URL to discover plugins.</p>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl p-4 bg-red-500/5 border border-red-500/10">
          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Error</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => { setLoading(true); setError(null); fetchPlugins() }}
            className="shrink-0 inline-flex items-center gap-1 h-8 rounded-lg px-3 text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Connected Plugins ── */}
      {hasAnyConnected && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-lg font-semibold text-white">Connected Plugins</h2>
            <span className="text-xs text-white/30 bg-white/5 rounded-full px-2 py-0.5">
              {connectedPlugins.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedPlugins.map((plugin) => {
              const marketplaceEntry = marketplacePlugins.find((e) => e.id === plugin.id)
              const hasUpdate = marketplaceEntry && marketplaceEntry.version !== plugin.version
              return (
                <ConnectedCard
                  key={plugin.id}
                  plugin={plugin}
                  hasUpdate={!!hasUpdate}
                  updateVersion={hasUpdate ? marketplaceEntry!.version : undefined}
                  onManage={() => openConfig(plugin)}
                  onToggle={() => handleToggle(plugin)}
                  toggling={toggling[plugin.id] ?? false}
                  updating={updating === plugin.id}
                  onUpdate={hasUpdate ? () => handleUpdatePlugin(plugin.id) : undefined}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* ── Other Installed (disabled / error) ── */}
      {hasAnyOther && !query && (
        <section>
          <button
            type="button"
            onClick={() => setShowInactive((p) => !p)}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', showInactive && 'rotate-90')} />
            {otherPlugins.length} inactive {otherPlugins.length === 1 ? 'plugin' : 'plugins'}
            {hasErrorPlugins && (
              <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 rounded-full px-2 py-0.5">
                <AlertCircle className="h-3 w-3" />
                {otherPlugins.filter((p) => p.status === 'error').length} errors
              </span>
            )}
          </button>
          {showInactive && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherPlugins.map((plugin) => {
                const marketplaceEntry = marketplacePlugins.find((e) => e.id === plugin.id)
                const hasUpdate = marketplaceEntry && marketplaceEntry.version !== plugin.version
                return (
                  <ConnectedCard
                    key={plugin.id}
                    plugin={plugin}
                    hasUpdate={!!hasUpdate}
                    updateVersion={hasUpdate ? marketplaceEntry!.version : undefined}
                    onManage={() => openConfig(plugin)}
                    onToggle={() => handleToggle(plugin)}
                    toggling={toggling[plugin.id] ?? false}
                    updating={updating === plugin.id}
                    onUpdate={hasUpdate ? () => handleUpdatePlugin(plugin.id) : undefined}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Marketplace error ── */}
      {marketplaceError && (
        <div className="flex items-start gap-3 rounded-xl p-4 bg-red-500/5 border border-red-500/10">
          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Failed to load marketplace</p>
            <p className="text-xs text-red-300/70 mt-0.5">{marketplaceError}</p>
          </div>
          <button onClick={loadMarketplace} className="shrink-0 inline-flex items-center gap-1 h-8 rounded-lg px-3 text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Popular Plugins ── */}
      <section id="popular-plugins">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Popular Plugins</h2>
            {popularPlugins.length > 0 && (
              <span className="text-xs text-white/30 bg-white/5 rounded-full px-2 py-0.5">
                {popularPlugins.length > 99 ? '99+' : popularPlugins.length}
              </span>
            )}
          </div>
          {!marketplaceError && popularPlugins.length > 8 && (
            <button
              onClick={() => {
                setSearchQuery('')
                setShowRepoManager(false)
              }}
              className="text-sm text-primary/70 hover:text-primary inline-flex items-center gap-1 font-medium transition-colors"
            >
              View all plugins
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Loading */}
        {marketplaceLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
        )}

        {/* Empty: search no results */}
        {!marketplaceLoading && !marketplaceError && query && popularPlugins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Store className="h-8 w-8 text-white/20 mb-2" />
            <p className="text-sm text-white/40">No plugins match &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {/* Empty: no marketplace data */}
        {!marketplaceLoading && !marketplaceError && !query && marketplacePlugins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="h-10 w-10 text-white/20 mb-3" />
            <p className="text-sm text-white/40">No plugins available</p>
            <p className="text-xs text-white/30 mt-1">Add a repository to browse community plugins.</p>
          </div>
        )}

        {/* Grid — grouped by category */}
        {!marketplaceLoading && !marketplaceError && hasAnyPopular && (
          <div className="space-y-8">
            {CATEGORY_ORDER.map((cat) => {
              const entries = popularPlugins.filter((e) => getPluginCategory(e) === cat)
              if (entries.length === 0) return null
              const style = CATEGORY_STYLES[cat]
              return (
                <div key={cat} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className={cn('text-sm font-semibold tracking-tight', style.color)}>
                      {style.label}
                    </h3>
                    <span className="text-xs text-white/30 bg-white/5 rounded-full px-2 py-0.5">
                      {entries.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {entries.map((entry) => (
                      <PopularCard
                        key={entry.id}
                        entry={entry}
                        isInstalled={plugins.some((p) => p.id === entry.id)}
                        installedVersion={plugins.find((p) => p.id === entry.id)?.version}
                        onConnect={() => handleMarketplaceInstall(entry)}
                        onConfigure={() => {
                          const p = plugins.find((pl) => pl.id === entry.id)
                          if (p) openConfig(p)
                        }}
                        connecting={installingMarketplaceId === entry.id}
                        onClick={() => setSelectedEntry(entry)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
