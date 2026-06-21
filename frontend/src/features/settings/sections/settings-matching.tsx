import { useEffect, useState, useCallback, useRef } from 'react'
import { Shuffle, Loader2, RefreshCw, Gamepad2, Library } from 'lucide-react'

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
  totalGames?: number
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
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [scanErrors, setScanErrors] = useState<Record<string, string | null>>({})
  const [matchResults, setMatchResults] = useState<Record<string, { matchedTitle: string; confidence: number; posterUrl?: string }>>({})
  const [matchProgress, setMatchProgress] = useState<{ total: number; matched: number; candidates: number; failed: number } | null>(null)
  const api = window.desktopAPI

  // Load matching:scan slot plugins
  useEffect(() => {
    api?.plugin?.getSlotData?.('matching:scan').then((slots: ScanPlugin[]) => {
      setPlugins(slots || [])
    })
  }, [api])

  // Subscribe to per-game progress events — drive the progress bar
  useEffect(() => {
    if (!api?.onMatchingProgress) return
    const unsub = api.onMatchingProgress((event: ScanProgress) => {
      // Store match results for display
      if (event.match) {
        setMatchResults(prev => ({
          ...prev,
          [event.queryTitle || event.queryId]: {
            matchedTitle: event.match.title,
            confidence: event.match.confidence,
            posterUrl: event.match.poster_url,
          },
        }))
      }
      // Accumulate progress counts from per-game status, use totalGames from backend
      setMatchProgress(prev => ({
        total: event.totalGames ?? (prev?.total ?? 0) + 1,
        matched: (prev?.matched ?? 0) + (event.status === 'matched' ? 1 : 0),
        candidates: (prev?.candidates ?? 0) + ((event.status === 'candidates' || event.status === 'unmatched') ? 1 : 0),
        failed: (prev?.failed ?? 0) + ((event.status === 'failed' || event.status === 'error') ? 1 : 0),
      }))
    })
    return () => unsub?.()
  }, [api])

  // Subscribe to scan completion — set final counts, clear after delay
  useEffect(() => {
    if (!api?.onMatchingComplete) return
    const unsub = api.onMatchingComplete((event: any) => {
      setMatchProgress({
        total: event.total_games ?? event.totalGames ?? event.total ?? 0,
        matched: event.matched_count ?? event.matchedCount ?? event.matched ?? 0,
        candidates: event.unmatched_count ?? event.candidatesCount ?? event.candidates ?? 0,
        failed: event.errored_count ?? event.erroredCount ?? event.failed ?? 0,
      })
      setTimeout(() => { try { setMatchProgress(null) } catch {} }, 5000)
    })
    return () => unsub?.()
  }, [api])

  const handleScan = useCallback(async (pluginId: string) => {
    setScanning(prev => ({ ...prev, [pluginId]: true }))
    setScanErrors(prev => ({ ...prev, [pluginId]: null }))
    setMatchResults({})
    setMatchProgress(null)
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
              <div className="flex items-center gap-1.5">
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
                <a
                  href={'/settings/matching/games?source=' + plugin.data?.platform || plugin.pluginId}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  title="View scanned games"
                >
                  <Library className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        )
      })}

      {/* Matching progress bar */}
      {matchProgress && (
        <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70 font-medium">Matching games</span>
            <span className="text-white/40">
              {matchProgress.matched + matchProgress.candidates + matchProgress.failed}/{matchProgress.total}
              {matchProgress.total > 0 && (
                <span className="ml-1 text-white/30">
                  ({Math.round(((matchProgress.matched + matchProgress.candidates + matchProgress.failed) / matchProgress.total) * 100)}%)
                </span>
              )}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
            <div
              className="h-full bg-green-500 transition-all duration-300 ease-out"
              style={{ width: `${(matchProgress.matched / Math.max(1, matchProgress.total)) * 100}%` }}
              title={`Matched: ${matchProgress.matched}`}
            />
            <div
              className="h-full bg-yellow-500 transition-all duration-300 ease-out"
              style={{ width: `${(matchProgress.candidates / Math.max(1, matchProgress.total)) * 100}%` }}
              title={`Candidates: ${matchProgress.candidates}`}
            />
            <div
              className="h-full bg-red-500 transition-all duration-300 ease-out"
              style={{ width: `${(matchProgress.failed / Math.max(1, matchProgress.total)) * 100}%` }}
              title={`Failed: ${matchProgress.failed}`}
            />
          </div>
          <div className="flex gap-4 text-xs text-white/40">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" /> {matchProgress.matched} matched
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" /> {matchProgress.candidates} candidates
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {matchProgress.failed} failed
            </span>
          </div>
        </div>
      )}

      {/* Match results summary — shown after scan completes */}
      {Object.keys(matchResults).length > 0 && !matchProgress && (
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
    </div>
  )
}
