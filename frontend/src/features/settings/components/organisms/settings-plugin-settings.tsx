import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Puzzle, ExternalLink, Trash2, CheckCircle2, XCircle, AlertCircle, Download, RefreshCw, Settings, X, Lock, Store, ChevronDown, ShieldCheck, Database, ArrowUpCircle } from 'lucide-react'
import { useModal, SlidePanel } from '@/lib/modals'
import { PluginConfigPanel } from './settings-plugin-config-panel'
import type { PluginInfo, PluginManifest, PluginConfigField } from '@/features/settings/types/plugins'

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

export function getPluginAPI(): PluginAPI | null {
  const desktopAPI = (window as Window).desktopAPI as
    | { plugin: PluginAPI }
    | undefined
  return desktopAPI?.plugin ?? null
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
  const permCount = entry.permissions?.length || 0
  const canUpdate = isInstalled && installedVersion && entry.version !== installedVersion

  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] cursor-pointer w-full"
      style={{
        backgroundColor: 'var(--dk-surface-base)',
        boxShadow: 'var(--dk-shadow-sm)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Icon + Installed badge */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
        >
          {icon}
        </div>
        {isInstalled && (
          <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 rounded-full px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Installed
          </span>
        )}
        {canUpdate && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5 ml-1">
            <ArrowUpCircle className="h-3 w-3" /> v{entry.version} available
          </span>
        )}
      </div>

      <h3 className="font-semibold text-white text-sm mb-1">{entry.name}</h3>
      <p className="text-xs text-white/40 mb-2">{entry.author}</p>
      <p className="text-xs text-white/50 line-clamp-2 mb-3">{entry.description}</p>

      <div className="flex items-center gap-2">
        {entry.category && (
          <span className="text-xs text-white/40 bg-white/5 rounded-md px-2 py-0.5">{entry.category}</span>
        )}
        <span className="text-xs text-white/30">{permCount} permissions</span>
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
        {/* Description */}
        <p className="text-sm text-white/70 leading-relaxed">{entry.long_description || entry.description}</p>

        {/* Meta card */}
        {(entry.category || (entry.tags && entry.tags.length > 0)) && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--dk-surface-glass) 50%, transparent)' }}
          >
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
                    <span key={tag} className="text-xs text-white/50 bg-white/5 rounded-md px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Repository link */}
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ backgroundColor: 'color-mix(in srgb, var(--dk-surface-glass) 50%, transparent)' }}
        >
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
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--dk-surface-glass) 50%, transparent)' }}
          >
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
      <div className="px-6 py-4">
        {isInstalled && installedVersion && entry.version !== installedVersion ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <ArrowUpCircle className="h-4 w-4" /> Update available: v{installedVersion} &rarr; v{entry.version}
            </div>
            <button
              onClick={onUpdate}
              disabled={updating}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50 active:scale-[0.97]"
            >
              {updating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Update Plugin</>
              )}
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
            {installing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Installing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Install Plugin
              </>
            )}
          </button>
        )}
      </div>
    </SlidePanel>
  )
}

// ── Plugin Settings Page ──────────────────────────────────────────────────────
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
  const manifest = plugin.manifest
  const hasConfig = manifest.config && Object.keys(manifest.config).length > 0

  return (
    <div
      className="rounded-2xl p-5 space-y-4 transition-all duration-200"
      style={{
        backgroundColor: 'var(--dk-surface-base)',
        boxShadow: 'var(--dk-shadow-md)',
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-white truncate">{plugin.name}</h3>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.625rem] font-medium"
              style={{ backgroundColor: 'var(--dk-surface-raised)', color: 'var(--dk-muted-foreground)' }}
            >
              v{plugin.version}
            </span>
            <span className={'inline-flex items-center px-2 py-0.5 rounded-md text-[0.625rem] font-medium ' + statusCfg.class}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-0.5">by {plugin.author}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onUpdate && updateVersion && (
            <button
              type="button"
              onClick={onUpdate}
              disabled={updating}
              className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-all bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
            >
              {updating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-3.5 w-3.5" />
              )}
              {updating ? 'Updating...' : 'Update v' + updateVersion}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            className={
              'inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-all' +
              (plugin.status === 'enabled'
                ? ' bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                : ' bg-primary/10 text-primary hover:bg-primary/20') +
              (toggling ? ' opacity-50 pointer-events-none' : '')
            }
          >
            {toggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : plugin.status === 'enabled' ? (
              'Disable'
            ) : (
              'Enable'
            )}
          </button>

          {plugin.status === 'enabled' && (
            <>
              <button
                type="button"
                onClick={onReload}
                disabled={reloading}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-all text-white/40 hover:text-primary hover:bg-white/5"
              >
                {reloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
              {hasConfig && (
                <button
                  type="button"
                  onClick={onConfigure}
                  className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-all text-white/40 hover:text-primary hover:bg-white/5"
                  title="Configure"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (confirmingUninstall) {
                onUninstall()
                setConfirmingUninstall(false)
              } else {
                setConfirmingUninstall(true)
              }
            }}
            disabled={uninstalling}
            onBlur={() => setConfirmingUninstall(false)}
            className={
              'inline-flex items-center justify-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-all' +
              (confirmingUninstall
                ? ' bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : ' text-white/40 hover:text-red-400 hover:bg-white/5') +
              (uninstalling ? ' opacity-50 pointer-events-none' : '')
            }
          >
            {uninstalling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : confirmingUninstall ? (
              'Confirm?'
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Description */}
      {plugin.description && (
        <p className="text-sm text-white/60 leading-relaxed">{plugin.description}</p>
      )}

      {/* Error state */}
      {plugin.status === 'error' && plugin.error && (
        <div
          className="flex items-start gap-2 rounded-xl p-3"
          style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}
        >
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">{plugin.error}</p>
        </div>
      )}

      {/* Repository link */}
      {manifest.repository && (
        <a
          href={manifest.repository}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {manifest.repository.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}

      {/* Permissions */}
      {manifest.permissions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {manifest.permissions.map((perm) => (
            <span
              key={perm}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.625rem] font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                color: 'var(--primary)',
              }}
            >
              {getPermissionLabel(perm)}
            </span>
          ))}
        </div>
      )}

    </div>
  )
}


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
      await fetchPlugins() // Refresh installed list
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
      // Refresh marketplace
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-md)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}
          >
            <Puzzle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Plugins</h2>
            <p className="mt-1 text-sm text-white/50">
              Extend Otix with community-built plugins. Install plugins from GitHub repositories
              to add new features and integrations.
            </p>
          </div>
        </div>
      </div>

      {/* Discover Plugins */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white mb-1">Discover Plugins</h2>
        <p className="text-sm text-white/40 mb-5">Extend Otix with community plugins</p>

        {/* Manage Repos */}
        <button
          onClick={() => setShowRepoManager(!showRepoManager)}
          className="text-xs text-white/40 hover:text-white/60 transition-colors mb-4 inline-flex items-center gap-1"
        >
          <Database className="h-3 w-3" />
          {repos.length} repo{repos.length !== 1 ? 's' : ''}
          <ChevronDown className={`h-3 w-3 transition-transform ${showRepoManager ? 'rotate-180' : ''}`} />
        </button>

        {showRepoManager && (
          <div
            className="mb-5 p-4 rounded-xl space-y-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            {/* Add form */}
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

            {/* Repo list */}
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

        {marketplaceLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}

        {marketplaceError && !marketplaceLoading && (
          <div className="flex items-center gap-3 rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}>
            <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">Failed to load marketplace</p>
              <p className="text-xs text-red-300/70 mt-0.5">{marketplaceError}</p>
            </div>
            <button
              type="button"
              onClick={loadMarketplace}
              className="ml-auto inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {!marketplaceLoading && !marketplaceError && marketplacePlugins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="h-10 w-10 text-white/20 mb-3" />
            <p className="text-sm text-white/40">No plugins found in the marketplace.</p>
          </div>
        )}

        {/* Install feedback */}
        {marketplaceInstallError && (
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{marketplaceInstallError}</p>
          </div>
        )}

        {!marketplaceLoading && !marketplaceError && marketplacePlugins.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketplacePlugins.map((entry) => {
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


      {/* Installed Plugins */}
      <div className="border-t border-white/5 pt-6 mb-4">
        <h3 className="text-base font-semibold text-white">Installed Plugins ({plugins.length})</h3>
      </div>

      {/* Plugin list */}
      {plugins.length === 0 ? (
        <div
          className="rounded-2xl p-8 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-md)' }}
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)' }}
          >
            <Puzzle className="h-8 w-8" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No plugins installed</h3>
          <p className="text-sm text-white/40 max-w-sm leading-relaxed">
            The plugin ecosystem is growing. Paste a GitHub repository URL above to install
            your first plugin and extend what Otix can do.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => {
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
