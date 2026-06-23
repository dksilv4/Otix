import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, Loader2, Puzzle, ExternalLink, Trash2, CheckCircle2, XCircle, AlertCircle, Download, RefreshCw, Settings, X, Lock, Store, ChevronDown, ShieldCheck, Database, ArrowUpCircle } from 'lucide-react'
import { useModal, SlidePanel } from '@/lib/modals'
import { PluginConfigPanel } from './settings-plugin-config-panel'
import type { PluginInfo, PluginManifest, PluginConfigField } from '@/features/settings/types/plugins'
import { cn } from '@/lib/utils'
import { DkSwitch } from '@/old-features/dk-ui/atoms/switch'

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
  getStatus(pluginId: string): Promise<Record<string, unknown> | null>
  callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown>
  fetchMarketplace(registryUrl?: string): Promise<{ success: boolean; plugins?: RegistryEntry[]; error?: string }>
  getRepos(): Promise<{ url: string; label: string | null; added_at: string }[]>
  addRepo(url: string, label?: string): Promise<{ url: string; label: string | null; added_at: string }[]>
  removeRepo(url: string): Promise<{ url: string; label: string | null; added_at: string }[]>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  'api:proxy': 'API Proxy',
  'network:external': 'Network',
  'storage:local': 'Local Storage',
  'events:subscribe': 'Event Subscription',
  'ui:settings': 'Settings Page',
  'ui:media.actions': 'Media Actions',
  'ui:list.actions': 'List Controls',
  'ui:nav.item': 'Nav Item',
  'ui:dashboard.widget': 'Dashboard Widget',
  'notifications': 'Notifications',
  'worker:compute': 'Background Processing',
}

function getPermissionLabel(perm: string): string {
  return PERMISSION_LABELS[perm] ?? perm
}

function getStatusConfig(status: PluginInfo['status']): { label: string; class: string } {
  switch (status) {
    case 'enabled':
      return { label: 'Enabled', class: 'text-green-400 bg-green-500/10' }
    case 'disabled':
    case 'installed':
      return { label: 'Disabled', class: 'text-white/40 bg-white/5' }
    case 'error':
      return { label: 'Error', class: 'text-red-400 bg-red-500/10' }
  }
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

// Derive plugin function category from its permissions
const CATEGORY_MAP: [string, string[], string][] = [
  ['Scanner', ['worker:filesystem', 'worker:compute'], 'text-cyan-400 bg-cyan-500/10'],
  ['Integration', ['api:proxy', 'network:external'], 'text-blue-400 bg-blue-500/10'],
  ['Media', ['ui:media.actions'], 'text-purple-400 bg-purple-500/10'],
  ['UI', ['ui:settings', 'ui:nav.item', 'ui:dashboard.widget', 'ui:list.actions'], 'text-amber-400 bg-amber-500/10'],
  ['Notification', ['notifications'], 'text-pink-400 bg-pink-500/10'],
  ['Storage', ['storage:local'], 'text-emerald-400 bg-emerald-500/10'],
]

function getPluginCategory(plugin: PluginInfo): { label: string; class: string } | null {
  const perms = plugin.manifest.permissions
  for (const [label, keys, cls] of CATEGORY_MAP) {
    if (keys.some(k => perms.includes(k))) return { label, class: cls }
  }
  return null
}

export function getPluginAPI(): PluginAPI | null {
  const desktopAPI = (window as Window).desktopAPI as
    | { plugin: PluginAPI }
    | undefined
  return desktopAPI?.plugin ?? null
}

// ── IconButton (shared action helper) ─────────────────────────────────────────

function IconButton({
  onClick,
  icon: Icon,
  tooltip,
  disabled,
  loading,
  hoverColor = 'white',
}: {
  onClick?: () => void
  icon: React.ComponentType<{ className?: string }>
  tooltip?: string
  disabled?: boolean
  loading?: boolean
  hoverColor?: 'white' | 'red'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        hoverColor === 'red'
          ? 'text-white/30 hover:text-red-400 hover:bg-red-500/10'
          : 'text-white/40 hover:text-white hover:bg-white/5',
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  )
}

// ── Plugin Card ───────────────────────────────────────────────────────────────

function PluginCard({
  plugin,
  onToggle,
  onUninstall,
  onReload,
  onConfigure,
  onUpdate,
  toggling,
  uninstalling,
  reloading,
  updating,
  updateVersion,
}: {
  plugin: PluginInfo
  onToggle: () => void
  onUninstall: () => void
  onReload: () => void
  onConfigure?: () => void
  onUpdate?: () => void
  toggling: boolean
  uninstalling: boolean
  reloading: boolean
  updating?: boolean
  updateVersion?: string
}) {
  const [confirmingUninstall, setConfirmingUninstall] = useState(false)
  const statusCfg = getStatusConfig(plugin.status)
  const hasConfig = plugin.manifest.config && Object.keys(plugin.manifest.config).length > 0
  const isEnabled = plugin.status === 'enabled'
  const hasError = plugin.status === 'error'

  const pluginIcon = PLUGIN_ICONS[plugin.manifest.icon || ''] || PLUGIN_ICONS.default

  return (
    <div
      className={cn(
        'relative rounded-xl border transition-all duration-200',
        hasError
          ? 'border-red-500/20'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
      )}
    >
      {hasError && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-400 rounded-l-xl" />}

      <div className="p-4 space-y-3">
        {/* Top: icon row + toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
              {pluginIcon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white truncate max-w-[160px]">{plugin.name}</h3>
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    hasError ? 'bg-red-400' : isEnabled ? 'bg-green-500' : 'bg-white/20',
                  )}
                />
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">v{plugin.version} &middot; {plugin.author}</p>
            </div>
          </div>
          <DkSwitch checked={isEnabled} onCheckedChange={onToggle} disabled={toggling} />
        </div>

        {/* Description */}
        {plugin.description && (
          <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{plugin.description}</p>
        )}

        {/* Function category */}
        {getPluginCategory(plugin) && (
          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', getPluginCategory(plugin)!.class)}>
            {getPluginCategory(plugin)!.label}
          </span>
        )}

        {/* Provides / Depends on */}
        {plugin.manifest.services && plugin.manifest.services.length > 0 && (
          <p className="text-[10px] text-white/30">
            Provides: {plugin.manifest.services.join(', ')}
          </p>
        )}
        {(plugin.manifest as any).depends_on?.length > 0 && (
          <p className="text-[10px] text-amber-400/60">
            Depends on: {(plugin.manifest as any).depends_on.join(', ')}
          </p>
        )}

        {/* Permissions */}
        {plugin.manifest.permissions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {plugin.manifest.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.03] text-white/35"
              >
                {getPermissionLabel(perm)}
              </span>
            ))}
          </div>
        )}

        {/* Bottom action row */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
          <div className="flex items-center gap-0.5">
            {isEnabled && (
              <>
                <IconButton onClick={onReload} loading={reloading} icon={RefreshCw} tooltip="Reload" />
                {hasConfig && <IconButton onClick={onConfigure} icon={Settings} tooltip="Configure" />}
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onUpdate && updateVersion && (
              <button
                type="button"
                onClick={onUpdate}
                disabled={updating}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
              >
                {updating ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArrowUpCircle className="h-3 w-3" />}
                v{updateVersion}
              </button>
            )}

            {confirmingUninstall ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onUninstall}
                  disabled={uninstalling}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  {uninstalling ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                  Remove
                </button>
                <IconButton onClick={() => setConfirmingUninstall(false)} icon={X} tooltip="Cancel" />
              </div>
            ) : (
              <IconButton onClick={() => setConfirmingUninstall(true)} icon={Trash2} tooltip="Uninstall" hoverColor="red" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Marketplace Card ──────────────────────────────────────────────────────────

function MarketplaceCard({
  entry,
  isInstalled,
  installedVersion,
  onClick,
}: {
  entry: RegistryEntry
  isInstalled: boolean
  installedVersion?: string
  onClick: () => void
}) {
  const icon = PLUGIN_ICONS[entry.icon || ''] || PLUGIN_ICONS.default
  const canUpdate = isInstalled && installedVersion && entry.version !== installedVersion

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/10 cursor-pointer w-full"
    >
      {/* Icon row */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl text-xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
        >
          {icon}
        </div>
        {isInstalled ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 rounded-full px-1.5 py-0.5 shrink-0">
            <CheckCircle2 className="h-2.5 w-2.5" /> Installed
          </span>
        ) : canUpdate ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5 shrink-0">
            <ArrowUpCircle className="h-2.5 w-2.5" /> v{entry.version}
          </span>
        ) : null}
      </div>

      <h3 className="text-sm font-semibold text-white mb-0.5">{entry.name}</h3>
      <p className="text-xs text-white/40 mb-2">{entry.author} &middot; v{entry.version}</p>
      <p className="text-xs text-white/50 line-clamp-2 leading-relaxed mb-3">{entry.description}</p>

      <div className="flex items-center gap-2">
        {entry.category && (
          <span className="text-[10px] text-white/40 bg-white/5 rounded-md px-1.5 py-0.5">{entry.category}</span>
        )}
        <span className="text-[10px] text-white/30">{entry.permissions.length} permissions</span>
      </div>
    </button>
  )
}

// ── Marketplace Detail Panel ──────────────────────────────────────────────────

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
          <h2 className="text-lg font-semibold text-white">{entry.name}</h2>
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
            onClick={() => (window as Window).desktopAPI?.openExternal?.(entry.repository)}
            className="text-xs text-primary/80 hover:text-primary flex items-center gap-1 truncate ml-4"
          >
            {entry.repository.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '')}
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

// ── Category section (groups installed plugins by status) ────────────────────

function PluginCategorySection({
  label,
  count,
  color,
  query,
  plugins,
  statusFilter,
  marketplacePlugins,
  handleToggle,
  handleUninstall,
  handleReload,
  openConfig,
  handleUpdatePlugin,
  toggling,
  uninstalling,
  reloading,
  updating,
}: {
  label: string
  count: number
  color: 'red' | 'green' | 'gray'
  query: string
  plugins: PluginInfo[]
  statusFilter: string | string[]
  marketplacePlugins: RegistryEntry[]
  handleToggle: (plugin: PluginInfo) => void
  handleUninstall: (plugin: PluginInfo) => void
  handleReload: (plugin: PluginInfo) => void
  openConfig: (plugin: PluginInfo) => void
  handleUpdatePlugin: (pluginId: string) => Promise<void>
  toggling: Record<string, boolean>
  uninstalling: Record<string, boolean>
  reloading: Record<string, boolean>
  updating: string | null
}) {
  const filter = Array.isArray(statusFilter)
    ? (p: PluginInfo) => statusFilter.includes(p.status)
    : (p: PluginInfo) => p.status === statusFilter

  const filtered = plugins.filter(filter)
  if (filtered.length === 0) return null

  const headerClass =
    color === 'red'
      ? 'text-red-400'
      : color === 'green'
        ? 'text-green-400'
        : 'text-white/40'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider', headerClass)}>
          {label}
        </h4>
        <span className="text-xs text-white/30">{count}</span>
      </div>

      {query && filtered.length === 0 ? null : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((plugin) => {
            const marketplaceEntry = marketplacePlugins.find((e) => e.id === plugin.id)
            const hasUpdate = marketplaceEntry && marketplaceEntry.version !== plugin.version
            return (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={() => handleToggle(plugin)}
                onUninstall={() => handleUninstall(plugin)}
                onReload={() => handleReload(plugin)}
                onConfigure={plugin.status === 'enabled' && plugin.manifest.config && Object.keys(plugin.manifest.config).length > 0 ? () => openConfig(plugin) : undefined}
                onUpdate={hasUpdate ? () => handleUpdatePlugin(plugin.id) : undefined}
                toggling={toggling[plugin.id] ?? false}
                uninstalling={uninstalling[plugin.id] ?? false}
                reloading={reloading[plugin.id] ?? false}
                updating={updating === plugin.id}
                updateVersion={hasUpdate ? marketplaceEntry.version : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Plugin Settings Page ──────────────────────────────────────────────────────

export function PluginSettings() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-plugin action states
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [uninstalling, setUninstalling] = useState<Record<string, boolean>>({})
  const [reloading, setReloading] = useState<Record<string, boolean>>({})

  // Config panel state
  const [configuringPlugin, setConfiguringPlugin] = useState<string | null>(null)

  // Marketplace state
  const [marketplacePlugins, setMarketplacePlugins] = useState<RegistryEntry[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null)
  const [installingMarketplaceId, setInstallingMarketplaceId] = useState<string | null>(null)
  const [marketplaceInstallError, setMarketplaceInstallError] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null)

  // Update state
  const [updating, setUpdating] = useState<string | null>(null)

  // Repo management state
  const [repos, setRepos] = useState<{ url: string; label: string | null; added_at: string }[]>([])
  const [showRepoManager, setShowRepoManager] = useState(false)
  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [newRepoLabel, setNewRepoLabel] = useState('')
  const [addingRepo, setAddingRepo] = useState(false)

  // Search + marketplace category filter
  const [searchQuery, setSearchQuery] = useState('')
  const [marketplaceCategory, setMarketplaceCategory] = useState<string | null>(null)
  // Reset category filter when searching
  useEffect(() => { if (searchQuery) setMarketplaceCategory(null) }, [searchQuery])

  // Gate: don't call plugin IPC until main process registers handlers.
  const [ipcReady, setIpcReady] = useState(false)
  useEffect(() => {
    const api = (window as Window).desktopAPI as
      | { onMainIpcReady?: () => Promise<void> }
      | undefined
    Promise.resolve(api?.onMainIpcReady?.()).finally(() => setIpcReady(true))
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
    setMarketplaceInstallError(null)
    try {
      await api.install(entry.repository, entry.path)
      await fetchPlugins()
    } catch (err) {
      setMarketplaceInstallError(err instanceof Error ? err.message : 'Install failed')
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

    const close = openModal(
      <MarketplaceDetailPanel
        entry={selectedEntry}
        isInstalled={plugins.some((p) => p.id === selectedEntry.id)}
        installedVersion={plugins.find((p) => p.id === selectedEntry.id)?.version}
        installing={installingMarketplaceId === selectedEntry.id}
        updating={updating === selectedEntry.id}
        onInstall={() => handleMarketplaceInstall(selectedEntry)}
        onUpdate={() => handleUpdatePlugin(selectedEntry.id)}
        onClose={() => setSelectedEntry(null)}
      />,
    )

    return () => close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry])

  // Config panel — open via root modal system
  useEffect(() => {
    if (!configuringPlugin) return
    const pluginData = plugins.find((p) => p.id === configuringPlugin)
    if (!pluginData) return

    const close = openModal(
      <PluginConfigPanel
        plugin={pluginData}
        api={api}
        onClose={() => setConfiguringPlugin(null)}
      />,
    )

    return () => close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuringPlugin])

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

  const handleUninstall = useCallback(
    async (plugin: PluginInfo) => {
      if (!api) return
      const id = plugin.id
      setUninstalling((prev) => ({ ...prev, [id]: true }))
      try {
        await api.uninstall(id)
        setPlugins((prev) => prev.filter((p) => p.id !== id))
      } catch (err: any) {
        console.error(`Failed to uninstall plugin ${id}:`, err)
        setError(`Failed to uninstall plugin: ${err?.message || 'Unknown error'}`)
      } finally {
        setUninstalling((prev) => ({ ...prev, [id]: false }))
      }
    },
    [api],
  )

  const handleReload = useCallback(
    async (plugin: PluginInfo) => {
      if (!api) return
      const id = plugin.id
      setReloading((prev) => ({ ...prev, [id]: true }))
      try {
        await api.reload(id)
        setPlugins((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'enabled' as const } : p)),
        )
      } catch (err: any) {
        console.error(`Failed to reload plugin ${id}:`, err)
        setError(`Failed to reload plugin: ${err?.message || 'Unknown error'}`)
      } finally {
        setReloading((prev) => ({ ...prev, [id]: false }))
      }
    },
    [api],
  )

  const openConfig = useCallback((plugin: PluginInfo) => {
    if (!api) return
    setConfiguringPlugin(plugin.id)
  }, [api])

  // ── Search filtering ────────────────────────────────────────────────────────

  const query = searchQuery.toLowerCase().trim()
  const filteredPlugins = query
    ? plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query),
      )
    : plugins

  const filteredMarketplace = marketplacePlugins.filter((e) => {
    if (query && !e.name.toLowerCase().includes(query) && !e.description.toLowerCase().includes(query) && !e.author.toLowerCase().includes(query)) return false
    if (marketplaceCategory && e.category !== marketplaceCategory) return false
    return true
  })

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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──

  if (error) {
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
          <div
            className="flex items-center gap-3 rounded-xl p-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}
          >
            <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">Failed to load plugins</p>
              <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                setError(null)
                fetchPlugins()
              }}
              className="ml-auto inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main content ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Compact header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Puzzle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Plugins</h2>
          <p className="text-sm text-white/50">Extend Otix with community-built plugins.</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search plugins..."
          className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/[0.07] transition-colors"
        />
      </div>

      {/* Error banner (inline, non-blocking) */}
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
            className="shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* ── Browse / Marketplace ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Browse</h3>
          {!query && (
            <button
              onClick={() => setShowRepoManager(!showRepoManager)}
              className="text-xs text-white/40 hover:text-white/60 transition-colors inline-flex items-center gap-1"
            >
              <Database className="h-3 w-3" />
              {repos.length} repo{repos.length !== 1 ? 's' : ''}
              <ChevronDown className={`h-3 w-3 transition-transform ${showRepoManager ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Repo manager */}
        {!query && showRepoManager && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newRepoUrl}
                onChange={e => setNewRepoUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/user/repo/main/registry.json"
                className="flex-1 h-9 rounded-lg px-3 text-sm text-white bg-white/5 border border-white/10 placeholder:text-white/20 focus:outline-none focus:border-primary/50"
              />
              <input
                type="text"
                value={newRepoLabel}
                onChange={e => setNewRepoLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-32 h-9 rounded-lg px-3 text-sm text-white bg-white/5 border border-white/10 placeholder:text-white/20 focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleAddRepo}
                disabled={addingRepo || !newRepoUrl.trim()}
                className="h-9 rounded-lg px-4 text-sm font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 shrink-0"
              >
                {addingRepo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </button>
            </div>

            {repos.length > 0 && (
              <div className="space-y-1.5">
                {repos.map(repo => (
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

        {/* Marketplace error */}
        {marketplaceError && (
          <div className="flex items-start gap-3 rounded-xl p-4 bg-red-500/5 border border-red-500/10">
            <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-300">Failed to load marketplace</p>
              <p className="text-xs text-red-300/70 mt-0.5">{marketplaceError}</p>
            </div>
            <button onClick={loadMarketplace} className="shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {/* Marketplace loading */}
        {marketplaceLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}

        {/* Install feedback */}
        {marketplaceInstallError && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-red-500/5">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{marketplaceInstallError}</p>
          </div>
        )}

        {/* Category filter chips */}
        {!marketplaceLoading && !marketplaceError && marketplacePlugins.length > 0 && !query && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setMarketplaceCategory(null)}
              className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                !marketplaceCategory
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.04] text-white/40 hover:text-white hover:bg-white/[0.08]',
              )}
            >
              All
            </button>
            {[...new Set(marketplacePlugins.map(e => e.category).filter(Boolean))].map((cat) => (
              <button
                key={cat}
                onClick={() => setMarketplaceCategory(marketplaceCategory === cat ? null : cat)}
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors',
                  marketplaceCategory === cat
                    ? 'bg-white/10 text-white'
                    : 'bg-white/[0.04] text-white/40 hover:text-white hover:bg-white/[0.08]',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Marketplace grid */}
        {!marketplaceLoading && !marketplaceError && query && filteredMarketplace.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Store className="h-8 w-8 text-white/20 mb-2" />
            <p className="text-sm text-white/40">No plugins match &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {!marketplaceLoading && !marketplaceError && !query && marketplacePlugins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="h-10 w-10 text-white/20 mb-3" />
            <p className="text-sm text-white/40">No plugins available</p>
            <p className="text-xs text-white/30 mt-1">Add a repository to browse community plugins.</p>
          </div>
        )}

        {!marketplaceLoading && !marketplaceError && filteredMarketplace.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredMarketplace.map((entry) => {
              const installedPlugin = plugins.find((p) => p.id === entry.id)
              return (
                <MarketplaceCard
                  key={entry.id}
                  entry={entry}
                  isInstalled={!!installedPlugin}
                  installedVersion={installedPlugin?.version}
                  onClick={() => setSelectedEntry(entry)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-white/[0.06]" />

      {/* ── Installed Plugins (categorized) ── */}
      {filteredPlugins.length === 0 && !query && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl mb-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)' }}
          >
            <Puzzle className="h-7 w-7" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">No plugins installed</h3>
          <p className="text-xs text-white/40 max-w-sm leading-relaxed">
            Browse the marketplace above or add a repository to install plugins.
          </p>
        </div>
      )}

      {filteredPlugins.length === 0 && query && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-white/40">No installed plugins match &quot;{searchQuery}&quot;</p>
        </div>
      )}

      {filteredPlugins.length > 0 && (
        <div className="space-y-6">
          {/* ── Error plugins ── */}
          {filteredPlugins.filter(p => p.status === 'error').length > 0 && (
            <PluginCategorySection
              label="Errors"
              count={filteredPlugins.filter(p => p.status === 'error').length}
              color="red"
              query={query}
              plugins={filteredPlugins}
              statusFilter="error"
              marketplacePlugins={marketplacePlugins}
              handleToggle={handleToggle}
              handleUninstall={handleUninstall}
              handleReload={handleReload}
              openConfig={openConfig}
              handleUpdatePlugin={handleUpdatePlugin}
              toggling={toggling}
              uninstalling={uninstalling}
              reloading={reloading}
              updating={updating}
            />
          )}

          {/* ── Active plugins ── */}
          {filteredPlugins.filter(p => p.status === 'enabled').length > 0 && (
            <PluginCategorySection
              label="Active"
              count={filteredPlugins.filter(p => p.status === 'enabled').length}
              color="green"
              query={query}
              plugins={filteredPlugins}
              statusFilter="enabled"
              marketplacePlugins={marketplacePlugins}
              handleToggle={handleToggle}
              handleUninstall={handleUninstall}
              handleReload={handleReload}
              openConfig={openConfig}
              handleUpdatePlugin={handleUpdatePlugin}
              toggling={toggling}
              uninstalling={uninstalling}
              reloading={reloading}
              updating={updating}
            />
          )}

          {/* ── Inactive plugins ── */}
          {filteredPlugins.filter(p => p.status === 'disabled' || p.status === 'installed').length > 0 && (
            <PluginCategorySection
              label="Inactive"
              count={filteredPlugins.filter(p => p.status === 'disabled' || p.status === 'installed').length}
              color="gray"
              query={query}
              plugins={filteredPlugins}
              statusFilter={['disabled', 'installed']}
              marketplacePlugins={marketplacePlugins}
              handleToggle={handleToggle}
              handleUninstall={handleUninstall}
              handleReload={handleReload}
              openConfig={openConfig}
              handleUpdatePlugin={handleUpdatePlugin}
              toggling={toggling}
              uninstalling={uninstalling}
              reloading={reloading}
              updating={updating}
            />
          )}
        </div>
      )}
    </div>
  )
}
