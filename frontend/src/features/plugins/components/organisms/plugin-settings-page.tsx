// Renders a plugin settings tab declared in the manifest (settings.tabs).
// Sections can either render the owning plugin's `manifest.config` as an
// auto-generated form (`config: true`) or a dynamic slot (`section.slot`).
//
// Above the section content, provider auth cards (Spotify/Google) surface the
// plugin's connection state with per-provider sign-in buttons and inline
// credential inputs for the manifest fields grouped under each provider.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, Check, ChevronDown, ChevronUp, Loader2, PlugZap, RefreshCw, Search, WifiOff, X, XCircle } from 'lucide-react'
import {
  SlotRenderer,
  useSlotData,
  type PluginSettingsSection,
  type PluginSettingsTab,
} from '@/features/_config/slots'
import { getPluginAPI, type PluginAPI } from '@/features/plugins/api'
import { useModal } from '@/lib/modals'
import { SlidePanel } from '@/lib/modals/slide-panel'
import type { PluginConfigField, PluginInfo } from '@/features/plugins/types/plugins'
import { PluginForm } from '../PluginForm'
import { Alert, Badge, Button, EmptyState, Input, Select, Spinner } from '@/features/plugins/ui'
import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'

interface PluginSettingsPageProps {
  tab?: PluginSettingsTab
}

// ── Provider auth cards ───────────────────────────────────────────────────────

interface ProviderDef {
  id: 'spotify' | 'google' | 'plex'
  label: string
  statusKey: string
  credsKey?: string
  sourceKey?: string
  errorKey?: string
}

const PROVIDERS: ProviderDef[] = [
  { id: 'spotify', label: 'Spotify', statusKey: 'spotify', credsKey: 'spotify_creds' },
  { id: 'google', label: 'Google', statusKey: 'google', sourceKey: 'google_source', errorKey: 'google_error' },
  { id: 'plex', label: 'Plex', statusKey: 'plex', errorKey: 'plex_error' },
]

/** Manifest config fields that belong to a provider card (by section or key prefix). */
function providerFields(plugin: PluginInfo | null, providerId: string): Record<string, PluginConfigField> {
  const fields = plugin?.manifest.config
  if (!fields) return {}
  const out: Record<string, PluginConfigField> = {}
  for (const [key, field] of Object.entries(fields)) {
    if ((field.section || '').toLowerCase() === providerId || key.startsWith(providerId + '_')) {
      out[key] = field
    }
  }
  return out
}

/** A provider card is only shown when the plugin actually integrates it:
 *  it declares config fields for the provider, or its status reports a connection. */
function isProviderRelevant(plugin: PluginInfo | null, status: Record<string, any> | null, provider: ProviderDef): boolean {
  if (Object.keys(providerFields(plugin, provider.id)).length > 0) return true
  if (!status) return false
  if (status[provider.statusKey]) return true
  if (provider.credsKey && status[provider.credsKey]) return true
  if (provider.sourceKey && status[provider.sourceKey] && status[provider.sourceKey] !== 'not connected') return true
  if (provider.errorKey && status[provider.errorKey]) return true
  return false
}

/** Keys owned by a provider card — excluded from the general config form. */
function providerManagedKeys(plugin: PluginInfo | null): string[] {
  const fields = plugin?.manifest.config
  if (!fields) return []
  return Object.entries(fields)
    .filter(([key, field]) => {
      const s = (field.section || '').toLowerCase()
      return s === 'spotify' || s === 'google' || s === 'plex' || key.startsWith('spotify_') || key.startsWith('google_') || key.startsWith('plex_')
    })
    .map(([key]) => key)
}

function ConnectionsCards({ pluginId }: { pluginId: string }) {
  const api = getPluginAPI()
  const [status, setStatus] = useState<Record<string, any> | null>(null)
  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const [s, info, cfg] = await Promise.all([api.getStatus(pluginId), api.get(pluginId), api.getConfig(pluginId)])
      setStatus(s)
      setPlugin(info)
      setConfig(cfg || {})
    } catch {
      // Render cards with whatever loaded; individual cards handle errors.
    } finally {
      setLoading(false)
    }
  }, [api, pluginId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveConfig = useCallback(
    async (key: string, value: unknown) => {
      if (!api) return
      await api.setConfig(pluginId, key, value)
      setConfig((prev) => ({ ...prev, [key]: value }))
    },
    [api, pluginId],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
      </div>
    )
  }

  if (!status) {
    return (
      <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-white/40">
        Couldn&apos;t load connection status for this plugin.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {PROVIDERS.filter((p) => isProviderRelevant(plugin, status, p)).map((p) => (
        <AuthCard
          key={p.id}
          provider={p}
          pluginId={pluginId}
          api={api}
          status={status}
          fields={providerFields(plugin, p.id)}
          config={config}
          onConfigSave={saveConfig}
          onConnected={refresh}
        />
      ))}
    </div>
  )
}

function AuthCard({
  provider,
  pluginId,
  api,
  status,
  fields,
  config,
  onConfigSave,
  onConnected,
}: {
  provider: ProviderDef
  pluginId: string
  api: PluginAPI | null
  status: Record<string, any> | null
  fields: Record<string, PluginConfigField>
  config: Record<string, unknown>
  onConfigSave: (key: string, value: unknown) => Promise<void>
  onConnected: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showCreds, setShowCreds] = useState(false)

  const raw = status?.[provider.statusKey]
  const connected = raw === 'connected'
  const creds = provider.credsKey ? status?.[provider.credsKey] : undefined
  const source = provider.sourceKey ? status?.[provider.sourceKey] : undefined
  const providerError = provider.errorKey ? status?.[provider.errorKey] : undefined
  const hasFields = Object.keys(fields).length > 0

  const handleSignIn = async () => {
    if (!api) return
    setBusy('signin')
    setError(null)
    setTestResult(null)
    try {
      const urlResult = (await api.callData(pluginId, 'auth.getLoginUrl', provider.id)) as any
      if (!urlResult?.url) {
        setError(urlResult?.error || 'Failed to get login URL')
        return
      }
      const redirectPattern = urlResult.redirectPattern || 'id/api/redirect'
      const options = urlResult.tokenExtraction ? { tokenExtraction: urlResult.tokenExtraction } : undefined
      const desktopAPI = (window as any).desktopAPI
      const winResult = await desktopAPI?.plugin?.openOAuthWindow(urlResult.url, redirectPattern, options)
      if (!winResult?.success || !winResult?.code) {
        if (!winResult?.success) setError(winResult?.error || 'Sign in cancelled')
        return
      }
      const cbRes = (await api.callData(pluginId, 'auth.handleCallback', winResult.code)) as any
      if (cbRes?.success) {
        await onConnected()
      } else {
        setError(cbRes?.error || 'Authorization failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async () => {
    if (!api) return
    setBusy('test')
    setError(null)
    setTestResult(null)
    try {
      const result = await api.testConfig(pluginId, { ...config })
      setTestResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-testid={`auth-card-${provider.id}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2">
        {connected ? <Check className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-white/30" />}
        <span className="text-sm font-semibold text-white">{provider.label}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium',
            connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[0.06] text-white/50',
          )}
        >
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {(creds || (source && source !== 'not connected')) && (
        <div className="mt-3 space-y-1 text-xs">
          {creds && (
            <div className="flex items-center justify-between">
              <span className="text-white/40">Credentials</span>
              <span
                className={cn(
                  creds === 'valid' ? 'text-emerald-300' : creds === 'rejected' ? 'text-red-400' : 'text-white/60',
                )}
              >
                {creds}
              </span>
            </div>
          )}
          {source && source !== 'not connected' && (
            <div className="flex items-center justify-between">
              <span className="text-white/40">Connected via</span>
              <span className="text-white/80">{source}</span>
            </div>
          )}
        </div>
      )}
      {providerError && providerError !== 'Google not linked' && (
        <p className="mt-2 text-xs text-amber-400/90">{providerError}</p>
      )}

      {hasFields && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowCreds((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/75"
          >
            {showCreds ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showCreds ? 'Hide credentials' : connected ? 'Manage credentials' : 'Configure credentials'}
          </button>
          {showCreds && (
            <div className="mt-3">
              <PluginForm fields={fields} values={config} inline onChange={(key, value) => void onConfigSave(key, value)} />
            </div>
          )}
        </div>
      )}

      {testResult && (
        <p className={cn('mt-3 text-xs', testResult.success ? 'text-emerald-300' : 'text-red-400')}>{testResult.message}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {provider.id === 'spotify' && (
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={handleTest}>
            {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Test credentials
          </Button>
        )}
        {!connected && (
          <Button variant="primary" size="sm" disabled={busy !== null} onClick={handleSignIn}>
            {busy === 'signin' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            Sign in to {provider.label}
          </Button>
        )}
        {connected && (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={handleSignIn} title="Reconnect / refresh tokens">
            <RefreshCw className="h-3.5 w-3.5" />
            Reconnect
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Sync card ─────────────────────────────────────────────────────────────────
// Drives a plugin's `sync.now` / `sync.status` data methods (SyncPlay, Radarr,
// …): a "Sync now" button that shows live progress while running, a summary of
// the completed run, and the last-sync result. Adapts to the status shape the
// plugin returns (playlist/track fields vs. movie-import fields).

interface SyncStatus {
  phase?: string
  current?: number
  total?: number
  playlistTitle?: string
  track?: number
  trackTotal?: number
  lastTrack?: string
  /** SyncPlay: per-playlist result of the most recent run. */
  last?: LastSyncInfo | null
  /** Radarr: import summary of the most recent run. */
  lastSync?: LastSyncInfo | null
  /** Radarr: number of configured instances (0 disables the Sync button). */
  instance_count?: number
  /** Radarr: enabled instances, so the UI can sync each one separately or all at once. */
  instances?: Array<{ id: string; name: string }>
}

interface LastSyncInfo {
  at?: string
  lastSyncAt?: string | number
  added?: number
  imported?: number
  skipped?: number
  pruned?: number
  unmatched?: number
  failed?: number
  errors?: number | unknown[]
}

interface SyncItem {
  ok?: boolean
  title?: string
  key?: string
  upToDate?: boolean
  added?: number
  skipped?: number
  pruned?: number
  unmatched?: unknown[]
  errors?: string[]
  error?: string
}

function SyncCard({ pluginId }: { pluginId: string }) {
  const api = getPluginAPI()
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [items, setItems] = useState<SyncItem[] | null>(null)
  const [summary, setSummary] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refreshStatus = useCallback(async () => {
    if (!api) return
    try {
      setStatus((await api.callData(pluginId, 'sync.status')) as SyncStatus)
    } catch {
      /* poll races are fine */
    }
  }, [api, pluginId])

  const running = syncing || status?.phase === 'running' || status?.phase === 'syncing'
  const paused = status?.paused || summary?.paused

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Keep progress live while a sync is active — covers the user-triggered blocking
  // call and background/auto syncs that are already running when the page opens.
  useEffect(() => {
    if (!running) return
    const id = setInterval(refreshStatus, 1000)
    return () => clearInterval(id)
  }, [running, refreshStatus])

  const handleSync = async (instanceId?: string) => {
    if (!api) return
    setSyncing(true)
    setError(null)
    setItems(null)
    setSummary(null)
    try {
      const res = (await api.callData(pluginId, 'sync.now', instanceId ? { instanceId } : undefined)) as Record<string, any>
      if (res?.alreadyRunning || (res?.success === false && /already running/i.test(res?.error || ''))) {
        // A sync (e.g. periodic auto-sync) is already in progress — show it, don't fail.
        await refreshStatus()
      } else {
        setSummary(res)
        if (Array.isArray(res?.results)) setItems(res.results)
        if (res?.success === false && res?.error && !res?.paused) setError(res.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      await refreshStatus()
      setSyncing(false)
    }
  }
  const hasInstances = (status?.instance_count ?? 1) > 0
  const last = status?.last || status?.lastSync

  const total = status?.total ?? 0
  const pct = total > 0 ? Math.min(100, Math.round(((status?.current ?? 0) / total) * 100)) : 0

  const lastChips: string[] = []
  if (last) {
    const imported = last.imported ?? last.added
    if (imported !== undefined) lastChips.push(`${imported} ${last.imported !== undefined ? 'imported' : 'added'}`)
    if (last.skipped !== undefined) lastChips.push(`${last.skipped} skipped`)
    if (last.pruned !== undefined) lastChips.push(`${last.pruned} pruned`)
    if (last.failed !== undefined) lastChips.push(`${last.failed} failed`)
    if (last.unmatched !== undefined) lastChips.push(`${last.unmatched} unmatched`)
    const errCount = Array.isArray(last.errors) ? last.errors.length : last.errors
    if (errCount) lastChips.push(`${errCount} error(s)`)
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-white">Sync to Otix</h3>
        {(status?.instances?.length ?? 0) > 1 ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <Button size="sm" variant="outline" disabled={running || syncing || !hasInstances} onClick={() => handleSync(undefined)}>
              {syncing || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync all
            </Button>
            {status.instances?.map((inst) => (
              <Button
                key={inst.id}
                size="sm"
                variant="outline"
                disabled={running || syncing || !hasInstances}
                onClick={() => handleSync(inst.id)}
                title={`Sync ${inst.name}`}
              >
                {syncing || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {inst.name}
              </Button>
            ))}
          </div>
        ) : (
          <Button size="sm" disabled={running || syncing || !hasInstances} onClick={() => handleSync(undefined)} className="ml-auto">
            {syncing || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {running ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
      </div>

      {!hasInstances && !syncing && (
        <p className="mt-2 text-xs text-white/40">Add an enabled instance in the Settings section to sync.</p>
      )}

      {running && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3 text-xs">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            <span className="text-white/80">
              {status?.playlistTitle
                ? `Syncing playlist ${status.current ?? 0} of ${status.total ?? 0}`
                : `Importing ${status?.current ?? 0} of ${status?.total ?? 0}`}
            </span>
          </div>
          {status?.playlistTitle && <p className="text-white/60">→ {status.playlistTitle}</p>}
          {status?.trackTotal ? (
            <p className="text-white/50">
              Track {status.track ?? 0} of {status.trackTotal}
            </p>
          ) : null}
          {status?.lastTrack && <p className="truncate text-white/40">{status.lastTrack}</p>}
          {total > 0 && (
            <div className="pt-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] tabular-nums text-white/50">{pct}%</p>
            </div>
          )}
        </div>
      )}

      {!running && paused && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-3 text-xs text-amber-300">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            Sync paused — offline. It will resume automatically when you're back online.
            {summary?.deferred != null && summary.deferred > 0 && (
              <span className="text-white/60"> {summary.deferred} movie(s) queued.</span>
            )}
          </span>
        </div>
      )}

      {!running && summary && !paused && (
        <div className="mt-4 space-y-1.5 text-xs">
          <p className={summary.success ? 'text-emerald-300' : 'text-red-400'}>
            {summary.success ? 'Sync complete' : 'Sync failed'}
          </p>
          <div className="flex flex-wrap gap-3 text-white/60">
            {summary.imported !== undefined && <span>{summary.imported} imported</span>}
            {summary.added !== undefined && <span>{summary.added} added</span>}
            {summary.skipped !== undefined && <span>{summary.skipped} skipped</span>}
            {summary.pruned !== undefined && <span>{summary.pruned} pruned</span>}
            {summary.unmatched !== undefined && <span>{summary.unmatched} unmatched</span>}
            {summary.failed !== undefined && <span>{summary.failed} failed</span>}
            {summary.errorCount !== undefined && <span>{summary.errorCount} errors</span>}
            {Array.isArray(summary.errors) && summary.errors.length > 0 && (
              <span className="text-red-400">{summary.errors.length} error(s)</span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {items && items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((it) => (
            <div key={it.title || it.key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-white/80">{it.title || it.key}</span>
                {it.ok === false ? (
                  <span className="shrink-0 text-red-400">failed</span>
                ) : it.upToDate ? (
                  <span className="shrink-0 text-emerald-300">up to date</span>
                ) : (
                  <span className="shrink-0 text-emerald-300">done</span>
                )}
              </div>
              {it.ok !== false && !it.upToDate && (
                <div className="mt-1 flex flex-wrap gap-3 text-white/50">
                  <span>+{it.added ?? 0} added</span>
                  <span>{it.skipped ?? 0} skipped</span>
                  <span>{it.pruned ?? 0} pruned</span>
                  <span>{(it.unmatched || []).length} unmatched</span>
                </div>
              )}
              {it.ok === false && it.error && <p className="mt-1 text-red-400">{it.error}</p>}
            </div>
          ))}
        </div>
      )}

      {!paused && last && (
        <p className="mt-3 text-[11px] text-white/40">
          Last sync {last.at || last.lastSyncAt ? new Date(last.at ?? last.lastSyncAt!).toLocaleString() : 'just now'}
          {lastChips.length ? ` · ${lastChips.join(', ')}` : ''}
        </p>
      )}
    </div>
  )
}

// ── Movies (local catalog) ────────────────────────────────────────────────────
// Browses the movies the plugin synced into the shared local `media` table via
// its `movies.list` data method. Search + load-more pagination.

interface CatalogMovie {
  provider_id: string
  title: string | null
  year: number | null
  poster_url: string | null
  backdrop_url: string | null
  overview: string | null
  runtime: number | null
  rating: number | null
  status: string | null
  genres: string | null
  file_path: string | null
  source_instance: string | null
  source_instance_id: string | null
}

const MOVIES_PAGE = 100

/** Per-instance aggregate returned by the arr plugins' `movies.summary`. */
interface InstanceSummary {
  id: string
  name: string
  disabled?: boolean
  total: number
  size_on_disk: number
  downloaded: number
  downloading: number
  requested: number
  missing: number
  episodes_total?: number
  episodes_files?: number
}

/** Pill showing a synced movie's live Radarr status on the card art. */
function MovieStatusBadge({ status }: { status: string | null }) {
  if (status === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-300 bg-blue-950/75 border border-blue-500/30 backdrop-blur-md">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-blue-400 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
        </span>
        Downloading
      </span>
    )
  }
  if (status === 'downloaded') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-400 bg-emerald-950/75 border border-emerald-500/30 backdrop-blur-md">
        Downloaded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-white/50 bg-black/50 border border-white/10 backdrop-blur-md">
      Missing
    </span>
  )
}

// ── arr media detail drawer ─────────────────────────────────────────────
// Clicking a synced catalog card opens this right-hand panel. It renders the
// stored catalog row immediately, then enriches with live arr data via the
// plugin's `media.detail` method (storage on disk, quality, file/codec info,
// monitored, episode counts). When the plugin has no `media.detail` (e.g.
// Plex) or the instance is offline, it falls back to the cached row.

interface ArrDetail {
  found?: boolean
  live?: boolean
  source?: string | null
  media_type?: string | null
  provider_id?: string | null
  source_instance?: string | null
  source_instance_id?: string | null
  title?: string | null
  year?: number | null
  overview?: string | null
  poster_url?: string | null
  backdrop_url?: string | null
  genres?: string[] | null
  runtime?: number | null
  rating?: number | null
  status?: string | null
  path?: string | null
  size_on_disk?: number | null
  monitored?: boolean | null
  quality_profile?: string | null
  minimum_availability?: string | null
  added?: string | null
  series_type?: string | null
  season_count?: number | null
  episode_count?: number | null
  episode_file_count?: number | null
  percent_of_episodes?: number | null
  file?: {
    name?: string | null
    size?: number | null
    quality?: string | null
    video?: string | null
    audio?: string | null
  } | null
  error?: string | null
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`
}

function parseGenres(raw: string | null): string[] {
  if (!raw) return []
  try {
    const g = JSON.parse(raw)
    return Array.isArray(g) ? g : []
  } catch {
    return []
  }
}

function formatAdded(raw?: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function DetailStatusBadge({ status }: { status: string | null }) {
  if (status === 'downloaded') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <Check className="h-3 w-3" /> Downloaded
      </span>
    )
  }
  if (status === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" /> Downloading
      </span>
    )
  }
  if (status === 'requested') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        Requested
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/50">
      Missing
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  if (value == null || value === '' || value === false) return null
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-white/35">{label}</span>
      <span className="min-w-0 text-right text-xs text-white/80">{value}</span>
    </div>
  )
}

function ArrMediaDetailDrawer({
  pluginId,
  movie,
  onClose,
}: {
  pluginId: string
  movie: CatalogMovie
  onClose: () => void
}) {
  const api = getPluginAPI()
  const [detail, setDetail] = useState<ArrDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!api) {
      setLoading(false)
      return
    }
    api
      .callData(pluginId, 'media.detail', {
        mediaId: movie.provider_id,
        instanceId: movie.source_instance_id || undefined,
      })
      .then((res) => {
        if (cancelled) return
        setDetail(res as ArrDetail)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setDetail(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, pluginId, movie.provider_id, movie.source_instance_id])

  const title = detail?.title || movie.title || 'Unknown'
  const year = detail?.year ?? movie.year
  const poster = detail?.poster_url || movie.poster_url
  const backdrop = detail?.backdrop_url || movie.backdrop_url
  const status = detail?.status || movie.status
  const path = detail?.path || movie.file_path
  const source = detail?.source_instance || movie.source_instance
  const overview = detail?.overview || movie.overview
  const genres = detail?.genres || parseGenres(movie.genres)
  const runtime = detail?.runtime ?? movie.runtime
  const rating = detail?.rating ?? movie.rating
  const file = detail?.file

  return (
    <SlidePanel onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-white">{title}</h2>
          <p className="truncate text-[11px] text-white/40">
            {[year ? String(year) : null, source].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : detail?.found === false ? (
          <div className="py-10 text-center text-sm text-white/40">{detail.error || 'Not found on any enabled instance or in the local catalog.'}</div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="relative">
              {backdrop || poster ? (
                <>
                  <div className="relative h-36 w-full overflow-hidden rounded-2xl bg-white/5">
                    <img
                      src={backdrop || poster || ''}
                      alt={title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <DetailStatusBadge status={status} />
                    {detail?.live === false && (
                      <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white/50 backdrop-blur">
                        Cached
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <DetailStatusBadge status={status} />
                  {detail?.live === false && (
                    <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white/50">Cached</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4 py-1">
              {detail?.size_on_disk != null && <DetailRow label="Storage" value={`${formatBytes(detail.size_on_disk)} on disk`} />}
              {file?.size != null && <DetailRow label="File size" value={formatBytes(file.size)} />}
              {file?.quality && <DetailRow label="Quality" value={file.quality} />}
              {detail?.quality_profile && <DetailRow label="Quality profile" value={detail.quality_profile} />}
              {file?.video && <DetailRow label="Video" value={file.video} />}
              {file?.audio && <DetailRow label="Audio" value={file.audio} />}
              {detail?.media_type === 'show' && detail?.episode_file_count != null && (
                <DetailRow
                  label="Episodes"
                  value={`${detail.episode_file_count} / ${detail.episode_count ?? '?'}${
                    detail.percent_of_episodes != null ? ` (${Math.round(detail.percent_of_episodes)}%)` : ''
                  }`}
                />
              )}
              {detail?.season_count != null && <DetailRow label="Seasons" value={String(detail.season_count)} />}
              {detail?.series_type && (
                <DetailRow
                  label="Series type"
                  value={detail.series_type.charAt(0).toUpperCase() + detail.series_type.slice(1)}
                />
              )}
              {detail?.monitored != null && <DetailRow label="Monitored" value={detail.monitored ? 'Yes' : 'No'} />}
              {detail?.added && <DetailRow label="Added" value={formatAdded(detail.added)} />}
              {detail?.minimum_availability && <DetailRow label="Availability" value={detail.minimum_availability} />}
              {runtime != null && <DetailRow label="Runtime" value={`${runtime} min`} />}
              {rating != null && <DetailRow label="Rating" value={`${rating.toFixed(1)} / 10`} />}
              {path && (
                <DetailRow
                  label="Path"
                  value={
                    <span title={path} className="break-all font-mono text-[11px] text-white/60">
                      {path}
                    </span>
                  }
                />
              )}
              {file?.name && (
                <DetailRow
                  label="File"
                  value={
                    <span title={file.name} className="break-all font-mono text-[11px] text-white/60">
                      {file.name}
                    </span>
                  }
                />
              )}
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genres.slice(0, 8).map((g) => (
                  <span key={g} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/60">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {overview && (
              <div>
                <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/35">Overview</h3>
                <p className="text-xs leading-relaxed text-white/70">{overview}</p>
              </div>
            )}

            {!detail?.live && !detail && (
              <p className="text-[11px] text-white/35">Live details unavailable — showing cached catalog data.</p>
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  )
}

function MoviesSection({ pluginId }: { pluginId?: string }) {
  const api = getPluginAPI()
  const { openModal } = useModal()

  const openDetail = useCallback(
    (m: CatalogMovie) => {
      if (!pluginId) return
      const close = openModal(<ArrMediaDetailDrawer pluginId={pluginId} movie={m} onClose={() => close()} />)
    },
    [openModal, pluginId]
  )

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [movies, setMovies] = useState<CatalogMovie[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [instances, setInstances] = useState<Array<{ id: string; name: string }>>([])
  const [instanceFilter, setInstanceFilter] = useState('')
  const [summary, setSummary] = useState<InstanceSummary[] | null>(null)

  // Load the enabled instance list (filter dropdown) and the per-instance
  // summary strip. The summary is optional — plugins without `movies.summary`
  // (e.g. Plex) just leave the strip hidden.
  useEffect(() => {
    if (!api || !pluginId) return
    let cancelled = false
    api
      .callData(pluginId, 'sync.status')
      .then((res) => {
        const s = res as { instances?: Array<{ id: string; name: string }> } | null
        if (!cancelled && s?.instances) setInstances(s.instances)
      })
      .catch(() => {})
    api
      .callData(pluginId, 'movies.summary')
      .then((res) => {
        const s = res as { instances?: InstanceSummary[] } | null
        if (!cancelled && Array.isArray(s?.instances)) setSummary(s.instances)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api, pluginId])

  const fetchPage = useCallback(
    async (q: string, off: number, replace: boolean, instanceId?: string) => {
      if (!api || !pluginId) return
      if (replace) setLoading(true)
      else setLoadingMore(true)
      setError(null)
      try {
        const res = (await api.callData(pluginId, 'movies.list', {
          search: q || undefined,
          instanceId: instanceId || undefined,
          limit: MOVIES_PAGE,
          offset: off,
        })) as { total?: number; movies?: CatalogMovie[] }
        setTotal(res?.total ?? 0)
        setMovies((prev) =>
          replace ? res?.movies || [] : [...(prev || []), ...(res?.movies || [])],
        )
        setOffset(off)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load movies')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [api, pluginId],
  )

  // Initial load + search + instance filter — debounced, resets pagination.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      fetchPage(searchInput, 0, true, instanceFilter || undefined)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, instanceFilter, fetchPage])

  return (
    <div className="flex flex-col gap-4">
      {summary && summary.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
            Instance summary
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {summary.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setInstanceFilter((f) => (f === s.id ? '' : s.id))}
                className={cn(
                  'group shrink-0 rounded-xl border px-4 py-3 text-left transition-colors',
                  instanceFilter === s.id
                    ? 'border-white/30 bg-white/[0.07]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="max-w-[10rem] truncate text-sm font-semibold text-white">
                    {s.name}
                  </span>
                  {s.disabled && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/40">
                      disabled
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-white">{s.total}</span>
                  <span className="text-[11px] text-white/40">titles</span>
                  {s.size_on_disk > 0 && (
                    <span className="text-[11px] tabular-nums text-white/50">
                      {formatBytes(s.size_on_disk)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                    {s.downloaded} down
                  </span>
                  <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-blue-300">
                    {s.downloading} dl
                  </span>
                  <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                    {s.requested} req
                  </span>
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/50">
                    {s.missing} miss
                  </span>
                </div>
                {typeof s.episodes_total === 'number' && s.episodes_total > 0 && (
                  <div className="mt-2 text-[11px] tabular-nums text-white/50">
                    {s.episodes_files?.toLocaleString() ?? 0} / {s.episodes_total.toLocaleString()} eps
                    <span className="text-white/30">
                      {' '}
                      ({Math.round(((s.episodes_files ?? 0) / s.episodes_total) * 100)}%)
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${total > 0 ? total + ' ' : ''}local movies…`}
            aria-label="Search movies"
            className="pl-9"
          />
        </div>
        {instances.length > 1 && (
          <Select
            value={instanceFilter}
            onChange={(e) => setInstanceFilter(e.target.value)}
            options={[{ value: '', label: 'All instances' }].concat(
              instances.map((inst) => ({ value: inst.id, label: inst.name })),
            )}
            className="shrink-0"
            aria-label="Filter by instance"
          />
        )}
        {total > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-white/40">
            {movies?.length ?? 0} of {total}
          </span>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !movies ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : movies && movies.length === 0 ? (
        <EmptyState
          title={search ? `No movies match “${search}”` : 'No movies synced yet'}
          message={
            search
              ? 'Try a different title or TMDB id.'
              : 'Run a sync in the "Sync to local catalog" section to populate this list.'
          }
        />
      ) : (
        movies &&
        movies.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {movies.map((m) => (
              <div
                key={m.provider_id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openDetail(m)
                  }
                }}
                className="group relative cursor-pointer transition-transform hover:-translate-y-0.5"
              >
                <MediaCard
                  id={m.provider_id}
                  mediaType="movie"
                  title={m.title || m.provider_id}
                  posterUrl={m.poster_url}
                  backdropUrl={m.backdrop_url}
                  releaseDate={m.year ? String(m.year) : undefined}
                  avgRating={m.rating}
                  showTypeBadge={false}
                  subtitle={m.source_instance}
                  interactive={false}
                />
                <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                  <MovieStatusBadge status={m.status} />
                </div>
                <div className="pointer-events-none absolute inset-0 rounded-2xl transition-all group-hover:ring-1 group-hover:ring-white/15" />
              </div>
            ))}
          </div>
        )
      )}

      {movies && offset + movies.length < total && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={loadingMore}
            onClick={() => fetchPage(search, offset + MOVIES_PAGE, false, instanceFilter || undefined)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Requests ──────────────────────────────────────────────────────────────
// Lists every movie requested on a Radarr instance (radarr_requests) — via the
// detail-page request button or watchlist auto-request — newest first.

interface CatalogRequest {
  tmdb_id: string
  title: string | null
  instance_id: string | null
  instance_name: string | null
  status: 'requested' | 'exists' | 'error'
  source: string | null
  already_exists: number
  error: string | null
  requested_at: number
  poster_url: string | null
  backdrop_url: string | null
}

const REQUESTS_PAGE = 50

function RequestsSection({ pluginId }: { pluginId?: string }) {
  const api = getPluginAPI()
  const [searchInput, setSearchInput] = useState('')
  const [requests, setRequests] = useState<CatalogRequest[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (q: string, off: number, replace: boolean) => {
      if (!api || !pluginId) return
      if (replace) setLoading(true)
      else setLoadingMore(true)
      setError(null)
      try {
        const res = (await api.callData(pluginId, 'requests.list', {
          search: q || undefined,
          limit: REQUESTS_PAGE,
          offset: off,
        })) as { total?: number; requests?: CatalogRequest[] }
        setTotal(res?.total ?? 0)
        setRequests((prev) =>
          replace ? res?.requests || [] : [...(prev || []), ...(res?.requests || [])],
        )
        setOffset(off)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load requests')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [api, pluginId],
  )

  useEffect(() => {
    fetchPage('', 0, true)
  }, [fetchPage])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchPage(searchInput, 0, true)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, fetchPage])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${total > 0 ? total + ' ' : ''}requests…`}
            aria-label="Search requests"
            className="pl-9"
          />
        </div>
        {total > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-white/40">
            {requests?.length ?? 0} of {total}
          </span>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !requests ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : requests && requests.length === 0 ? (
        <EmptyState
          title={searchInput ? `No requests match “${searchInput}”` : 'No movies requested yet'}
          message={
            searchInput
              ? 'Try a different title or TMDB id.'
              : 'Request a movie from its detail page, or add one to your watchlist, to see it here.'
          }
        />
      ) : (
        requests &&
        requests.length > 0 && (
          <div className="flex flex-col gap-2">
            {requests.map((r) => {
              const isExists = r.status === 'exists' || r.already_exists === 1
              const isError = r.status === 'error'
              return (
                <div
                  key={r.tmdb_id + ':' + r.instance_id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="h-12 w-8 shrink-0 overflow-hidden rounded-md bg-white/[0.04]">
                    {r.poster_url ? (
                      <img
                        src={r.poster_url}
                        alt={r.title || r.tmdb_id}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/[0.06] to-transparent">
                        <span className="text-xs font-semibold text-white/15">
                          {(r.title || r.tmdb_id).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white/85">{r.title || r.tmdb_id}</p>
                    <p className="mt-0.5 truncate text-[11px] text-white/40">
                      TMDB {r.tmdb_id}
                      {r.instance_name ? ` · ${r.instance_name}` : ''}
                      {' · '}
                      {new Date(r.requested_at).toLocaleString()}
                    </p>
                    {isError && r.error && (
                      <p className="mt-0.5 truncate text-[11px] text-red-400/80">{r.error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.source === 'watchlist' && <Badge>watchlist</Badge>}
                    {isError ? (
                      <Badge tone="danger">failed</Badge>
                    ) : isExists ? (
                      <Badge tone="success">in library</Badge>
                    ) : (
                      <Badge tone="info">requested</Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {requests && offset + requests.length < total && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={loadingMore}
            onClick={() => fetchPage(searchInput, offset + REQUESTS_PAGE, false)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Sync history ──────────────────────────────────────────────────────────────
// Lists every `sync.now` run (radarr_sync_log) newest-first. Expand a run to see
// the per-movie failures captured on that run.

interface SyncRun {
  id: number
  instance_id: string | null
  started_at: number
  finished_at: number | null
  success: number
  paused: number
  found: number
  imported: number
  skipped: number
  failed: number
  errors: string | null
  message: string | null
}

interface SyncRunError {
  title?: string | null
  error?: string | null
  tmdb_id?: string | null
}

function SyncHistorySection({ pluginId }: { pluginId?: string }) {
  const api = getPluginAPI()
  const [runs, setRuns] = useState<SyncRun[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    if (!api || !pluginId) return
    setLoading(true)
    setError(null)
    try {
      const res = (await api.callData(pluginId, 'sync.history', { limit: 50, offset: 0 })) as {
        total?: number
        runs?: SyncRun[]
      }
      setRuns(res?.runs || [])
      setTotal(res?.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sync history')
    } finally {
      setLoading(false)
    }
  }, [api, pluginId])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const parseErrors = (run: SyncRun): SyncRunError[] => {
    if (!run.errors) return []
    try {
      const parsed = JSON.parse(run.errors)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-white/40">
          {total > 0 ? `${total} run${total === 1 ? '' : 's'}` : 'No syncs yet'}
        </p>
        <Button variant="ghost" size="xs" onClick={fetchRuns} disabled={loading}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !runs ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : runs && runs.length === 0 ? (
        <EmptyState
          title="No syncs recorded yet"
          message='Run "Sync now" in the "Sync to local catalog" section to create the first entry.'
        />
      ) : (
        runs &&
        runs.map((run) => {
          const expanded = String(run.id) === expandedId
          const runErrors = parseErrors(run)
          return (
            <div key={run.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : String(run.id))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {run.paused ? (
                      <Badge tone="warning" dot>paused</Badge>
                    ) : run.success ? (
                      <Badge tone="success" dot>ok</Badge>
                    ) : (
                      <Badge tone="danger" dot>failed</Badge>
                    )}
                    <span className="truncate text-xs text-white/80">
                      {run.message || `Sync ${new Date(run.started_at).toLocaleString()}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/40">
                    {new Date(run.started_at).toLocaleString()}
                    {run.instance_id ? ` · ${run.instance_id}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone="success">{run.imported} imported</Badge>
                  {run.skipped > 0 && <Badge>{run.skipped} skipped</Badge>}
                  {run.failed > 0 && <Badge tone="danger">{run.failed} failed</Badge>}
                  {run.paused ? <WifiOff className="h-3.5 w-3.5 text-amber-400" /> : null}
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 text-white/30" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/30" />
                  )}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-white/[0.06] bg-black/20 px-4 py-3">
                  <p className="text-[11px] text-white/40">
                    Found {run.found} · Imported {run.imported} · Skipped {run.skipped} · Failed {run.failed}
                  </p>
                  {runErrors.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-300/80">No failures on this run.</p>
                  ) : (
                    <div className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                      {runErrors.map((e, i) => (
                        <div key={`${run.id}-${i}`} className="rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
                          <p className="text-xs text-red-300">{e.title || e.tmdb_id || 'Movie'}</p>
                          {e.error && <p className="mt-0.5 break-words text-[11px] text-red-400/70">{e.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Playlist mapping form ─────────────────────────────────────────────────────
// Lets the user pick a Spotify playlist from a dropdown (instead of pasting a
// URL/ID) and appends a `playlists` mapping to the plugin config. Falls back to
// manual URL/ID entry when the playlist list can't be fetched (e.g. Spotify
// blocks user endpoints until the app owner's account has Premium).

interface SpotifyPlaylist {
  id: string
  name: string
  tracks: number
  public: boolean
}

function PlaylistMappingForm({ pluginId }: { pluginId: string }) {
  const api = getPluginAPI()
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const [manualId, setManualId] = useState('')
  const [ytTitle, setYtTitle] = useState('')
  const [matchMode, setMatchMode] = useState('auto')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPlaylists = useCallback(async () => {
    if (!api) return
    setLoadState('loading')
    setLoadError(null)
    try {
      const res = (await api.callData(pluginId, 'spotify.listPlaylists')) as { success: boolean; playlists?: SpotifyPlaylist[]; error?: string }
      if (res?.success && Array.isArray(res.playlists)) {
        setPlaylists(res.playlists)
        setLoadState('loaded')
      } else {
        setLoadState('error')
        setLoadError(res?.error || 'Could not load your Spotify playlists.')
      }
    } catch (e) {
      setLoadState('error')
      setLoadError(e instanceof Error ? e.message : 'Could not load your Spotify playlists.')
    }
  }, [api, pluginId])

  const handleSelect = (id: string) => {
    setSelected(id)
    const p = playlists.find((x) => x.id === id)
    if (p) setYtTitle(p.name)
  }

  const handleAdd = async () => {
    if (!api) return
    const playlistRef = (selected || manualId.trim()).trim()
    if (!playlistRef) {
      setError('Pick a playlist or paste its URL/ID.')
      return
    }
    if (!ytTitle.trim()) {
      setError('Enter a title for the YouTube Music playlist.')
      return
    }
    setAdding(true)
    setError(null)
    setAdded(false)
    try {
      const cfg = (await api.getConfig(pluginId)) || {}
      const list = Array.isArray(cfg.playlists) ? [...cfg.playlists] : []
      list.push({
        enabled: true,
        source: 'playlist',
        spotify_playlist: playlistRef,
        yt_title: ytTitle.trim(),
        match_mode: matchMode,
      })
      await api.setConfig(pluginId, 'playlists', list)
      setAdded(true)
      setSelected('')
      setManualId('')
      setYtTitle('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the mapping.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold text-white">Add a Spotify playlist mapping</h3>
      <p className="mt-1 text-xs text-white/40">
        Pick one of your playlists — it&apos;s synced to a YouTube Music playlist you name.
      </p>

      <div className="mt-4 space-y-3">
        {loadState === 'idle' || loadState === 'error' ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" loading={loadState === 'loading'} onClick={loadPlaylists}>
              {loadState === 'error' ? 'Retry loading playlists' : 'Load my Spotify playlists'}
            </Button>
            {loadState === 'error' && loadError && (
              <p className="text-xs text-amber-400/90">
                {loadError} You can still add a playlist by pasting its URL or ID below.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Select
              value={selected}
              onChange={(e) => handleSelect(e.target.value)}
              options={[
                { value: '', label: '— Select a playlist —' },
                ...playlists.map((p) => ({ value: p.id, label: `${p.name} (${p.tracks} tracks)` })),
              ]}
              aria-label="Spotify playlist"
            />
            <button
              type="button"
              onClick={loadPlaylists}
              className="self-start text-xs text-white/40 transition-colors hover:text-white/70"
            >
              Refresh list
            </button>
          </div>
        )}

        {loadState === 'loaded' && playlists.length === 0 && (
          <p className="text-xs text-white/40">No playlists found on your account.</p>
        )}

        <input
          type="text"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="…or paste a Spotify playlist URL / ID (optional)"
          aria-label="Spotify playlist URL or ID"
          className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-primary/40 focus:bg-white/[0.06]"
        />
        <input
          type="text"
          value={ytTitle}
          onChange={(e) => setYtTitle(e.target.value)}
          placeholder="YouTube Music playlist title"
          aria-label="YouTube Music playlist title"
          className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-primary/40 focus:bg-white/[0.06]"
        />
        <Select
          value={matchMode}
          onChange={(e) => setMatchMode(e.target.value)}
          options={[
            { value: 'auto', label: 'Match mode: auto (always best match)' },
            { value: 'strict', label: 'Match mode: strict (skip weak matches)' },
          ]}
          aria-label="Match mode"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {added && <p className="text-xs text-emerald-300">Mapping added — it will sync on the next run.</p>}

        <Button size="sm" loading={adding} onClick={handleAdd}>
          Add mapping
        </Button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PluginSettingsPage({ tab }: PluginSettingsPageProps) {
  const [activeSection, setActiveSection] = useState<string | undefined>(tab?.sections[0]?.id)
  const { data, isLoading } = useSlotData(tab ? `settings/${tab.id}` : '')
  const api = getPluginAPI()

  useEffect(() => {
    setActiveSection(tab?.sections[0]?.id)
  }, [tab?.id, tab?.sections])

  // Load the manifest so SyncPlay-only affordances (playlist mapping form)
  // only render for plugins that actually declare the `playlists` field.
  const [pluginInfo, setPluginInfo] = useState<PluginInfo | null>(null)
  useEffect(() => {
    if (!tab?.pluginId) return
    let cancelled = false
    api?.get(tab.pluginId)
      .then((info) => { if (!cancelled) setPluginInfo(info) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [api, tab?.pluginId])

  const handleAction = async (pluginId: string, actionKey: string, payload: unknown) => {
    if (!api) return
    try {
      await api.callData(pluginId, 'handleAction', actionKey, payload)
    } catch (err) {
      console.error(`[PluginSettingsPage] Action "${actionKey}" failed for ${pluginId}:`, err)
    }
  }

  if (!tab) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-white/40">No plugin settings available.</p>
      </div>
    )
  }

  const section = tab.sections.find((s) => s.id === activeSection) ?? tab.sections[0]
  const hasPlaylistMapping = !!pluginInfo?.manifest.config?.playlists

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-white">{tab.label}</h1>
      </div>

      {tab.sections.length > 1 && (
        <div className="flex w-fit gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {tab.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                s.id === activeSection ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/70',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {tab.pluginId && <ConnectionsCards key={tab.pluginId} pluginId={tab.pluginId} />}

      {section ? (
        section.config ? (
          <ConfigSection section={section} pluginId={tab.pluginId} />
        ) : section.sync ? (
          <div className="flex flex-col gap-4">
            <SyncCard pluginId={tab.pluginId} />
            {hasPlaylistMapping && <PlaylistMappingForm pluginId={tab.pluginId} />}
          </div>
        ) : section.movies ? (
          <MoviesSection pluginId={tab.pluginId} />
        ) : section.requests ? (
          <RequestsSection pluginId={tab.pluginId} />
        ) : section.syncHistory ? (
          <SyncHistorySection pluginId={tab.pluginId} />
        ) : (
          <SlotRenderer
            contributions={data?.[section.slot] || []}
            loading={isLoading}
            onAction={handleAction}
          />
        )
      ) : (
        <p className="text-sm text-white/40">This tab has no sections.</p>
      )}
    </div>
  )
}

function ConfigSection({ section, pluginId }: { section: PluginSettingsSection; pluginId?: string }) {
  const api = getPluginAPI()
  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!api || !pluginId) {
        setLoading(false)
        return
      }
      try {
        const [info, cfg] = await Promise.all([api.get(pluginId), api.getConfig(pluginId)])
        if (cancelled) return
        setPlugin(info)
        setConfig(cfg || {})
      } catch (err) {
        console.error(`[ConfigSection] Failed to load config for ${pluginId}:`, err)
        if (!cancelled) setPlugin(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, pluginId])

  const handleSave = useCallback(async () => {
    if (!api || !pluginId) return
    setSaving(true)
    setSaveError(null)
    try {
      const fields = plugin?.manifest.config || {}
      for (const [key, value] of Object.entries(config)) {
        if (fields[key]?.type === 'instances') continue // managed via the plugin data API
        await api.setConfig(pluginId, key, value)
      }
    } catch (err) {
      setSaveError(String((err as Error)?.message || err))
    } finally {
      setSaving(false)
    }
  }, [api, pluginId, config, plugin])

  // Provider-managed keys (shown in the auth cards above) are not repeated
  // here; `instances` fields render their own manager inside the form.
  const visibleFields = useMemo(() => {
    const fields = plugin?.manifest.config
    if (!fields) return undefined
    const excluded = providerManagedKeys(plugin)
    if (excluded.length === 0) return fields
    const copy = { ...fields }
    for (const key of excluded) delete copy[key]
    return copy
  }, [plugin])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
      </div>
    )
  }

  const hasFormFields = !!visibleFields && Object.keys(visibleFields).length > 0

  return (
    <div className="space-y-4">
      {hasFormFields ? (
        <div data-testid="config-form" className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          {saveError && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
              {saveError}
            </div>
          )}
          <PluginForm
            fields={visibleFields}
            values={config}
            onChange={(key, value) => setConfig((c) => ({ ...c, [key]: value }))}
            pluginId={pluginId}
            api={api}
            onSubmit={handleSave}
            submitting={saving}
            submitLabel="Save"
          />
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-white/40">
          No additional configuration for this plugin ({section.label}).
        </p>
      )}
    </div>
  )
}
