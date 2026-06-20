import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Gamepad2, CheckCircle2, AlertCircle, LogOut, RefreshCw } from 'lucide-react'
import type { PluginAPI } from './PluginSettings'
import { batchMatchAndSave } from '@/features/plugins/utils/matching'

interface SlotPluginData {
  type: string
  label: string
  status?: Record<string, unknown>
  actions?: Record<string, string>
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

export function PluginSlot({ location, pluginApi }: Props) {
  const [slotData, setSlotData] = useState<SlotEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await pluginApi.getSlotData(location)
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

  if (slotData.length === 0) return null

  return (
    <>
      {slotData.map(entry => {
        if (entry.data?.type === 'scan') {
          return <ScanSlotCard key={entry.pluginId} entry={entry} pluginApi={pluginApi} />
        }
        return null
      })}
    </>
  )
}

function ScanSlotCard({ entry, pluginApi }: { entry: SlotEntry; pluginApi: PluginAPI }) {
  const [status, setStatus] = useState<any>(entry.data?.status || {})
  const [loading, setLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const desktopAPI = (window as any).desktopAPI
  const autoScanned = useRef(false)

  // Refresh status
  const refreshStatus = async () => {
    if (entry.data?.actions?.status) {
      try {
        const res = await pluginApi.callData(entry.pluginId, entry.data.actions.status) as any
        if (res) setStatus(res)
      } catch { /* plugin may not respond */ }
    }
  }

  const doScan = useCallback(async () => {
    await handleAction('scan')
  }, [entry.pluginId])

  useEffect(() => {
    refreshStatus()
    // Retry after plugin worker is ready (delayed mount timing)
    const t = setTimeout(refreshStatus, 2000)
    return () => clearTimeout(t)
  }, [entry.pluginId])

  // Auto-scan only if never scanned before (no persisted scan data).
  // Plugin's own startup auto-scan handles app-launch scanning.
  // This guards against redundant re-scans every time the page mounts.
  useEffect(() => {
    const hasExistingScan = (status?.last_scan_total || 0) > 0
    if (!autoScanned.current && status?.connected && !hasExistingScan && entry.data?.actions?.scan && !entry.data?.actions?.login) {
      autoScanned.current = true
      doScan()
    }
  }, [status?.connected, status?.last_scan_total, entry.data?.actions])

  const loginFlow = async (): Promise<boolean> => {
    // 1. Get auth URL from plugin
    const getLoginUrlMethod = entry.data?.actions?.['login']
    if (!getLoginUrlMethod) return false

    const urlResult = await pluginApi.callData(entry.pluginId, getLoginUrlMethod) as any
    if (!urlResult?.url) return false

    // 2. Open OAuth window
    const windowResult = await desktopAPI?.plugin?.openOAuthWindow(
      urlResult.url,
      'id/api/redirect',
    )
    if (!windowResult?.success || !windowResult?.code) return false

    // 3. Handle callback with auth code
    const handleCallbackMethod = entry.data?.actions?.['handleCallback'] || 'auth.handleCallback'
    const cbRes = await pluginApi.callData(entry.pluginId, handleCallbackMethod, windowResult.code) as any
    if (cbRes?.success) {
      setStatus((prev: any) => ({ ...prev, connected: true, displayName: cbRes.displayName }))
      return true
    }
    return false
  }

  const handleAction = async (action: string) => {
    const actionMethod = entry.data?.actions?.[action]
    if (!actionMethod) return

    setLoading(true)
    try {
      // ── Login ──
      if (action === 'login') {
        await loginFlow()
      }

      // ── Scan ──
      else if (action === 'scan') {
        setScanProgress({ phase: 'scanning', current: 0, total: 0 })

        // Start scan (async in plugin)
        const scanPromise = pluginApi.callData(entry.pluginId, actionMethod)

        // Poll progress while scanning
        const pollInterval = setInterval(async () => {
          try {
            const prog = await pluginApi.callData(entry.pluginId, 'scan.status') as any
            if (prog && prog.phase !== 'idle') {
              setScanProgress({ phase: prog.phase, current: prog.current || 0, total: prog.total || 0 })
            }
          } catch { /* polling may race */ }
        }, 1000)

        const result = await scanPromise as any
        clearInterval(pollInterval)
        setScanProgress(null)

        if (result?.success && result.games?.length) {
          // Map plugin game format to MatchableGame format
          const mappedGames = result.games.map((g: any) => ({
            id: g.appName || g.catalogItemId || g.title,
            title: g.title || g.appName,
            developer: g.developer || g.publisher || null,
            developerId: g.developerId || null,
            publisher: g.publisher || g.developer || null,
            appName: g.appName,
            namespace: g.namespace,
            catalogItemId: g.catalogItemId,
            platform: 'epic',
            exePath: g.launchExe || g.installPath || null,
            installDir: g.installPath || null,
            posterUrl: g.posterUrl || null,
            logoUrl: g.logoUrl || null,
            savePaths: g.savePaths || null,
            sources: g.developerExternalIds?.length
              ? [{
                  source: 'epic',
                  appName: g.appName,
                  namespace: g.namespace,
                  catalogItemId: g.catalogItemId,
                  developer: g.developer,
                  developerId: g.developerId,
                  sellerName: g.sellerName,
                  developerExternalIds: g.developerExternalIds,
                  savePaths: g.savePaths,
                  launchExe: g.launchExe,
                  contentType: g.contentType,
                }]
              : [{
                  source: 'epic',
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
          // Batch match + save via shared utility
          const outcome = await batchMatchAndSave(mappedGames, desktopAPI, API_BASE)
          setStatus((prev: any) => ({
            ...prev,
            total: result.total,
            last_scan_total: result.total,
            matched: outcome.matched,
          }))
          // Notify matching section to refresh
          window.dispatchEvent(new CustomEvent('scanned-games-updated'))
        } else if (result?.success) {
          setStatus((prev: any) => ({ ...prev, total: result.total || 0, last_scan_total: result.total || 0, matched: 0 }))
        }
      }

      // ── Logout ──
      else if (action === 'logout') {
        await pluginApi.callData(entry.pluginId, actionMethod)
        setStatus({ connected: false })
        setScanProgress(null)
      }

      // ── Generic action ──
      else {
        await pluginApi.callData(entry.pluginId, actionMethod)
      }
    } catch (err) {
      console.error('[PluginSlot] action failed:', action, err)
    } finally {
      setLoading(false)
    }
  }

  const connected = status?.authenticated || status?.connected

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <Gamepad2 className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{entry.data?.label || entry.label}</p>
            <span className={'inline-flex items-center gap-1 text-[0.625rem] rounded-full px-1.5 py-0.5 ' + (connected ? 'text-green-400 bg-green-500/10' : 'text-white/40 bg-white/5')}>
              <span className={"h-1.5 w-1.5 rounded-full " + (connected ? 'bg-green-500' : 'bg-white/20')} />
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          {connected && status?.total != null && (
            <p className="text-xs text-white/40 mt-0.5">
              {status.total} items{status.matched != null ? ` · ${status.matched} matched` : ''}
            </p>
          )}
          {connected && status?.displayName && (
            <p className="text-xs text-white/40 mt-0.5">{status.displayName}</p>
          )}
          {scanProgress && scanProgress.phase !== 'idle' && scanProgress.phase !== 'done' && (
            <div className="mt-1.5">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {scanProgress.phase === 'library' ? 'Fetching library...' :
                 scanProgress.phase === 'enriching' ? `Enriching (${scanProgress.current}/${scanProgress.total})` :
                 scanProgress.phase === 'local-scan' ? 'Scanning local installs...' :
                 scanProgress.phase === 'merging' ? 'Merging results...' :
                 'Scanning...'}
              </div>
              {scanProgress.total > 0 && (
                <div className="mt-1 h-0.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, (scanProgress.current / scanProgress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <button onClick={() => handleAction('scan')} disabled={loading || !!scanProgress}
                className="inline-flex items-center gap-1.5 h-7 rounded-lg px-2.5 text-[0.625rem] font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50">
                {loading && !scanProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Scan
              </button>
              {entry.data?.actions?.logout && (
                <button onClick={() => handleAction('logout')} disabled={loading}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            entry.data?.actions?.login && (
              <button onClick={() => handleAction('login')} disabled={loading}
                className="inline-flex items-center gap-1.5 h-7 rounded-lg px-3 text-[0.625rem] font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50">
                Sign In
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
