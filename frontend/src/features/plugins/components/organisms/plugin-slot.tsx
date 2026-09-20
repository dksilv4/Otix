import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Gamepad2, RefreshCw, FolderOpen, Plus, X, LogOut, CheckCircle2, Star, AlertCircle, Trash2, ChevronDown, Sparkles, Link2 } from 'lucide-react'
import type { PluginAPI } from '@/features/plugins/api'
import type { PluginInfo } from '@/features/plugins/types/plugins'
import { batchMatchAndSave } from '@/features/plugins/utils/matching'
import { PathInput } from '@/components/path-picker'
import { ProviderLogo } from '@/features/settings/components/atoms/provider-logo'
import { apiClient } from '@/lib/api/client'
import { isDesktop } from '@/lib/desktop/api'
import { useModal } from '@/lib/modals'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { workerConnectionNodes } from '@/features/downloads/molecules/use-integration-target-server'
import { openExternal } from '@/lib/utils/open-external'
import { EpicCodeModal } from '@/features/settings/components/organisms/epic-code-modal'

interface ConfigField {
  key: string
  label: string
  type: 'path-list' | 'string' | 'number'
  description?: string
  placeholder?: string
}

interface SlotPluginData {
  type: string
  label: string
  description?: string
  platform?: string
  platforms?: string[]
  mediaTypes?: string[]
  status?: Record<string, unknown>
  actions?: Record<string, string>
  configFields?: ConfigField[]
  viewLibraryPath?: string
}

interface SlotEntry {
  pluginId: string
  label: string
  data: SlotPluginData | null
}

interface Props {
  location: string
  pluginApi: PluginAPI
}

const API_BASE = (window as any).desktopAPI?.getApiBaseUrl?.() || 'http://127.0.0.1:8000/api'

type ScanPhase = 'idle' | 'scanning' | 'matching' | 'hydrating' | 'done'

interface ScanProgress {
  phase: ScanPhase
  scanned: number
  matched: number
  suggested: number
  total: number
  currentDir: string
  message: string
}

export function PluginSlot({ location, pluginApi }: Props) {
  const [slotData, setSlotData] = useState<SlotEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await pluginApi.getSlotData?.(location) as SlotEntry[] | undefined
        if (!cancelled) setSlotData(data || [])
      } catch { /* no plugins for this slot */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [location, pluginApi])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-white/50 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
  }

  const isLibraryScan = location === 'library:scan'
  const filteredSlotData = isLibraryScan
    ? slotData.filter((entry) => entry.pluginId !== 'otix-epic')
    : slotData

  if (filteredSlotData.length === 0 && !isLibraryScan) return null

  return (
    <div className="space-y-4">
      {isLibraryScan && (
        <>
          <SteamScanSlotCard />
          <EpicScanSlotCard />
        </>
      )}

      {filteredSlotData.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filteredSlotData.map(entry => {
            if (entry.data?.type === 'scan') {
              return <ScanSlotCard key={entry.pluginId} entry={entry} pluginApi={pluginApi} />
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}

function SteamScanSlotCard() {
  const [steamConnected, setSteamConnected] = useState(false)
  const [steamProfile, setSteamProfile] = useState<any>(null)
  const [steamId, setSteamId] = useState<string | null>(null)
  const [steamScanning, setSteamScanning] = useState(false)
  const [wishlistScanning, setWishlistScanning] = useState(false)
  const [resolvingUnmatched, setResolvingUnmatched] = useState(false)
  const [steamMessage, setSteamMessage] = useState('')
  const [steamError, setSteamError] = useState('')
  const [scanResult, setScanResult] = useState<{ totalInSteam: number; matchedInOtix: number } | null>(null)
  const [wishlistResult, setWishlistResult] = useState<{ total: number; matched: number; private?: boolean } | null>(null)
  const [resolveResult, setResolveResult] = useState<{ resolved: number; synced: number; failed: number; total: number } | null>(null)

  const fetchSteamStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/auth/oauth')
      const steam = (data.providers as Array<any>)?.find((p) => p.name === 'steam')
      if (steam) {
        setSteamConnected(Boolean(steam.connected))
        setSteamId(steam.steamId ?? null)
        setSteamProfile(steam.steamProfile ?? null)
      }
    } catch {
      // Ignore auth errors if unauthenticated
    }
  }, [])

  useEffect(() => {
    fetchSteamStatus()
  }, [fetchSteamStatus])

  const handleScanSteamGames = async () => {
    setSteamScanning(true)
    setSteamError('')
    setSteamMessage('')
    try {
      const { data } = await apiClient.post<{ totalInSteam: number; matchedInOtix: number }>('/integrations/steam/scan')
      setScanResult(data)
      setSteamMessage(`Scanned Steam library: ${data.matchedInOtix} matched out of ${data.totalInSteam} games.`)
      window.dispatchEvent(new CustomEvent('scanned-games-updated'))
    } catch (err: any) {
      setSteamError(err?.response?.data?.detail || err?.message || 'Failed to scan Steam games.')
    } finally {
      setSteamScanning(false)
    }
  }

  const handleScanSteamWishlist = async () => {
    setWishlistScanning(true)
    setSteamError('')
    setSteamMessage('')
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; private?: boolean }>('/integrations/steam/wishlist/scan')
      setWishlistResult(data)
      if (data.private) {
        setSteamError('Steam wishlist is private. Set your Steam profile privacy to Public.')
      } else {
        setSteamMessage(`Scanned Steam wishlist: ${data.matched} matched out of ${data.total} items.`)
      }
    } catch (err: any) {
      setSteamError(err?.response?.data?.detail || err?.message || 'Failed to scan Steam wishlist.')
    } finally {
      setWishlistScanning(false)
    }
  }

  const handleResolveUnmatchedSteam = async () => {
    setResolvingUnmatched(true)
    setSteamError('')
    setSteamMessage('')
    try {
      const { data } = await apiClient.post<{ resolved: number; synced: number; failed: number; total: number }>('/integrations/steam/resolve-unmatched')
      setResolveResult(data)
      setSteamMessage(`Unmatched resolution: ${data.resolved} linked, ${data.synced} synced out of ${data.total}.`)
      window.dispatchEvent(new CustomEvent('scanned-games-updated'))
    } catch (err: any) {
      setSteamError(err?.response?.data?.detail || err?.message || 'Failed to resolve unmatched games.')
    } finally {
      setResolvingUnmatched(false)
    }
  }

  const handleConnectSteam = async () => {
    try {
      const { data } = await apiClient.post('/auth/oauth/steam', isDesktop() ? { source: 'desktop' } : undefined)
      if (data.authUrl) {
        if (isDesktop() && (window as any).desktopAPI?.openExternalUrl) {
          ;(window as any).desktopAPI.openExternalUrl(data.authUrl)
        } else {
          window.open(data.authUrl, '_blank', 'noopener,noreferrer')
        }
      }
    } catch (err: any) {
      setSteamError(err?.response?.data?.detail || 'Failed to initiate Steam login.')
    }
  }

  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0 border border-sky-500/20">
            <ProviderLogo platform="steam" className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">Steam Provider</h4>
              {steamConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  Not Linked
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {steamConnected && steamProfile?.personaname
                ? `Linked as ${steamProfile.personaname}${steamId ? ` (${steamId})` : ''}`
                : 'Scan and sync your Steam games library, wishlist, and auto-matches.'}
            </p>
          </div>
        </div>

        {!steamConnected && (
          <button
            onClick={handleConnectSteam}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
          >
            <ProviderLogo platform="steam" className="h-3.5 w-3.5" />
            Connect Steam
          </button>
        )}
      </div>

      {steamConnected && (
        <div className="pt-2 space-y-3 border-t border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={handleScanSteamGames}
              disabled={steamScanning}
              className="flex flex-col p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-white group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 text-sky-400 ${steamScanning ? 'animate-spin' : ''}`} />
                  Scan Steam Games
                </span>
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {scanResult ? `${scanResult.matchedInOtix} matched / ${scanResult.totalInSteam} total` : 'Import & match owned Steam titles'}
              </p>
            </button>

            <button
              onClick={handleScanSteamWishlist}
              disabled={wishlistScanning}
              className="flex flex-col p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-white group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <Sparkles className={`h-3.5 w-3.5 text-amber-400 ${wishlistScanning ? 'animate-spin' : ''}`} />
                  Scan Wishlist
                </span>
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {wishlistResult ? `${wishlistResult.matched} matched / ${wishlistResult.total} wishlist` : 'Sync public Steam wishlist'}
              </p>
            </button>

            <button
              onClick={handleResolveUnmatchedSteam}
              disabled={resolvingUnmatched}
              className="flex flex-col p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-white group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <Link2 className={`h-3.5 w-3.5 text-emerald-400 ${resolvingUnmatched ? 'animate-spin' : ''}`} />
                  Resolve Unmatched
                </span>
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {resolveResult ? `${resolveResult.resolved} linked / ${resolveResult.total} pending` : 'Auto-link unmapped games to IGDB'}
              </p>
            </button>
          </div>

          {steamMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{steamMessage}</span>
            </div>
          )}

          {steamError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{steamError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EpicScanSlotCard() {
  const { openModal } = useModal()
  const { data: gameServers = [] } = useGameServers()
  const hasOnlineNode = workerConnectionNodes(gameServers).some((s) => s.isOnline)

  const [epicConnected, setEpicConnected] = useState(false)
  const [epicDisplayName, setEpicDisplayName] = useState<string | null>(null)
  const [epicAccountId, setEpicAccountId] = useState<string | null>(null)
  const [epicScanning, setEpicScanning] = useState(false)
  const [epicConnecting, setEpicConnecting] = useState(false)
  const [epicMessage, setEpicMessage] = useState('')
  const [epicError, setEpicError] = useState('')
  const [scanResult, setScanResult] = useState<{ totalInEpic: number; matchedInOtix: number; failed: number } | null>(null)

  const fetchEpicStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string | null
        accountId?: string | null
      }>('/integrations/epic/status')
      setEpicConnected(Boolean(data.connected))
      setEpicDisplayName(data.displayName ?? null)
      setEpicAccountId(data.accountId ?? null)
    } catch {
      setEpicConnected(false)
    }
  }, [])

  useEffect(() => {
    fetchEpicStatus()
  }, [fetchEpicStatus])

  const handleConnectEpic = async () => {
    setEpicConnecting(true)
    setEpicError('')
    try {
      if (!hasOnlineNode) {
        setEpicError('Connect an Otix Server to link Epic.')
        return
      }
      const { data } = await apiClient.post('/auth/oauth/epic')
      const authUrl = data.authUrl || data.auth_url
      const state = data.state
      const openOAuthWindow = (window as any).desktopAPI?.plugin?.openOAuthWindow
      if (isDesktop() && openOAuthWindow) {
        const win = await openOAuthWindow(authUrl, 'id/api/redirect') as {
          success?: boolean
          code?: string
          error?: string
        }
        if (!win?.success || !win.code) {
          setEpicError((win?.error as string | undefined) || 'Login cancelled')
          return
        }
        await apiClient.post('/auth/oauth/epic/callback', { code: win.code, state })
        await fetchEpicStatus()
        return
      }
      openExternal(authUrl)
      const closeRef = { current: () => {} }
      closeRef.current = openModal(
        <EpicCodeModal
          authUrl={authUrl}
          state={state}
          onClose={() => closeRef.current()}
          onLinked={() => { void fetchEpicStatus() }}
        />
      )
    } catch (err: any) {
      setEpicError(err?.response?.data?.detail || err?.message || 'Failed to initiate Epic Games login.')
    } finally {
      setEpicConnecting(false)
    }
  }

  const handleScanEpicGames = async () => {
    setEpicScanning(true)
    setEpicError('')
    setEpicMessage('')
    try {
      const { data } = await apiClient.post<{
        totalInEpic: number
        matchedInOtix: number
        failed: number
      }>('/integrations/epic/scan')
      setScanResult(data)
      let msg = `Scanned Epic library: ${data.matchedInOtix} matched out of ${data.totalInEpic} games.`
      if (data.failed > 0) msg += ` (${data.failed} unmatched)`
      setEpicMessage(msg)
      window.dispatchEvent(new CustomEvent('scanned-games-updated'))
    } catch (err: any) {
      setEpicError(err?.response?.data?.detail || err?.message || 'Failed to scan Epic games.')
    } finally {
      setEpicScanning(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20 text-white">
            <ProviderLogo platform="epic" className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">Epic Games Provider</h4>
              {epicConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  Not Linked
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {epicConnected && epicDisplayName
                ? `Linked as ${epicDisplayName}${epicAccountId ? ` (${epicAccountId})` : ''}`
                : !hasOnlineNode
                  ? 'Connect an Otix Server to link Epic.'
                  : 'Scan and sync your Epic Games library.'}
            </p>
          </div>
        </div>

        {!epicConnected && (
          <button
            onClick={handleConnectEpic}
            disabled={epicConnecting || !hasOnlineNode}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
          >
            <ProviderLogo platform="epic" className="h-3.5 w-3.5" />
            Connect Epic Games
          </button>
        )}
      </div>

      {epicConnected && (
        <div className="pt-2 space-y-3 border-t border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={handleScanEpicGames}
              disabled={epicScanning}
              className="flex flex-col p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-semibold text-white group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 text-white/80 ${epicScanning ? 'animate-spin' : ''}`} />
                  Scan Epic Games
                </span>
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {scanResult ? `${scanResult.matchedInOtix} matched / ${scanResult.totalInEpic} total` : 'Import & match owned Epic titles'}
              </p>
            </button>
          </div>

          {epicMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{epicMessage}</span>
            </div>
          )}

          {epicError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{epicError}</span>
            </div>
          )}
        </div>
      )}

      {!epicConnected && epicError && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{epicError}</span>
        </div>
      )}
    </div>
  )
}

function ScanSlotCard({ entry, pluginApi }: { entry: SlotEntry; pluginApi: PluginAPI }) {
  const data = entry.data!
  const pluginName = data.label || entry.label
  const hasAuth = !!data.actions?.login

  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    pluginApi.get(entry.pluginId)
      .then((info) => { if (!cancelled) setPlugin(info) })
      .catch(() => { /* plugin may not respond */ })
    return () => { cancelled = true }
  }, [entry.pluginId, pluginApi])

  // Path-list fields are declared in the manifest `config` (schema-driven).
  // Fall back to runtime-emitted `configFields` for older plugins.
  const manifestPathFields: ConfigField[] = useMemo(() => {
    const config = plugin?.manifest.config
    if (!config) return []
    return Object.entries(config)
      .filter(([, f]) => f.type === 'path-list')
      .map(([key, f]) => ({
        key,
        label: f.label,
        type: 'path-list' as const,
        description: f.description,
        placeholder: f.placeholder,
      }))
  }, [plugin])
  const configFields = manifestPathFields.length > 0 ? manifestPathFields : (data.configFields || [])

  const [status, setStatus] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scanResult, setScanResult] = useState<{ total: number; matched: number; suggested: number } | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, string[]>>({})
  const [configLoaded, setConfigLoaded] = useState(false)
  const desktopAPI = (window as any).desktopAPI
  const [expanded, setExpanded] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [removeDirConfirm, setRemoveDirConfirm] = useState<{ key: string; idx: number; path: string } | null>(null)

  const confirmRemovePath = (key: string, idx: number) => {
    const val = (configValues[key] || [])[idx]
    if (!val) return
    setRemoveDirConfirm({ key, idx, path: val })
  }

  const executeRemovePath = async (alsoRemoveGames: boolean) => {
    if (!removeDirConfirm) return
    const { key, idx, path: dirPath } = removeDirConfirm
    if (alsoRemoveGames) {
      try {
        await desktopAPI?.deleteGamesByDirectory?.(dirPath)
        window.dispatchEvent(new CustomEvent('scanned-games-updated'))
      } catch (err) {
        console.error('[PluginSlot] deleteGamesByDirectory failed:', err)
      }
    }
    const current = [...(configValues[key] || [])]
    current.splice(idx, 1)
    await saveConfig(key, current)
    setRemoveDirConfirm(null)
  }

  const handleReset = async () => {
    if (!resetConfirm) { setResetConfirm(true); return }
    setResetConfirm(false)
    const platforms = data.platforms || [data.platform || 'pc']
    try {
      await desktopAPI?.resetPlatformGames?.(platforms)
      setScanResult(null)
      setStatus((prev: any) => ({ ...prev, total: 0, last_scan_total: 0, matched: 0 }))
      window.dispatchEvent(new CustomEvent('scanned-games-updated'))
    } catch (err) {
      console.error('[PluginSlot] reset failed:', err)
    }
  }

  // Clear reset confirm after 3s
  useEffect(() => {
    if (!resetConfirm) return
    const t = setTimeout(() => setResetConfirm(false), 3000)
    return () => clearTimeout(t)
  }, [resetConfirm])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const cfg = await pluginApi.getConfig(entry.pluginId)
        if (cancelled) return
        const vals: Record<string, string[]> = {}
        for (const field of configFields) {
          const raw = (cfg as any)[field.key]
          vals[field.key] = Array.isArray(raw) ? raw : (raw ? [String(raw)] : [])
        }
        setConfigValues(vals)
      } catch { /* plugin may not respond yet */ }
      if (!cancelled) setConfigLoaded(true)
    }
    load()
    const t = setTimeout(load, 2000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [entry.pluginId, configFields])

  const refreshStatus = useCallback(async () => {
    try {
      const res = await pluginApi.getStatus(entry.pluginId) as any
      if (res) setStatus(res)
    } catch { /* plugin may not respond */ }
  }, [entry.pluginId])

  useEffect(() => {
    refreshStatus()
    const t = setTimeout(refreshStatus, 2000)
    return () => clearTimeout(t)
  }, [refreshStatus])

  // ── Config helpers ──

  const saveConfig = async (key: string, values: string[]) => {
    await pluginApi.setConfig(entry.pluginId, key, values)
    setConfigValues((prev) => ({ ...prev, [key]: values }))
  }

  const addPath = (key: string) => {
    const current = configValues[key] || []
    saveConfig(key, [...current, ''])
  }

  const updatePath = (key: string, idx: number, value: string) => {
    const current = [...(configValues[key] || [])]
    current[idx] = value
    saveConfig(key, current)
  }

  // ── Auth ──

  const loginFlow = async (): Promise<boolean> => {
    const getLoginUrlMethod = data.actions?.['login']
    if (!getLoginUrlMethod) return false
    const urlResult = await pluginApi.callData(entry.pluginId, getLoginUrlMethod) as any
    if (!urlResult?.url) return false
    const redirectPattern = urlResult.redirectPattern || 'id/api/redirect'
    const options = urlResult.tokenExtraction ? { tokenExtraction: urlResult.tokenExtraction } : undefined
    const windowResult = await desktopAPI?.plugin?.openOAuthWindow(urlResult.url, redirectPattern, options)
    if (!windowResult?.success || !windowResult?.code) return false
    const handleCallbackMethod = data.actions?.['handleCallback'] || 'auth.handleCallback'
    const cbRes = await pluginApi.callData(entry.pluginId, handleCallbackMethod, windowResult.code) as any
    if (cbRes?.success) {
      setStatus((prev: any) => ({ ...prev, connected: true, displayName: cbRes.displayName }))
      return true
    }
    return false
  }

  const handleAction = async (action: string) => {
    const actionMethod = data.actions?.[action]
    if (!actionMethod) return

    setLoading(true)
    try {
      if (action === 'login') {
        await loginFlow()
      } else if (action === 'scan') {
        setScanResult(null)
        setScanProgress({ phase: 'scanning', scanned: 0, matched: 0, suggested: 0, total: 0, currentDir: '', message: 'Scanning local files...' })

        // Phase 1: Scan
        const scanPromise = pluginApi.callData(entry.pluginId, actionMethod)
        const pollInterval = setInterval(async () => {
          try {
            const prog = await pluginApi.callData(entry.pluginId, 'scan.status') as any
            if (prog && prog.phase !== 'idle') {
              setScanProgress((prev) => prev ? {
                ...prev,
                scanned: prog.current || 0,
                total: prog.total || 0,
                currentDir: prog.currentDir || '',
                message: prog.currentDir ? `Scanning ${prog.currentDir}` : `Scanning... ${prog.current || 0}/${prog.total || 0}`,
              } : null)
            }
          } catch { /* polling may race */ }
        }, 300)

        const result = await scanPromise as any
        clearInterval(pollInterval)

        console.log('[PluginSlot] scan result:', result?.success, 'games:', result?.games?.length || result?.total, result)
        if (!result?.success || !result.games?.length) {
          const errorMsg = result?.error
            ? (result.error === 'not_authenticated' ? `Not signed in to ${pluginName}. Sign in first.` :
               result.error === 'no_account_id' ? `No ${pluginName} account — sign in to scan your library.` :
               `Scan failed: ${result.error}`)
            : 'No games found'
          setScanProgress({ phase: 'done', scanned: result?.total || 0, matched: 0, suggested: 0, total: result?.total || 0, currentDir: '', message: errorMsg })
          setLoading(false)
          return
        }

        const scannedCount = result.games.length
        setScanProgress({ phase: 'matching', scanned: scannedCount, matched: 0, suggested: 0, total: scannedCount, currentDir: '', message: `Matching ${scannedCount} games against Otix...` })

        // Phase 2: Match
        const mappedGames = result.games.map((g: any) => ({
          id: g.appName || g.catalogItemId || g.id || g.title,
          title: g.title || g.appName,
          developer: g.developer || g.publisher || null,
          developerId: g.developerId || null,
          releaseYear: g.releaseYear || null,
          publisher: g.publisher || g.developer || null,
          appName: g.appName,
          namespace: g.namespace,
          catalogItemId: g.catalogItemId,
          platform: g.platform || data.platform || 'pc',
          exePath: g.exePath || g.launchExe || g.installPath || null,
          installDir: g.installDir || g.installPath || null,
          posterUrl: g.posterUrl || null,
          logoUrl: g.logoUrl || null,
          savePaths: g.savePaths || null,
          sources: g.sources || [{
            source: g.platform || data.platform || 'pc',
            appName: g.appName,
            namespace: g.namespace,
            catalogItemId: g.catalogItemId,
            developer: g.developer,
            developerId: g.developerId,
            sellerName: g.sellerName,
            savePaths: g.savePaths,
            launchExe: g.launchExe,
            contentType: g.contentType,
          }],
        }))

        const outcome = await batchMatchAndSave(mappedGames, desktopAPI, API_BASE)

        // Hydration handled by SSE /match/scan endpoint inline
        setScanProgress({ phase: 'done', scanned: scannedCount, matched: outcome.matched, suggested: outcome.suggested, total: scannedCount, currentDir: '', message: 'Scan complete' })
        setScanResult({ total: scannedCount, matched: outcome.matched, suggested: outcome.suggested })
        setStatus((prev: any) => ({ ...prev, total: scannedCount, last_scan_total: scannedCount, matched: outcome.matched }))
        window.dispatchEvent(new CustomEvent('scanned-games-updated'))
      } else if (action === 'logout') {
        await pluginApi.callData(entry.pluginId, actionMethod)
        setStatus({ connected: false })
      } else {
        await pluginApi.callData(entry.pluginId, actionMethod)
      }
    } catch (err) {
      console.error('[PluginSlot] action failed:', action, err)
      setScanProgress((prev) => prev ? { ...prev, phase: 'done', message: 'Scan failed', currentDir: '' } : null)
    } finally {
      setLoading(false)
    }
  }

  const connected = hasAuth ? (status?.authenticated || status?.connected) : true
  const isScanning = scanProgress && scanProgress.phase !== 'idle' && scanProgress.phase !== 'done'

  // Auto-expand when scanning
  useEffect(() => {
    if (isScanning) setExpanded(true)
  }, [isScanning])

  const lowerName = (data.label || entry.label || entry.pluginId || '').toLowerCase()
  const providerIcon = lowerName.includes('local') || lowerName.includes('folder') || lowerName.includes('file') ? FolderOpen : Gamepad2
  const iconColor = lowerName.includes('steam') ? 'text-sky-400 bg-sky-500/15' : lowerName.includes('epic') ? 'text-purple-400 bg-purple-500/15' : lowerName.includes('local') || lowerName.includes('folder') ? 'text-amber-400 bg-amber-500/15' : 'text-primary bg-primary/15'
  const ProviderIcon = providerIcon

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col justify-between backdrop-blur-2xl transition-all duration-200 relative overflow-hidden space-y-3.5 hover:bg-white/[0.04] ${isScanning ? 'ring-2 ring-primary/60 animate-pulse' : ''}`}
      style={{
        backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.18)',
        boxShadow: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Layered Glass Gradient Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-black/[0.2]" />

      {/* Top Row: Icon Badge & Connection Status */}
      <div className="flex items-center justify-between gap-2 relative z-10">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconColor}`}>
          <ProviderIcon className="h-5 w-5" />
        </div>

        {hasAuth ? (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${connected ? 'text-emerald-400' : 'text-amber-400/90'}`}>
            <span className={`h-2 w-2 rounded-full shrink-0 ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-amber-400'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 text-white/40">
            <span className="h-2 w-2 rounded-full shrink-0 bg-white/30" />
            Local
          </span>
        )}
      </div>

      {/* Middle: Title & Description */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-white tracking-tight">{data.label || entry.label}</h4>
        {data.description && (
          <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">{data.description}</p>
        )}
      </div>

      {/* Bottom: Actions & Path Config Toggle */}
      <div className="flex items-center gap-2 pt-1">
        {hasAuth ? (
          connected ? (
            <>
              <button onClick={() => handleAction('scan')} disabled={loading || !!isScanning}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8.5 rounded-xl text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all disabled:opacity-50 cursor-pointer">
                {loading && !isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Scan</span>
              </button>
              {data.actions?.logout && (
                <button onClick={() => handleAction('logout')} disabled={loading}
                  className="inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/10 transition-all disabled:opacity-50 cursor-pointer"
                  title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </>
          ) : (
            <button onClick={() => handleAction('login')} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 h-8.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer">
              <span>Sign In</span>
            </button>
          )
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <button onClick={() => handleAction('scan')} disabled={loading || !!isScanning}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8.5 rounded-xl text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all disabled:opacity-50 cursor-pointer">
              {loading && !isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>Scan</span>
            </button>
            <button
              onClick={handleReset}
              className={`inline-flex items-center justify-center h-8.5 px-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                resetConfirm
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-white/30 hover:text-red-400 hover:bg-white/10'
              }`}
              title="Remove scanned games for this plugin"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {resetConfirm ? 'Confirm?' : ''}
            </button>
          </div>
        )}

        {configFields.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl transition-all cursor-pointer ${
              expanded ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
            }`}
            title="Configure paths"
          >
            <ChevronDown
              className="h-4 w-4 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
        )}
      </div>

      {/* Expandable content */}
      {expanded && (
      <>

      {/* Scan progress */}
      {scanProgress && scanProgress.phase !== 'idle' && (
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center gap-2 mb-2">
            {scanProgress.phase !== 'done' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            {scanProgress.phase === 'done' && scanProgress.matched > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
            {scanProgress.phase === 'done' && scanProgress.matched === 0 && scanProgress.scanned > 0 && <AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
            <div className="flex-1 min-w-0">
              <span className="text-xs text-white/60 truncate block">{scanProgress.message}</span>
              {scanProgress.currentDir && (
                <span className="text-[10px] text-white/30 truncate block">{scanProgress.currentDir}</span>
              )}
            </div>
          </div>

          {/* Unified triple-section progress bar */}
          {scanProgress.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden bg-white/5">
                {/* Scan section (blue) — 0 to 33% */}
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: '33.3%',
                    backgroundColor: scanProgress.phase === 'scanning' ? '#3b82f6'
                      : scanProgress.phase === 'done' || scanProgress.phase === 'matching' || scanProgress.phase === 'hydrating' ? '#3b82f6'
                      : '#3b82f630',
                    opacity: 1,
                  }}
                />
                {/* Match section (purple) — 33% to 66% */}
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: '33.3%',
                    backgroundColor: scanProgress.phase === 'matching' ? '#8b5cf6'
                      : scanProgress.phase === 'done' ? '#8b5cf680'
                      : scanProgress.phase === 'hydrating' ? '#8b5cf660'
                      : '#8b5cf620',
                  }}
                />
                {/* Hydrate section (green) — 66% to 100% */}
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: '33.3%',
                    backgroundColor: scanProgress.phase === 'hydrating' ? '#22c55e'
                      : scanProgress.phase === 'done' ? '#22c55e80'
                      : '#22c55e30',
                  }}
                />
              </div>
              {/* Labels + counts */}
              <div className="flex text-[9px]">
                <span className="text-center" style={{ width: '33.3%', color: scanProgress.phase === 'scanning' ? '#3b82f6' : '#3b82f680' }}>
                  Scan {scanProgress.total > 0 ? `${scanProgress.scanned}/${scanProgress.total}` : ''}
                </span>
                <span className="text-center" style={{ width: '33.3%', color: scanProgress.phase === 'matching' ? '#8b5cf6' : scanProgress.phase === 'done' || scanProgress.phase === 'hydrating' ? '#8b5cf680' : '#8b5cf640' }}>
                  Match {scanProgress.matched > 0 ? `${scanProgress.matched}/${scanProgress.scanned}` : ''}
                </span>
                <span className="text-center" style={{ width: '33.3%', color: scanProgress.phase === 'hydrating' ? '#22c55e' : scanProgress.phase === 'done' ? '#22c55e80' : '#22c55e40' }}>
                  Hydrate {scanProgress.phase === 'hydrating' ? '...' : scanProgress.phase === 'done' ? '✓' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan result summary */}
      {scanResult && (
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-white/50">{scanResult.total} scanned</span>
            {scanResult.matched > 0 && (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {scanResult.matched} matched
              </span>
            )}
            {scanResult.suggested > 0 && (
              <span className="text-blue-400 flex items-center gap-1">
                <Star className="h-3 w-3" /> {scanResult.suggested} suggested
              </span>
            )}
            {scanResult.matched === 0 && scanResult.suggested === 0 && scanResult.total > 0 && (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> No matches — is the backend API running?
              </span>
            )}
          </div>
        </div>
      )}

      {/* Remove directory confirmation */}
      {removeDirConfirm && (
        <div className="px-4 pb-4 pt-2">
          <div className="rounded-xl p-3.5 bg-red-500/10 space-y-2">
            <p className="text-xs text-white/80">
              Remove <span className="text-white font-semibold">{removeDirConfirm.path}</span>?
            </p>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Games scanned from this directory will remain unless you choose to delete them.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => executeRemovePath(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all cursor-pointer"
              >
                Remove &amp; Delete Games
              </button>
              <button
                onClick={() => executeRemovePath(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 text-white/80 hover:bg-white/20 transition-all cursor-pointer"
              >
                Keep Games
              </button>
              <button
                onClick={() => setRemoveDirConfirm(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white transition-all ml-auto cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config fields */}
      {configFields.length > 0 && configLoaded && (
        <div className="px-4 pb-4 space-y-3 pt-3">
          {configFields.map((field) => {
            const values = configValues[field.key] || []
            return (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-white/60">{field.label}</label>
                  <button
                    onClick={() => addPath(field.key)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Path
                  </button>
                </div>
                {field.description && (
                  <p className="text-[11px] text-white/40 mb-2">{field.description}</p>
                )}
                <div className="space-y-1.5">
                  {values.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <PathInput
                        compact
                        value={val}
                        onChange={(next) => updatePath(field.key, idx, next)}
                        placeholder={field.placeholder || `C:\\Games\\...`}
                        className="min-w-0 flex-1"
                        inputClassName="h-8.5 rounded-xl bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:bg-white/10"
                      />
                      <button
                        onClick={() => confirmRemovePath(field.key, idx)}
                        className="flex items-center justify-center h-8.5 w-8.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
                        title="Remove directory"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {values.length === 0 && (
                    <p className="text-xs text-white/30 italic py-1">No directories configured</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </>
      )}
    </div>
  )
}
