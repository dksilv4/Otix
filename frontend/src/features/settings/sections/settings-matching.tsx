import { useEffect, useState, useCallback } from 'react'
import { Shuffle, Loader2, RefreshCw, Gamepad2 } from 'lucide-react'
import { GameMatchingSection } from './settings-game-matching'
import { PluginSlot } from '../components/organisms/settings-plugin-slot'
import { getPluginAPI } from '../components/organisms/settings-plugin-settings'

// ── MatchingScanSection types ────────────────────────────────────────────

interface ScanPlugin {
  pluginId: string
  label: string
  data: {
    type: string
    platform: string
    label: string
    description?: string
  }
}

interface ScanStatus {
  connected: boolean
  label?: string
  lastScanAt?: number
  lastScanTotal?: number
}

interface ScanProgress {
  pluginId: string
  queryId: string
  status: string
  queryTitle?: string
  match?: {
    media_item_id: string
    title: string
    confidence: number
    poster_url?: string
  }
  candidates?: Array<{
    title: string
    confidence: number
    poster_url?: string
  }>
}

// ── MatchingScanSection ─────────────────────────────────────────────────

export function MatchingScanSection() {
  const [plugins, setPlugins] = useState<ScanPlugin[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScanStatus>>({})
  const [progress, setProgress] = useState<Record<string, ScanProgress>>({})
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [scanErrors, setScanErrors] = useState<Record<string, string | null>>({})
  const [matchResults, setMatchResults] = useState<Record<string, { matchedTitle: string; confidence: number; posterUrl?: string }>>({})
  const api = window.desktopAPI

  // Load matching:scan slot plugins
  useEffect(() => {
    api?.plugin?.getSlotData?.('matching:scan').then((slots: ScanPlugin[]) => {
      setPlugins(slots || [])
    })
  }, [api])

  // Subscribe to per-game progress events
  useEffect(() => {
    if (!api?.onMatchingProgress) return
    const unsub = api.onMatchingProgress((event: ScanProgress) => {
      setProgress(prev => ({ ...prev, [event.queryId]: event }))
      // Store match results for display
      if (event.match) {
        setMatchResults(prev => ({
          ...prev,
          [event.queryTitle || event.queryId]: {
            matchedTitle: event.match!.title,
            confidence: event.match!.confidence,
            posterUrl: event.match!.poster_url,
          },
        }))
      }
    })
    return () => unsub?.()
  }, [api])

  // Subscribe to scan completion — clear progress indicators
  useEffect(() => {
    if (!api?.onMatchingComplete) return
    const unsub = api.onMatchingComplete(() => {
      setProgress({})
    })
    return () => unsub?.()
  }, [api])

  const handleScan = useCallback(async (pluginId: string) => {
    setScanning(prev => ({ ...prev, [pluginId]: true }))
    setScanErrors(prev => ({ ...prev, [pluginId]: null }))
    setMatchResults({})
    setProgress({})
    try {
      await api?.scanPlugin?.(pluginId)
    } catch (err: any) {
      setScanErrors(prev => ({ ...prev, [pluginId]: err?.message || 'Scan failed' }))
    } finally {
      setScanning(prev => ({ ...prev, [pluginId]: false }))
    }
  }, [api])

  // Fetch plugin statuses
  useEffect(() => {
    for (const p of plugins) {
      api?.plugin?.getStatus?.(p.pluginId).then((s: Record<string, unknown> | null) => {
        if (s) setStatuses(prev => ({ ...prev, [p.pluginId]: s }))
      })
    }
  }, [api, plugins])

  if (!api?.plugin) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Desktop Only</p>
        <p className="text-xs text-muted-foreground mt-1">Game library scanning is only available in the desktop app.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Game Libraries</h3>

      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No game library plugins installed. Install plugins from the Plugin Store.
        </p>
      )}

      {plugins.map((plugin) => {
        const status = statuses[plugin.pluginId]
        const isScanning = scanning[plugin.pluginId]

        return (
          <div key={plugin.pluginId} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">{plugin.label}</h4>
                <p className="text-sm text-muted-foreground">
                  {status?.connected
                    ? `Connected as ${status.label || status.connected}`
                    : 'Not connected'}
                </p>
                {status?.lastScanAt && (
                  <p className="text-xs text-muted-foreground">
                    Last scan: {new Date(status.lastScanAt).toLocaleDateString()}
                    {status.lastScanTotal != null && ` — ${status.lastScanTotal} games`}
                  </p>
                )}
                {scanErrors[plugin.pluginId] && (
                  <p className="text-xs text-red-400 mt-1">{scanErrors[plugin.pluginId]}</p>
                )}
              </div>
              <button
                onClick={() => handleScan(plugin.pluginId)}
                disabled={isScanning || !status?.connected}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 text-sm font-medium"
              >
                {isScanning ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Scanning...</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Scan Library</span>
                )}
              </button>
            </div>
          </div>
        )
      })}

      {/* In-progress match events */}
      {Object.entries(progress).length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-foreground mb-2">Match Progress</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
            {Object.entries(progress).map(([queryId, event]) => (
              <div key={queryId} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  event.status === 'matched' ? 'bg-green-500' :
                  event.status === 'candidates' ? 'bg-yellow-500' :
                  event.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`} />
                <span className="text-foreground">{event.queryTitle || queryId}</span>
                <span className="text-xs text-muted-foreground ml-auto">{event.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match results summary — shown after scan completes */}
      {Object.keys(matchResults).length > 0 && Object.entries(progress).length === 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-foreground mb-2">Match Results</h4>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {Object.entries(matchResults).map(([gameTitle, result]) => (
              <div key={gameTitle} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                {result.posterUrl && (
                  <img src={result.posterUrl} alt="" className="w-10 h-14 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{gameTitle}</p>
                  <p className="text-xs text-muted-foreground truncate">→ {result.matchedTitle}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  result.confidence >= 0.95 ? 'bg-green-500/20 text-green-400' :
                  result.confidence >= 0.85 ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {(result.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MatchingSection (page-level composition) ────────────────────────────

export function MatchingSection() {
  return (
    <div className="space-y-6 min-h-full">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
          <Shuffle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Game Matching</h2>
          <p className="text-sm text-white/50 mt-0.5">
            Match scanned games to the Otix catalog
          </p>
        </div>
      </div>

      <MatchingScanSection />

      <GameMatchingSection />
    </div>
  )
}
