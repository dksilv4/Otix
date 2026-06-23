import { useEffect, useState, useCallback, useRef } from 'react'
import { Shuffle, Loader2, RefreshCw, Gamepad2, Library, ExternalLink, XCircle } from 'lucide-react'
import { useModal } from '@/lib/modals'
import { CandidateReviewModal } from '@/features/settings/components/organisms/settings-candidate-review-modal'
import type { LocalGame } from '@/old-features/game-scanner/types'

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
  display_name?: string
  displayName?: string
  label?: string
  lastScanAt?: number
  lastScanTotal?: number
  last_scan_at?: number
  last_scan_total?: number
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

// ── Persisted store (localStorage) — survives full page reloads and SPA nav ──
const STORAGE_KEY = 'otix:matching-progress'
const RESULTS_KEY = 'otix:matching-results'
const SCANNING_KEY = 'otix:matching-scanning'
function loadProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} } }
function saveProgress(v: any) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch {} }
function loadResults() { try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}') } catch { return {} } }
function saveResults(v: any) { try { localStorage.setItem(RESULTS_KEY, JSON.stringify(v)) } catch {} }
function loadScanning() { try { return JSON.parse(localStorage.getItem(SCANNING_KEY) || '{}') } catch { return {} } }
function saveScanning(v: any) { try { localStorage.setItem(SCANNING_KEY, JSON.stringify(v)) } catch {} }
function clearPersistedScanData() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  try { localStorage.removeItem(RESULTS_KEY) } catch {}
  try { localStorage.removeItem(SCANNING_KEY) } catch {}
}

export function MatchingScanSection() {
  const [plugins, setPlugins] = useState<ScanPlugin[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScanStatus>>({})
  const [scanning, setScanningRaw] = useState<Record<string, boolean>>(loadScanning)
  const [scanErrors, setScanErrors] = useState<Record<string, string | null>>({})

  // Use a ref for scanning so callbacks don't need it as a dependency
  const scanningRef = useRef(scanning)
  scanningRef.current = scanning

  const setScanning = useCallback((v: any) => {
    setScanningRaw((prev: any) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveScanning(next)
      scanningRef.current = next
      return next
    })
  }, [])
  const [internalResults, setInternalResults] = useState(loadResults)
  const [internalProgress, setInternalProgress] = useState(loadProgress)

  // Sync to localStorage for persistence across routes/reloads
  const setMatchResults = useCallback((v: any) => {
    setInternalResults((prev: any) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveResults(next)
      return next
    })
  }, [])
  const setMatchProgress = useCallback((v: any) => {
    setInternalProgress((prev: any) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveProgress(next)
      return next
    })
  }, [])
  const matchResults = internalResults
  const matchProgress = internalProgress

  const api = window.desktopAPI

  const { openModal } = useModal()
  const [postScanGames, setPostScanGames] = useState<LocalGame[]>([])
  const [postScanPlatform, setPostScanPlatform] = useState<string | null>(null)

  const handleGameClick = useCallback((game: LocalGame) => {
    const close = openModal(
      <CandidateReviewModal
        game={game}
        onClose={() => close()}
        onMatchResolved={() => {
          if (postScanPlatform && api?.getGames) {
            api.getGames({ platform: [postScanPlatform] }).then((games: LocalGame[]) => {
              setPostScanGames(games || [])
            }).catch(() => {})
          }
        }}
      />
    )
  }, [api, openModal, postScanPlatform])

  // Load matching:scan slot plugins
  useEffect(() => {
    api?.plugin?.getSlotData?.('matching:scan').then((slots: ScanPlugin[]) => {
      setPlugins(slots || [])
    })
  }, [api])

  // Subscribe to per-game progress events — accumulate progress
  useEffect(() => {
    if (!api?.onMatchingProgress) return
    const unsub = api.onMatchingProgress((event: ScanProgress) => {
      const pid = event.pluginId
      // Store match results for display
      if (event.match) {
        setMatchResults(prev => ({...prev, 
          [event.queryTitle || event.queryId]: { matchedTitle: event.match.title, confidence: event.match.confidence, posterUrl: event.match.poster_url },
        }))
      }
      // Accumulate per-plugin progress
      setMatchProgress(prev => {
        const current = prev[pid] || { total: event.totalGames ?? 0, matched: 0, candidates: 0, failed: 0 }
        return {...prev, [pid]: {
          total: event.totalGames ?? current.total,
          matched: current.matched + (event.status === "matched" ? 1 : 0),
          candidates: current.candidates + ((event.status === "candidates" || event.status === "unmatched") ? 1 : 0),
          failed: current.failed + ((event.status === "failed" || event.status === "error") ? 1 : 0),
        }}
      })
    })
    return () => unsub?.()
  }, [api])
    // Subscribe to scan completion — set final counts per plugin + fetch results
  useEffect(() => {
    if (!api?.onMatchingComplete) return
    const unsub = api.onMatchingComplete((event: any) => {
      const pid = event.pluginId
      setMatchProgress(prev => ({
        ...prev,
        [pid]: {
          total: event.total_games ?? event.totalGames ?? event.total ?? 0,
          matched: event.matched_count ?? event.matchedCount ?? event.matched ?? 0,
          candidates: event.unmatched_count ?? event.candidatesCount ?? event.candidates ?? 0,
          failed: event.errored_count ?? event.erroredCount ?? event.failed ?? 0,
        },
      }))
      // Fetch post-scan games for inline results display
      const plugin = plugins.find(p => p.pluginId === pid)
      const platform = plugin?.data?.platform || pid
      setPostScanPlatform(platform)
      if (api?.getGames) {
        api.getGames({ platform: [platform] }).then((games: LocalGame[]) => {
          setPostScanGames(games || [])
        }).catch(() => {})
      }
    })
    return () => unsub?.()
  }, [api, plugins])

  // Subscribe to scan cancellation
  useEffect(() => {
    if (!api?.onMatchingCancelled) return
    const unsub = api.onMatchingCancelled(() => {
      setScanning({})
      clearPersistedScanData()
    })
    return () => unsub?.()
  }, [api])

  const handleScan = useCallback(async (pluginId: string) => {
    // If already scanning, don't reset progress — events are already flowing
    if (scanningRef.current[pluginId]) return
    setScanning(prev => ({ ...prev, [pluginId]: true }))
    setScanErrors(prev => ({ ...prev, [pluginId]: null }))
    setMatchResults({})
    setMatchProgress(prev => { const next = { ...prev }; delete next[pluginId]; return next })
    try {
      const result: any = await api?.scanPlugin?.(pluginId)
      // If scan returned empty (already running or no games), keep scanning state
      // so the button shows spinner — events/status check will clear it
      if (result && result.totalGames === 0 && result.matched === 0 && result.unmatched === 0) {
        // Scan is either already in progress or found nothing; keep scanning state
        // The status check useEffect will clear it when scan actually finishes
        return
      }
    } catch (err: any) {
      setScanErrors(prev => ({ ...prev, [pluginId]: err?.message || 'Scan failed' }))
    }
    // Only set scanning=false here if we didn't return early (i.e., scan finished or errored).
    // If we returned early, the events/status check will clear scanning.
    setScanning(prev => ({ ...prev, [pluginId]: false }))
  }, [api])

  const handleCancelScan = useCallback(async () => {
    await api?.cancelScan?.()
    setScanning({})
    clearPersistedScanData()
  }, [api])

  // Re-hydrate scanning state on mount — check if scan is still running in background
  useEffect(() => {
    if (!api?.plugin) return
    // Restore persisted progress
    const persisted = loadProgress()
    if (Object.keys(persisted).length > 0) {
      setInternalProgress(persisted)
    }
    // Restore persisted scanning state
    const persistedScanning = loadScanning()
    if (Object.keys(persistedScanning).length > 0) {
      setScanningRaw(persistedScanning)
    }
    // Check each plugin for active scans and update state
    for (const p of plugins) {
      api.plugin.callData?.(p.pluginId, 'scan.status').then((s: any) => {
        if (s?.phase && s.phase !== 'idle' && s.phase !== 'done' && s.phase !== 'error') {
          setScanning(prev => ({ ...prev, [p.pluginId]: true }))
        } else {
          setScanning(prev => { const next = { ...prev }; delete next[p.pluginId]; return next })
        }
      }).catch(() => {})
    }
  }, [api, plugins])

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
                    ? `Connected as ${status.display_name || status.displayName || status.label || status.connected}`
                    : 'Not connected'}
                </p>
                {(() => {
                  const lastScanAt = status?.lastScanAt || status?.last_scan_at
                  const lastScanTotal = status?.lastScanTotal ?? status?.last_scan_total
                  return lastScanAt ? (
                    <p className="text-xs text-muted-foreground">
                      Last scan: {new Date(Number(lastScanAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {lastScanTotal != null && ` — ${lastScanTotal} games`}
                    </p>
                  ) : null
                })()}
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
                {isScanning && (
                  <button
                    onClick={handleCancelScan}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    title="Cancel scan"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                )}
                <a
                  href={'/settings/matching/games?source=' + plugin.data?.platform || plugin.pluginId}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  title="View scanned games"
                >
                  <Library className="h-4 w-4" />
                </a>
              </div>
            </div>
            {/* Per-plugin progress bar */}
            {matchProgress[plugin.pluginId] && (
              <div className="border-t border-white/5 mt-3 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">{matchProgress[plugin.pluginId].matched + matchProgress[plugin.pluginId].candidates + matchProgress[plugin.pluginId].failed}/{matchProgress[plugin.pluginId].total} games</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${(matchProgress[plugin.pluginId].matched / Math.max(1, matchProgress[plugin.pluginId].total)) * 100}%` }} />
                  <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(matchProgress[plugin.pluginId].candidates / Math.max(1, matchProgress[plugin.pluginId].total)) * 100}%` }} />
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${(matchProgress[plugin.pluginId].failed / Math.max(1, matchProgress[plugin.pluginId].total)) * 100}%` }} />
                </div>
                <div className="flex gap-3 text-[0.625rem] text-white/40">
                  <span><span className="text-green-500">●</span> {matchProgress[plugin.pluginId].matched} matched</span>
                  <span><span className="text-yellow-500">●</span> {matchProgress[plugin.pluginId].candidates} candidates</span>
                  <span><span className="text-red-500">●</span> {matchProgress[plugin.pluginId].failed} failed</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Post-scan results — inline game list with match status */}
      {postScanGames.length > 0 && Object.keys(scanning).every(k => !scanning[k]) && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white/70">
              Scan Results
              <span className="ml-2 text-xs font-normal text-white/40">
                {postScanGames.filter(g => !!(g.data?.id || g.otixMediaId)).length} matched,{' '}
                {postScanGames.filter(g => !!(g.otixMatchSuggestion || g.matchSuggestion) && !(g.data?.id || g.otixMediaId)).length} candidates,{' '}
                {postScanGames.filter(g => !(g.data?.id || g.otixMediaId) && !(g.otixMatchSuggestion || g.matchSuggestion)).length} unmatched
              </span>
            </h4>
            <a
              href={`/settings/matching/games?source=${postScanPlatform || ''}`}
              className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              View All <ExternalLink size={11} />
            </a>
          </div>

          {/* Compact game list (top 10) */}
          <div className="space-y-1 max-h-[320px] overflow-y-auto rounded-xl bg-white/[0.02] border border-white/[0.04]">
            {postScanGames.slice(0, 10).map((g) => {
              const matched = !!(g.data?.id || g.otixMediaId)
              const suggestion = g.otixMatchSuggestion || g.matchSuggestion
              const candidateCount = (suggestion as any)?._candidates?.length || (suggestion ? 1 : 0)
              const poster = g.posterUrl || g.iconUrl

              return (
                <button
                  key={g.id}
                  onClick={() => handleGameClick(g)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  {/* Thumbnail */}
                  <div className="w-8 h-10 rounded overflow-hidden shrink-0 bg-white/5">
                    {poster ? (
                      <img src={poster} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gamepad2 size={12} className="text-white/25" />
                      </div>
                    )}
                  </div>

                  {/* Title + platform */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white/80 truncate">{g.title}</p>
                    <p className="text-[10px] text-white/30 capitalize">{g.platform}</p>
                  </div>

                  {/* Status badge */}
                  {matched ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium shrink-0">
                      Matched
                    </span>
                  ) : candidateCount > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium shrink-0">
                      {candidateCount} candidate{candidateCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-medium shrink-0">
                      Unmatched
                    </span>
                  )}
                </button>
              )
            })}

            {postScanGames.length > 10 && (
              <a
                href={`/settings/matching/games?source=${postScanPlatform || ''}`}
                className="block text-center py-2 text-[10px] text-white/30 hover:text-white/50 transition-colors border-t border-white/[0.04]"
              >
                +{postScanGames.length - 10} more games — view all
              </a>
            )}
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
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Game Matching</h2>
            <a href="/settings/proposals" className="text-[11px] text-blue-400 hover:text-blue-300 font-medium">
              Review Proposals
            </a>
          </div>
          <p className="text-sm text-white/50 mt-0.5">
            Match scanned games to the Otix catalog
          </p>
        </div>
      </div>

      <MatchingScanSection />
    </div>
  )
}
