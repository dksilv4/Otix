import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ChevronRight, ExternalLink, Gamepad2, Layers, Loader2, LogOut,
  Network, Puzzle, RefreshCw, Settings, ShieldCheck, X,
} from 'lucide-react'
import { SlidePanel } from '@/lib/modals'
import { openExternal } from '@/lib/utils/open-external'
import { batchMatchAndSave } from '@/features/plugins/utils/matching'
import { getPluginIcon, getPermissionLabel, type PluginAPI } from '@/features/plugins/api'
import { PluginForm } from '@/features/plugins/components/PluginForm'
import { Alert, Badge, Button } from '@/features/plugins/ui'
import { cn } from '@/lib/utils'
import type { PluginInfo, PluginStatus } from '@/features/plugins/types/plugins'

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', icon: Puzzle },
  { id: 'configure', label: 'Configure', icon: Settings },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'depends', label: 'Depends on', icon: Network },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Connection section (OAuth + scan) ─────────────────────────────────────────

function PluginConnectionSection({ plugin, api }: { plugin: PluginInfo; api: PluginAPI }) {
  const [state, setState] = useState<{
    loading: boolean
    connected?: boolean
    displayName?: string
    message?: string
    scanTotal?: number
    scanMatched?: number
  }>({ loading: true })
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const desktopAPI = (window as any).desktopAPI

  // Only OAuth connectors (e.g. Battle.net, Epic) expose auth.getLoginUrl; the
  // sign-in card is meaningless for key/local-only plugins, so probe for it.
  const [supportsAuth, setSupportsAuth] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api.callData(plugin.id, 'auth.getLoginUrl')
      .then((r) => { if (!cancelled) setSupportsAuth(!!(r as { url?: string } | null)?.url) })
      .catch(() => { if (!cancelled) setSupportsAuth(false) })
    return () => { cancelled = true }
  }, [plugin.id, api])

  const checkStatus = async () => {
    try {
      const s = (await api.getStatus(plugin.id)) as any
      if (s && !s.error) {
        setState({
          loading: false,
          connected: !!s.connected || !!s.authenticated,
          displayName: s.displayName,
          message: s.message,
        })
      } else {
        setState({ loading: false, connected: false, message: s?.error || s?.message })
      }
    } catch {
      setState({ loading: false, connected: false })
    }
  }

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin.id, api])

  const handleLogin = async () => {
    setActionLoading('login')
    try {
      const urlResult = (await api.callData(plugin.id, 'auth.getLoginUrl')) as any
      if (!urlResult?.url) {
        setState((prev) => ({ ...prev, message: 'Failed to get login URL' }))
        return
      }
      const redirectPattern = urlResult.redirectPattern || 'id/api/redirect'
      const options = urlResult.tokenExtraction ? { tokenExtraction: urlResult.tokenExtraction } : undefined
      const winResult = await desktopAPI?.plugin?.openOAuthWindow(urlResult.url, redirectPattern, options)
      if (!winResult?.success || !winResult?.code) {
        if (!winResult?.success) setState((prev) => ({ ...prev, message: winResult?.error || 'Login cancelled' }))
        return
      }
      const cbRes = (await api.callData(plugin.id, 'auth.handleCallback', winResult.code)) as any
      if (cbRes?.success) {
        await checkStatus()
        if (cbRes.scanResult?.games?.length) {
          await batchMatchAndSave(cbRes.scanResult.games, desktopAPI)
        }
      } else {
        setState((prev) => ({ ...prev, message: cbRes?.error || 'Authorization failed' }))
      }
    } catch (err) {
      setState((prev) => ({ ...prev, message: err instanceof Error ? err.message : 'Login failed' }))
    } finally {
      setActionLoading(null)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanProgress({ phase: 'scanning', current: 0, total: 0 })
    try {
      const scanPromise = api.callData(plugin.id, 'scan')
      const pollInterval = setInterval(async () => {
        try {
          const prog = (await api.callData(plugin.id, 'scan.status')) as any
          if (prog?.phase && prog.phase !== 'idle') {
            setScanProgress({ phase: prog.phase, current: prog.current || 0, total: prog.total || 0 })
          }
        } catch { /* polling race */ }
      }, 1000)

      const result = (await scanPromise) as any
      clearInterval(pollInterval)

      if (result?.success && result.games?.length) {
        const outcome = await batchMatchAndSave(result.games, desktopAPI)
        setState((prev) => ({ ...prev, scanTotal: result.total, scanMatched: outcome.matched }))
      } else {
        const errorMsg = result?.error
          ? result.error === 'not_authenticated'
            ? `Not signed in to ${plugin.name}. Sign in first.`
            : result.error === 'no_account_id'
              ? `No ${plugin.name} account — sign in to scan your library.`
              : `Scan failed: ${result.error}`
          : 'No games found in library'
        setState((prev) => ({ ...prev, message: errorMsg }))
      }
    } catch (err) {
      console.error('[PluginDetail] scan failed:', err)
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }

  const handleLogout = async () => {
    setActionLoading('logout')
    try {
      await api.callData(plugin.id, 'auth.logout')
      setState({ loading: false, connected: false })
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  if (supportsAuth === null || !supportsAuth) return null

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking connection...
      </div>
    )
  }

  const phaseLabel = (phase: string) =>
    phase === 'library' ? 'Fetching library...'
      : phase === 'enriching' ? `Enriching (${scanProgress?.current ?? 0}/${scanProgress?.total ?? 0})`
        : phase === 'local-scan' ? 'Scanning local installs...'
          : phase === 'merging' ? 'Merging results...'
            : 'Scanning...'

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gamepad2 className="h-4 w-4" />
        </div>

        {!state.connected ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{plugin.name}</p>
              <p className="text-xs text-white/40">{state.message || 'Sign in to sync your game library'}</p>
            </div>
            <Button size="sm" onClick={handleLogin} loading={actionLoading === 'login'}>
              <Gamepad2 className="h-3.5 w-3.5" />
              {actionLoading === 'login' ? 'Opening...' : 'Sign In'}
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{state.displayName || 'Connected'}</p>
                <Badge tone="success" dot>Connected</Badge>
              </div>
              {state.scanTotal != null && (
                <p className="mt-0.5 text-xs text-white/40">
                  {state.scanTotal} items{state.scanMatched != null ? ` · ${state.scanMatched} matched` : ''}
                </p>
              )}
              {scanProgress && scanProgress.phase !== 'done' && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {phaseLabel(scanProgress.phase)}
                  </div>
                  {scanProgress.total > 0 && (
                    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(100, (scanProgress.current / scanProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={handleScan} loading={scanning} disabled={!!actionLoading}>
                <RefreshCw className="h-3.5 w-3.5" />
                {scanning ? 'Scanning...' : 'Scan'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleLogout}
                loading={actionLoading === 'logout'}
                className="text-white/40 hover:text-red-400"
                title="Disconnect"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Overview content ──────────────────────────────────────────────────────────

function OverviewContent({ plugin, api }: { plugin: PluginInfo; api: PluginAPI }) {
  const hasSlots = (plugin.manifest.slots?.length ?? 0) > 0

  return (
    <div className="space-y-4">
      {plugin.description && (
        <p className="text-sm leading-relaxed text-white/70">{plugin.description}</p>
      )}

      {hasSlots && <PluginConnectionSection plugin={plugin} api={api} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
            <Layers className="h-3.5 w-3.5" /> Version
          </div>
          <p className="mt-1 text-sm font-medium text-white">v{plugin.version}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
            <ShieldCheck className="h-3.5 w-3.5" /> Status
          </div>
          <p className="mt-1 text-sm font-medium text-white capitalize">{plugin.status}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/30">Repository</span>
          <button
            onClick={() => openExternal(plugin.repository)}
            className="flex items-center gap-1 truncate text-xs text-primary/80 hover:text-primary"
          >
            {plugin.repository.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '')}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-xs text-white/30">Author</span>
          <span className="text-xs text-white/60">{plugin.author}</span>
        </div>
      </div>

      {(plugin.manifest.services?.length || plugin.manifest.depends_on?.length) && (
        <div className="space-y-2">
          {plugin.manifest.services && plugin.manifest.services.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-white/30 mr-1">Services</span>
              {plugin.manifest.services.map((s) => {
                const type = typeof s === 'string' ? s : s.type
                const protocol = typeof s === 'string' ? undefined : s.protocol
                return (
                  <Badge key={protocol ? `${type}:${protocol}` : type} tone="info">
                    {protocol ? `${type} · ${protocol}` : type}
                  </Badge>
                )
              })}
            </div>
          )}
          {plugin.manifest.depends_on && plugin.manifest.depends_on.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-white/30 mr-1">Depends on</span>
              {plugin.manifest.depends_on.map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Configure content ─────────────────────────────────────────────────────────

function ConfigureContent({
  plugin,
  api,
  onConfigSaved,
}: {
  plugin: PluginInfo
  api: PluginAPI
  onConfigSaved?: () => void
}) {
  const configFields = useMemo(() => plugin.manifest.config || {}, [plugin.manifest.config])
  const hasConfig = Object.keys(configFields).length > 0
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const hasTestable = Object.values(configFields).some(
    (f) => f.type === 'secret' || f.type === 'string',
  )

  useEffect(() => {
    let cancelled = false
    api.getConfig(plugin.id).then((cfg) => {
      if (cancelled) return
      setValues(cfg || {})
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [plugin.id, api])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      for (const [key, value] of Object.entries(values)) {
        const field = configFields[key]
        if (!field) continue
        if (field.type === 'instances') continue // instances are managed via the plugin data API
        await api.setConfig(plugin.id, key, value)
      }
      onConfigSaved?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.testConfig(plugin.id, values))
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!hasConfig) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Settings className="h-8 w-8 text-white/20 mb-3" />
        <p className="text-sm text-white/40">No configurable settings for this plugin.</p>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {saveError && (
        <Alert tone="error" title="Failed to save">{saveError}</Alert>
      )}
      <PluginForm
        fields={configFields}
        values={values}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        pluginId={plugin.id}
        api={api}
        onTest={hasTestable ? handleTest : undefined}
        testState={{ loading: testing, result: testResult }}
        onSubmit={handleSave}
        submitting={saving}
        submitLabel="Save Changes"
      />
    </div>
  )
}

// ── Permissions content ───────────────────────────────────────────────────────

function PermissionsContent({ plugin }: { plugin: PluginInfo }) {
  const perms = plugin.manifest.permissions || []
  if (perms.length === 0) {
    return <p className="text-sm text-white/40">This plugin requests no permissions.</p>
  }
  return (
    <div className="space-y-2">
      {perms.map((perm) => (
        <div key={perm} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-white/30" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80">{getPermissionLabel(perm)}</p>
            <p className="font-mono text-[11px] text-white/25">{perm}</p>
          </div>
          <Badge tone="success" dot>Granted</Badge>
        </div>
      ))}
    </div>
  )
}

// ── Activity content ──────────────────────────────────────────────────────────

function ActivityContent({ plugin, api }: { plugin: PluginInfo; api: PluginAPI }) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      setStatus((await api.getStatus(plugin.id)) as Record<string, unknown> | null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin.id, api])

  const rows = status
    ? Object.entries(status).filter(([key]) => key !== 'last_sync' && key !== 'recent_syncs' && key !== 'error')
    : []
  const lastSync = status?.last_sync as { title?: string; direction?: string; synced_at?: string } | undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone={plugin.status === 'error' ? 'danger' : plugin.status === 'enabled' ? 'success' : 'default'} dot>
            {plugin.status}
          </Badge>
          {status?.error ? <span className="text-xs text-red-400">{String(status.error)}</span> : null}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {lastSync && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
            <RefreshCw className="h-3.5 w-3.5" /> Last sync
          </div>
          <p className="mt-1.5 text-sm text-white/80">
            {lastSync.title} ({lastSync.direction || 'sync'})
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            {new Date(lastSync.synced_at ?? Date.now()).toLocaleString()}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-2.5 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
            <Activity className="h-3.5 w-3.5" /> Status fields
          </div>
          <div className="space-y-2">
            {rows.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className="capitalize text-white/50">{key.replace(/_/g, ' ')}</span>
                <span className="max-w-[60%] truncate font-mono text-xs text-white/70">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && !lastSync && (
        <div className="flex flex-col items-center py-10 text-center">
          <Activity className="h-8 w-8 text-white/20 mb-3" />
          <p className="text-sm text-white/40">No activity recorded for this plugin.</p>
        </div>
      )}
    </div>
  )
}

// ── Dependencies content ────────────────────────────────────────────────────────

type DepEntry = {
  id: string
  name: string
  installed: boolean
  status?: PluginStatus
}

function DepRow({ dep, clickable, onOpenPlugin }: {
  dep: DepEntry
  clickable: boolean
  onOpenPlugin?: (id: string) => void
}) {
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onOpenPlugin?.(dep.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors',
        clickable ? 'hover:bg-white/[0.05]' : 'cursor-default',
      )}
    >
      <Network className="h-4 w-4 shrink-0 text-white/30" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/80">{dep.name}</p>
        <p className="truncate font-mono text-[11px] text-white/25">{dep.id}</p>
      </div>
      {dep.installed ? (
        <Badge tone={dep.status === 'enabled' ? 'success' : dep.status === 'error' ? 'danger' : 'default'} dot>
          {dep.status}
        </Badge>
      ) : (
        <Badge tone="default">not installed</Badge>
      )}
      {clickable && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" />}
    </button>
  )
}

function DependenciesContent({ plugin, allPlugins, onOpenPlugin }: {
  plugin: PluginInfo
  allPlugins: PluginInfo[]
  onOpenPlugin?: (id: string) => void
}) {
  const nameById = new Map(allPlugins.map((p) => [p.id, p.name]))
  const statusById = new Map(allPlugins.map((p) => [p.id, p.status]))

  const requires: DepEntry[] = (plugin.manifest.depends_on ?? []).map((id) => ({
    id,
    name: nameById.get(id) || id,
    installed: nameById.has(id),
    status: statusById.get(id),
  }))

  const dependents: DepEntry[] = allPlugins
    .filter((p) => p.manifest.depends_on?.includes(plugin.id))
    .map((p) => ({ id: p.id, name: p.name, installed: true, status: p.status }))

  if (requires.length === 0 && dependents.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Network className="h-8 w-8 text-white/20 mb-3" />
        <p className="text-sm text-white/40">No plugin dependencies declared.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {requires.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/35">Requires</p>
          <div className="space-y-2">
            {requires.map((dep) => (
              <DepRow key={dep.id} dep={dep} clickable={dep.installed} onOpenPlugin={onOpenPlugin} />
            ))}
          </div>
        </div>
      )}
      {dependents.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/35">Used by</p>
          <div className="space-y-2">
            {dependents.map((dep) => (
              <DepRow key={dep.id} dep={dep} clickable onOpenPlugin={onOpenPlugin} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

export function PluginDetailPanel({
  plugin,
  api,
  allPlugins,
  onOpenPlugin,
  onClose,
  onConfigSaved,
  isExiting,
}: {
  plugin: PluginInfo
  api: PluginAPI
  allPlugins?: PluginInfo[]
  onOpenPlugin?: (id: string) => void
  onClose: () => void
  onConfigSaved?: () => void
  isExiting?: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const Icon = getPluginIcon(plugin.manifest.icon)

  return (
    <SlidePanel onClose={onClose} isExiting={isExiting}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-white">{plugin.name}</h2>
          <p className="text-[11px] text-white/40">{plugin.author} &middot; v{plugin.version}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-white/[0.06] px-3 pt-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-white'
                  : 'border-transparent text-white/40 hover:text-white/70',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'overview' && <OverviewContent plugin={plugin} api={api} />}
        {activeTab === 'configure' && <ConfigureContent plugin={plugin} api={api} onConfigSaved={onConfigSaved} />}
        {activeTab === 'permissions' && <PermissionsContent plugin={plugin} />}
        {activeTab === 'activity' && <ActivityContent plugin={plugin} api={api} />}
        {activeTab === 'depends' && (
          <DependenciesContent plugin={plugin} allPlugins={allPlugins ?? []} onOpenPlugin={onOpenPlugin} />
        )}
      </div>
    </SlidePanel>
  )
}
