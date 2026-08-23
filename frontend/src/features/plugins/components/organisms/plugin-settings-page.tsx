// Renders a plugin settings tab declared in the manifest (settings.tabs).
// Sections can either render the owning plugin's `manifest.config` as an
// auto-generated form (`config: true`) or a dynamic slot (`section.slot`).
//
// Above the section content, provider auth cards (Spotify/Google) surface the
// plugin's connection state with per-provider sign-in buttons and inline
// credential inputs for the manifest fields grouped under each provider.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Check, ChevronDown, ChevronUp, Loader2, PlugZap, RefreshCw, XCircle } from 'lucide-react'
import {
  SlotRenderer,
  useSlotData,
  type PluginSettingsSection,
  type PluginSettingsTab,
} from '@/features/_config/slots'
import { getPluginAPI, type PluginAPI } from '@/features/plugins/api'
import type { PluginConfigField, PluginInfo } from '@/features/plugins/types/plugins'
import { PluginForm } from '../PluginForm'
import { Button, Select } from '@/features/plugins/ui'
import { cn } from '@/lib/utils'

interface PluginSettingsPageProps {
  tab?: PluginSettingsTab
}

// ── Provider auth cards ───────────────────────────────────────────────────────

interface ProviderDef {
  id: 'spotify' | 'google'
  label: string
  statusKey: string
  credsKey?: string
  sourceKey?: string
  errorKey?: string
}

const PROVIDERS: ProviderDef[] = [
  { id: 'spotify', label: 'Spotify', statusKey: 'spotify', credsKey: 'spotify_creds' },
  { id: 'google', label: 'Google', statusKey: 'google', sourceKey: 'google_source', errorKey: 'google_error' },
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

/** Keys owned by a provider card — excluded from the general config form. */
function providerManagedKeys(plugin: PluginInfo | null): string[] {
  const fields = plugin?.manifest.config
  if (!fields) return []
  return Object.entries(fields)
    .filter(([key, field]) => {
      const s = (field.section || '').toLowerCase()
      return s === 'spotify' || s === 'google' || key.startsWith('spotify_') || key.startsWith('google_')
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
      {PROVIDERS.map((p) => (
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

// ── Sync test card ────────────────────────────────────────────────────────────
// Drives a plugin's `sync.now` / `sync.status` data methods (SyncPlay): a
// "Sync now" button that shows live per-playlist/track progress while running
// and a per-playlist breakdown of the completed run.

interface SyncStatus {
  phase?: string
  current?: number
  total?: number
  playlistTitle?: string
  track?: number
  trackTotal?: number
  lastTrack?: string
  last?: { at?: string; added?: number; skipped?: number; pruned?: number; unmatched?: number; errors?: number } | null
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

function SyncTestCard({ pluginId }: { pluginId: string }) {
  const api = getPluginAPI()
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [items, setItems] = useState<SyncItem[] | null>(null)
  const [summary, setSummary] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!api) return
    try {
      setStatus((await api.callData(pluginId, 'sync.status')) as SyncStatus)
    } catch {
      /* poll races are fine */
    }
  }, [api, pluginId])

  useEffect(() => {
    refreshStatus()
    return stopPolling
  }, [refreshStatus, stopPolling])

  const handleSync = async () => {
    if (!api) return
    setSyncing(true)
    setError(null)
    setItems(null)
    setSummary(null)
    pollRef.current = setInterval(refreshStatus, 500)
    try {
      const res = (await api.callData(pluginId, 'sync.now')) as Record<string, any>
      setSummary(res)
      if (Array.isArray(res?.results)) setItems(res.results)
      if (res?.success === false && res?.error) setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      stopPolling()
      await refreshStatus()
      setSyncing(false)
    }
  }

  const running = syncing && status?.phase === 'running'
  const last = status?.last

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-white">Sync playlists</h3>
        <Button size="sm" disabled={syncing} onClick={handleSync} className="ml-auto">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>

      {running && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3 text-xs">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            <span className="text-white/80">
              Syncing playlist {status.current ?? 0} of {status.total ?? 0}
            </span>
          </div>
          {status.playlistTitle && <p className="text-white/60">→ {status.playlistTitle}</p>}
          {status.trackTotal ? (
            <p className="text-white/50">
              Track {status.track ?? 0} of {status.trackTotal}
            </p>
          ) : null}
          {status.lastTrack && <p className="truncate text-white/40">{status.lastTrack}</p>}
        </div>
      )}

      {!running && summary && (
        <div className="mt-4 space-y-1.5 text-xs">
          <p className={summary.success ? 'text-emerald-300' : 'text-red-400'}>
            {summary.success ? 'Sync complete' : 'Sync failed'}
          </p>
          <div className="flex flex-wrap gap-3 text-white/60">
            <span>{summary.added ?? 0} added</span>
            <span>{summary.skipped ?? 0} skipped</span>
            <span>{summary.pruned ?? 0} pruned</span>
            <span>{summary.unmatched ?? 0} unmatched</span>
            <span>{summary.errorCount ?? 0} errors</span>
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

      {last && (
        <p className="mt-3 text-[11px] text-white/40">
          Last sync {new Date(last.at ?? Date.now()).toLocaleString()} · {last.added ?? 0} added, {last.skipped ?? 0} skipped
          {last.pruned ? `, ${last.pruned} pruned` : ''}
          {last.errors ? `, ${last.errors} error(s)` : ''}
        </p>
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

      {tab.pluginId && <ConnectionsCards pluginId={tab.pluginId} />}

      {section ? (
        section.config ? (
          <ConfigSection section={section} pluginId={tab.pluginId} />
        ) : section.sync ? (
          <div className="flex flex-col gap-4">
            <SyncTestCard pluginId={tab.pluginId} />
            <PlaylistMappingForm pluginId={tab.pluginId} />
          </div>
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
      for (const [key, value] of Object.entries(config)) {
        await api.setConfig(pluginId, key, value)
      }
    } catch (err) {
      setSaveError(String((err as Error)?.message || err))
    } finally {
      setSaving(false)
    }
  }, [api, pluginId, config])

  // Provider-managed keys (shown in the auth cards above) are not repeated here.
  const visibleFields = useMemo(() => {
    const fields = plugin?.manifest.config
    if (!fields) return undefined
    const excluded = new Set(providerManagedKeys(plugin))
    if (excluded.size === 0) return fields
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

  if (!visibleFields || Object.keys(visibleFields).length === 0) {
    return (
      <p className="py-10 text-center text-sm text-white/40">
        No additional configuration for this plugin ({section.label}).
      </p>
    )
  }

  return (
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
        onSubmit={handleSave}
        submitting={saving}
        submitLabel="Save"
      />
    </div>
  )
}
