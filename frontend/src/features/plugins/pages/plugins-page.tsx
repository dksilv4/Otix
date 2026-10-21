import { useState, useEffect, useCallback, createElement } from 'react'
import {
  Search,
  Loader2,
  Puzzle,
  XCircle,
  Download,
  RefreshCw,
  Settings,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { useModal } from '@/lib/modals'
import { PluginDetailPanel } from '../components/organisms/plugin-detail-panel'
import {
  getPluginAPI,
  getPluginCategory,
  getCategoryStyle,
  getPluginIcon,
  CATEGORY_ORDER,
} from '@/features/plugins/api'
import type { PluginInfo } from '@/features/plugins/types/plugins'
import { cn } from '@/lib/utils'
import { DkSwitch } from '@ui/atoms/switch'
import { FeatureStatusTags, kindsFromPluginStage } from '@ui/atoms/feature-status-tag'
import { SettingsCard } from '@/features/settings/components/molecules/settings-card'
import { SectionHeader } from '@/features/settings/components/molecules/settings-section-header'
import { SettingsLockedState } from '@/features/settings/components/molecules/settings-locked-state'
import { buildPluginGraph, getDependents, type GraphEdge } from '../utils/graph'

const PluginTopologyGraph = ({ enabledPlugins }: { enabledPlugins: PluginInfo[] }) => {
  const graph = buildPluginGraph(enabledPlugins)
  const nodeCount = graph.nodes.length

  const cx = 130
  const cy = 90

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

  const pluginEdges = graph.edges
    .map((edge) => {
      const s = posMap.get(edge.source)
      const t = posMap.get(edge.target)
      if (!s || !t) return null
      return { x1: s.px + 18, y1: s.py + 18, x2: t.px + 18, y2: t.py + 18, ...edge }
    })
    .filter(Boolean) as (GraphEdge & { x1: number; y1: number; x2: number; y2: number })[]

  const maxNodes = 7
  const visiblePositions = positions.slice(0, maxNodes)

  const fallback = (
    <div className="relative w-[260px] h-[180px]">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 180">
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={[30, 236, 24, 242, 54, 218][i]}
            y2={[26, 24, 106, 100, 168, 162][i]}
            stroke="var(--dk-separator)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-13 h-13 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 z-10 ring-2 ring-primary/20">
        <Puzzle className="w-6 h-6 text-primary-foreground" />
      </div>
      {[
        { x: 12, y: 8, label: 'Sh' },
        { x: 218, y: 6, label: 'Hu' },
        { x: 6, y: 88, label: 'An' },
        { x: 224, y: 82, label: 'WP' },
        { x: 36, y: 156, label: 'St' },
        { x: 200, y: 150, label: 'Gi' },
      ].map((n, i) => (
        <div
          key={i}
          className="absolute w-[36px] h-[36px] rounded-lg bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] shadow-sm flex items-center justify-center"
          style={{ left: n.x, top: n.y }}
        >
          <span className="text-[10px] font-bold text-foreground">{n.label}</span>
        </div>
      ))}
    </div>
  )

  if (visiblePositions.length === 0) return fallback

  const edgeColor = 'var(--dk-separator)'
  const strongEdgeColor = 'var(--primary)'

  return (
    <div className="relative">
      <div className="absolute -top-2 right-0 text-[10px] text-muted-foreground font-medium bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-full px-2 py-0.5">
        {nodeCount} connected
      </div>

      <div className="relative w-[260px] h-[180px]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 180">
          {visiblePositions.map((n) => (
            <line
              key={`hub-${n.id}`}
              x1={cx}
              y1={cy}
              x2={n.px + 18}
              y2={n.py + 18}
              stroke={edgeColor}
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          ))}
          {pluginEdges.map((e, i) => {
            const stroke = e.type === 'same_author' ? edgeColor : strongEdgeColor
            const dash = e.type === 'same_author' ? '3 3' : undefined
            return (
              <line
                key={`edge-${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={stroke}
                strokeWidth={e.type === 'same_author' ? 1 : 1.5}
                strokeDasharray={dash}
              />
            )
          })}
        </svg>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-13 h-13 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 z-10 ring-2 ring-primary/20">
          <Puzzle className="w-6 h-6 text-primary-foreground" />
        </div>

        {visiblePositions.map((n) => (
          <div key={n.id} className="group absolute" style={{ left: n.px, top: n.py }}>
            <div
              className="w-[36px] h-[36px] rounded-lg shadow-sm flex items-center justify-center transition-transform hover:scale-110 cursor-default bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)]"
            >
              <span className="text-[10px] font-bold text-primary">
                {n.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-lg bg-[var(--dk-surface-overlay)] border border-[var(--dk-separator)] text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
              {n.name}
            </div>
          </div>
        ))}

        {pluginEdges.length > 0 && (
          <div className="absolute bottom-0 left-0 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0 border-t border-dashed border-[var(--dk-separator)]" />
              <span className="text-[9px] text-muted-foreground">same author</span>
            </div>
            {pluginEdges.some((e) => e.type !== 'same_author') && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0 border-t border-[var(--dk-separator)]" />
                <span className="text-[9px] text-muted-foreground">depends</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
};

// ── Hero Banner ────────────────────────────────────────────────────────────────

const HeroBanner = ({ plugins }: { plugins: PluginInfo[] }) => {
  const connectedPlugins = plugins.filter((p) => p.status === 'enabled' && p.connected)
  const enabledPlugins = plugins.filter((p) => p.status === 'enabled' && !p.connected)
  const hasActive = connectedPlugins.length > 0 || enabledPlugins.length > 0

  return (
    <SettingsCard className="overflow-hidden">
      <div className="flex items-center gap-10">
        <div className="flex-1 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Puzzle className="h-3 w-3" />
            {hasActive ? `${connectedPlugins.length} connected, ${enabledPlugins.length} enabled` : 'Plugin Ecosystem'}
          </div>
          <h2 className="text-lg font-bold text-foreground leading-tight tracking-tight">
            {hasActive ? 'Your plugin ecosystem' : 'Powerful connections for better results'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-lg">
            {hasActive
              ? `You have ${connectedPlugins.length} plugin${connectedPlugins.length === 1 ? '' : 's'} connected and ${enabledPlugins.length} running.`
              : 'Connect your favorite services and extend Otix with community-built plugins. Automate workflows, sync your library, and unlock new capabilities.'}
          </p>
        </div>

        <div className="hidden lg:block shrink-0">
          <PluginTopologyGraph enabledPlugins={plugins.filter((p) => p.status === 'enabled')} />
        </div>
      </div>
    </SettingsCard>
  )
};

// ── Installed Row ──────────────────────────────────────────────────────────────

const InstalledPluginRow = ({
  plugin,
  category,
  onManage,
  onToggle,
  toggling,
}: {
  plugin: PluginInfo
  category: string
  onManage: () => void
  onToggle: () => void
  toggling: boolean
}) => {
  const icon = getPluginIcon(plugin.manifest.icon)
  const isError = plugin.status === 'error'
  const isEnabled = plugin.status === 'enabled'
  const isSystem = plugin.manifest.system === true
  const catStyle = getCategoryStyle(category)
  const stageTags = kindsFromPluginStage(plugin.manifest.stage)

  const status = isError
    ? { label: 'Error', cls: 'text-destructive' }
    : isEnabled
      ? { label: 'Enabled', cls: 'text-emerald-600 dark:text-emerald-400' }
      : { label: 'Disabled', cls: 'text-muted-foreground' }

  return (
    <div
      className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors duration-150 bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-hover)] border border-[var(--dk-separator)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {createElement(icon, { className: 'h-5 w-5' })}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="truncate text-sm font-semibold text-foreground">{plugin.name}</h4>
          {isSystem && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
              <ShieldCheck className="h-3 w-3" />
              System
            </span>
          )}
          <FeatureStatusTags kinds={stageTags} short />
        </div>
        {plugin.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{plugin.description}</p>}
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              catStyle.badge,
            )}
          >
            {category}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {plugin.author} &middot; v{plugin.version}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className={cn('inline-flex items-center text-xs font-medium whitespace-nowrap', status.cls)}>
          {status.label}
        </span>

        <button
          type="button"
          onClick={onManage}
          title="Configure"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--dk-surface-hover)] hover:text-foreground cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>

        {!isError && <DkSwitch checked={isEnabled} onCheckedChange={onToggle} disabled={toggling || isSystem} />}
      </div>
    </div>
  )
};

// ── Dependency Warning ─────────────────────────────────────────────────────────

const DependencyWarningModal = ({
  plugin,
  dependents,
  onCancel,
  onConfirm,
  isExiting,
}: {
  plugin: PluginInfo
  dependents: PluginInfo[]
  onCancel: () => void
  onConfirm: () => void
  isExiting?: boolean
}) => {
  const [animateIn, setAnimateIn] = useState(false)
  const visible = animateIn && !isExiting

  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true))
  }, [])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center transition-opacity duration-200 z-50"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md mx-4 flex flex-col bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] backdrop-blur-xl rounded-3xl shadow-[var(--dk-shadow-glass)] p-6 transition-all duration-200">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Disable {plugin.name}?</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {dependents.length} other plugin{dependents.length === 1 ? '' : 's'} depend on it and will be disabled
              too:
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {dependents.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] px-3 py-2 text-sm text-foreground"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500/70 dark:text-amber-400/70 shrink-0" />
              {d.name}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center rounded-lg bg-amber-500/15 border border-amber-500/20 px-3.5 py-2 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
          >
            Disable {dependents.length + 1} plugin{dependents.length + 1 === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
};
const STATUS_FILTERS: Array<{ id: 'all' | 'enabled' | 'disabled' | 'error'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'error', label: 'Errors' },
]

// ── Plugin Settings Page ──────────────────────────────────────────────────────

export const SettingsPluginsPage = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [toggling, setToggling] = useState<Record<string, boolean>>({})

  const [configuringPlugin, setConfiguringPlugin] = useState<string | null>(null)
  const [configKey, setConfigKey] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'error'>('all')

  // Gate: don't call plugin IPC until main process registers handlers.
  const [ipcReady, setIpcReady] = useState(false)
  useEffect(() => {
    const api = (window as Window).desktopAPI as { onMainIpcReady?: () => Promise<void> } | undefined
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) setIpcReady(true)
    }, 3000)
    Promise.resolve(api?.onMainIpcReady?.()).finally(() => {
      clearTimeout(timeout)
      if (!cancelled) setIpcReady(true)
    })
    return () => {
      cancelled = true
    }
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

  useEffect(() => {
    if (ipcReady) fetchPlugins()
  }, [fetchPlugins, ipcReady])

  // Detail panel — open via root modal system
  useEffect(() => {
    if (!configuringPlugin) return

    const plugin = plugins.find((p) => p.id === configuringPlugin)
    if (!plugin || !api) return

    let close: () => void = () => {}
    close = openModal(
      <PluginDetailPanel
        key={configKey}
        plugin={plugin}
        api={api}
        allPlugins={plugins}
        onOpenPlugin={(id) => setConfiguringPlugin(id)}
        onClose={() => {
          setConfiguringPlugin(null)
          close()
        }}
        onConfigSaved={() => {
          fetchPlugins()
          setConfigKey((k) => k + 1)
        }}
      />,
    )
    // Close the previous instance before re-opening (e.g. after config save).
    return close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuringPlugin, configKey])

  const handleToggle = useCallback(
    async (plugin: PluginInfo) => {
      if (!api) return
      const id = plugin.id
      setToggling((prev) => ({ ...prev, [id]: true }))
      try {
        if (plugin.status === 'enabled') {
          const dependents = getDependents(id, plugins)
          if (dependents.length > 0) {
            const proceed = await new Promise<boolean>((resolve) => {
              let close: () => void = () => {}
              close = openModal(
                <DependencyWarningModal
                  plugin={plugin}
                  dependents={dependents}
                  onCancel={() => {
                    close()
                    resolve(false)
                  }}
                  onConfirm={() => {
                    close()
                    resolve(true)
                  }}
                />,
              )
            })
            if (!proceed) return
          }
          const affected = await api.disable(id)
          setPlugins((prev) => prev.map((p) => (affected.includes(p.id) ? { ...p, status: 'disabled' as const } : p)))
        } else {
          await api.enable(id)
          setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'enabled' as const } : p)))
        }
      } catch (err: any) {
        console.error(`Failed to toggle plugin ${id}:`, err)
        setError(`Failed to toggle plugin: ${err?.message || 'Unknown error'}`)
      } finally {
        setToggling((prev) => ({ ...prev, [id]: false }))
      }
    },
    [api, plugins, openModal],
  )

  const openConfig = useCallback(
    (plugin: PluginInfo) => {
      if (!api) return
      setConfiguringPlugin(plugin.id)
    },
    [api],
  )

  const query = searchQuery.toLowerCase().trim()
  const statusOrder: Record<string, number> = { enabled: 0, disabled: 1, error: 2 }

  const installedPlugins = [...plugins]
    .filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query),
    )
    .sort((a, b) => {
      const s = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
      return s !== 0 ? s : a.name.localeCompare(b.name)
    })

  const hasAnyInstalled = installedPlugins.length > 0

  // ── Installed: status filter + category grouping ──

  const visibleInstalled = installedPlugins.filter((p) => {
    if (statusFilter === 'enabled') return p.status === 'enabled'
    if (statusFilter === 'disabled') return p.status === 'disabled' || p.status === 'installed'
    if (statusFilter === 'error') return p.status === 'error'
    return true
  })

  const groupedByCategory = new Map<string, PluginInfo[]>()
  for (const p of visibleInstalled) {
    const cat = getPluginCategory(p)
    if (!groupedByCategory.has(cat)) groupedByCategory.set(cat, [])
    groupedByCategory.get(cat)!.push(p)
  }
  const groupedOrder = CATEGORY_ORDER.filter((c) => groupedByCategory.has(c))
  for (const cat of groupedByCategory.keys()) {
    if (!groupedOrder.includes(cat)) groupedOrder.push(cat)
  }
  const installedGroups = groupedOrder.map((c) => [c, groupedByCategory.get(c)!] as const)

  const filteredCounts = {
    enabled: installedPlugins.filter((p) => p.status === 'enabled').length,
    disabled: installedPlugins.filter((p) => p.status === 'disabled' || p.status === 'installed').length,
    error: installedPlugins.filter((p) => p.status === 'error').length,
  }

  // ── Browser mode fallback ──

  if (!api) {
    return (
      <SettingsLockedState
        title="Plugins"
        description="Plugins are only available in the Otix desktop app."
        icon={Puzzle}
        action={<span />}
      />
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <HeroBanner plugins={plugins} />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  // ── Main content ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <HeroBanner plugins={plugins} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins..."
            className="w-full h-10 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl p-4 bg-destructive/10 border border-destructive/20">
          <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(null)
              fetchPlugins()
            }}
            className="shrink-0 inline-flex items-center gap-1 h-8 rounded-lg px-3 text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {hasAnyInstalled ? (
        <section>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <SectionHeader
              title="Installed Plugins"
              description={`${installedPlugins.length} installed`}
            />

            <div className="ml-auto flex items-center gap-1 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] p-1">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer',
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f.label}
                    {f.id !== 'all' && filteredCounts[f.id] > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px text-[10px] font-semibold',
                          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-foreground/10 text-muted-foreground',
                        )}
                      >
                        {filteredCounts[f.id] > 99 ? '99+' : filteredCounts[f.id]}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {visibleInstalled.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl py-14 text-center">
              <Puzzle className="h-9 w-9 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No plugins match your search or filters</p>
              {(statusFilter !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setStatusFilter('all')
                    setSearchQuery('')
                  }}
                  className="mt-2 text-sm text-primary hover:underline inline-flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  Show all plugins
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-7">
              {installedGroups.map(([cat, items]) => (
                <div key={cat}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h3>
                    <span className="text-[11px] text-muted-foreground/70">{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((plugin) => (
                      <InstalledPluginRow
                        key={plugin.id}
                        plugin={plugin}
                        category={getPluginCategory(plugin)}
                        onManage={() => openConfig(plugin)}
                        onToggle={() => handleToggle(plugin)}
                        toggling={toggling[plugin.id] ?? false}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Download className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {(window as { desktopAPI?: unknown }).desktopAPI
              ? 'No plugins installed'
              : 'No plugins are running on this Otix server'}
          </p>
        </div>
      )}
    </div>
  )
};
