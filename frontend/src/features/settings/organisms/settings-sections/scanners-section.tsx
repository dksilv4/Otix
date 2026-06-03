import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Disc, Monitor, Gamepad2, Folder, Check, X } from "lucide-react"
import { getScanPaths, setScanPaths, getIsoPaths, setIsoPaths, getScannedGames, setScannedGames, hasElectronAPI, rejectSuggestion, filterRejectedSuggestions } from "@/features/game-scanner/storage"
import { useMatchLocalGames } from "@/features/game-scanner/queries"
import { apiClient } from "@/lib/api-client"
import type { DetectedGame } from "@/features/game-scanner/types"

interface ScanPath {
  path: string
  type: "game" | "iso"
}

export function ScannersSection() {
  const [gamePaths, setGamePathsState] = useState<string[]>(() => getScanPaths())
  const [isoPaths, setIsoPathsState] = useState<string[]>(() => getIsoPaths())
  const [scanning, setScanning] = useState(false)
  const [scannedGames, setScannedGamesState] = useState<DetectedGame[]>(() => getScannedGames())
  const [gameCount, setGameCount] = useState(() => scannedGames.length)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [matchingGameId, setMatchingGameId] = useState<string | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [matchResults, setMatchResults] = useState<{ id: string; title: string; slug?: string; posterUrl?: string | null }[] | null>(null)
  const [searching, setSearching] = useState(false)
  const matchSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(() => {
    try {
      return localStorage.getItem("otix_last_scan_time")
    } catch { return null }
  })

  const isElectron = hasElectronAPI()

  // Keep game count and scanned list in sync
  useEffect(() => {
    const interval = setInterval(() => {
      const games = getScannedGames()
      setScannedGamesState(games)
      setGameCount(games.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleAddGamePath = useCallback(async () => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    const dir = await api.selectDirectory()
    if (!dir) return
    const updated = [...gamePaths, dir]
    setGamePathsState(updated)
    setScanPaths(updated)
  }, [gamePaths, isElectron])

  const handleRemoveGamePath = useCallback((path: string) => {
    const updated = gamePaths.filter((p) => p !== path)
    setGamePathsState(updated)
    setScanPaths(updated)
  }, [gamePaths])

  const handleAddIsoPath = useCallback(async () => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    const dir = await api.selectDirectory()
    if (!dir) return
    const updated = [...isoPaths, dir]
    setIsoPathsState(updated)
    setIsoPaths(updated)
  }, [isoPaths, isElectron])

  const handleRemoveIsoPath = useCallback((path: string) => {
    const updated = isoPaths.filter((p) => p !== path)
    setIsoPathsState(updated)
    setIsoPaths(updated)
  }, [isoPaths])

  // ── Match / unmatch ─────────────────────────────────────────────────

  const matchMutation = useMatchLocalGames()
  const [matching, setMatching] = useState(false)

  const handleMatchAll = useCallback(async () => {
    setMatching(true)
    try {
      let result = await matchMutation.mutateAsync(scannedGames)
      if (!result) return
      result = filterRejectedSuggestions(result)
      setScannedGames(result)
      setScannedGamesState(result)
    } catch (err) {
      console.error("Match failed:", err)
    } finally {
      setMatching(false)
    }
  }, [scannedGames, matchMutation])

  const handleVerifyAll = useCallback(() => {
    const updated = scannedGames.map((g) =>
      g.otixMediaId && !g.otixMatchVerified
        ? { ...g, otixMatchVerified: true }
        : g,
    )
    setScannedGames(updated)
    setScannedGamesState(updated)
  }, [scannedGames])

  const handleAcceptSuggestion = useCallback((game: DetectedGame) => {
    if (!game.otixMatchSuggestion) return
    const sug = game.otixMatchSuggestion
    const updated = scannedGames.map((g) =>
      g.id === game.id
        ? {
            ...g,
            otixMediaId: sug.mediaId,
            otixMediaTitle: sug.title,
            otixMediaSlug: sug.slug,
            otixPosterUrl: game.otixPosterUrl,
            otixTextlessPosterUrl: game.otixTextlessPosterUrl,
            otixLogoUrl: game.otixLogoUrl,
            otixConfidence: game.otixConfidence,
            otixMatchVerified: true,
            otixMatchSuggestion: undefined,
          }
        : g,
    )
    setScannedGames(updated)
    setScannedGamesState(updated)
  }, [scannedGames])

  const handleUnmatch = useCallback((game: DetectedGame) => {
    const updated = scannedGames.map((g) =>
      g.id === game.id
        ? {
            ...g,
            otixMediaId: undefined,
            otixMediaTitle: undefined,
            otixMediaSlug: undefined,
            otixPosterUrl: undefined,
            otixTextlessPosterUrl: undefined,
            otixLogoUrl: undefined,
            otixConfidence: undefined,
            otixMatchSuggestion: undefined,
          }
        : g,
    )
    setScannedGames(updated)
    setScannedGamesState(updated)
  }, [scannedGames])

  // ── Manual match search ────────────────────────────────────────────

  const handleOpenMatchSearch = useCallback((game: DetectedGame) => {
    setMatchingGameId(game.id)
    setMatchSearch(game.title)
    setMatchResults(null)
    // Auto-search with the game title
    apiClient.get<{ items: { id: string; title: string; slug?: string; poster_url?: string | null }[] }>("/media/search", {
      params: { q: game.title, media_type: "game", page_size: 8 },
    }).then(({ data }) => {
      setMatchResults((data.items ?? []).map((item) => ({ id: item.id, title: item.title, slug: item.slug || "", posterUrl: item.poster_url })))
    }).catch(() => {})
  }, [])

  const handleMatchSearchChange = useCallback((query: string) => {
    setMatchSearch(query)
    if (matchSearchTimer.current) clearTimeout(matchSearchTimer.current)
    if (!query.trim()) { setMatchResults(null); return }
    setSearching(true)
    matchSearchTimer.current = setTimeout(() => {
      apiClient.get<{ items: { id: string; title: string; slug?: string; poster_url?: string | null }[] }>("/media/search", {
        params: { q: query, media_type: "game", page_size: 8 },
      }).then(({ data }) => {
        setMatchResults((data.items ?? []).map((item) => ({ id: item.id, title: item.title, slug: item.slug || "", posterUrl: item.poster_url })))
        setSearching(false)
      }).catch(() => { setSearching(false) })
    }, 300)
  }, [])

  const handleManualMatch = useCallback((gameId: string, media: { id: string; title: string; slug?: string; posterUrl?: string | null }) => {
    const updated = scannedGames.map((g) =>
      g.id === gameId
        ? {
            ...g,
            otixMediaId: media.id,
            otixMediaTitle: media.title,
            otixMediaSlug: media.slug || media.title.toLowerCase().replace(/\s+/g, "-"),
            otixPosterUrl: media.posterUrl || undefined,
            otixConfidence: 1,
            otixMatchVerified: true,
            otixMatchSuggestion: undefined,
          }
        : g,
    )
    setScannedGames(updated)
    setScannedGamesState(updated)
    setMatchingGameId(null)
    setMatchResults(null)
    setMatchSearch("")
  }, [scannedGames])

  const handleScan = useCallback(async () => {
    if (!isElectron) return
    setScanning(true)
    try {
      const api = (window as any).electronAPI
      const scanned = await api.scanPaths(gamePaths, isoPaths)
      if (scanned && scanned.length > 0) {
        setScannedGames(scanned)
        setScannedGamesState(scanned)
        setGameCount(scanned.length)
      }
      const now = new Date().toLocaleString()
      setLastScan(now)
      localStorage.setItem("otix_last_scan_time", now)

      // Seed backend with scanned game titles (fire-and-forget)
      if (scanned && scanned.length > 0) {
        const titles = [...new Set(scanned.map((g: any) => g.title))]
        apiClient.post("/media/seed-from-titles", { titles }).catch(() => {})
      }

      // Auto-match against catalog
      if (scanned && scanned.length > 0) {
        try {
          const result = await matchMutation.mutateAsync(scanned)
          if (result) {
            setScannedGames(result)
            setScannedGamesState(result)
          }
        } catch {
          // match is best-effort
        }
      }
    } catch (err) {
      console.error("Scan failed:", err)
    } finally {
      setScanning(false)
    }
  }, [gamePaths, isoPaths, isElectron, matchMutation])

  const handleDeleteAllGames = useCallback(async () => {
    setScannedGames([])
    setScannedGamesState([])
    setGameCount(0)
    localStorage.removeItem("otix_scanned_games")
    if (hasElectronAPI()) {
      (window as any).electronAPI.saveScannedGames([]).catch(() => {})
    }
  }, [])

  // Derived groups for the match UI
  const verifiedMatched = useMemo(() => scannedGames.filter((g) => g.otixMediaId && g.otixMatchVerified), [scannedGames])
  const autoMatched = useMemo(() => scannedGames.filter((g) => g.otixMediaId && !g.otixMatchSuggestion && !g.otixMatchVerified), [scannedGames])
  const suggestedGames = useMemo(() => scannedGames.filter((g) => g.otixMatchSuggestion), [scannedGames])
  const unmatchedGames = useMemo(() => scannedGames.filter((g) => !g.otixMediaId && !g.otixMatchSuggestion), [scannedGames])

  // Platform breakdown of scanned games
  const platformBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of scannedGames) {
      counts[g.platform] = (counts[g.platform] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [scannedGames])

  const platformLabels: Record<string, string> = {
    steam: "Steam", pc: "PC", iso: "ISO", epic: "Epic",
    gog: "GOG", battlenet: "Battle.net", ubisoft: "Ubisoft",
    ea: "EA", riot: "Riot", xbox: "Xbox", itch: "itch.io",
  }

  const PlatformIcon = ({ platform, className }: { platform: string; className?: string }) => {
    const cls = className || "w-3.5 h-3.5"
    switch (platform) {
      case "steam":
        return (
          <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 1.8.6 3.45 1.61 4.77l2.14-.88a1.75 1.75 0 0 1-.28-.55l-.06-.22-2.1.86A6.5 6.5 0 0 1 8 1.5c3.59 0 6.5 2.91 6.5 6.5s-2.91 6.5-6.5 6.5a6.47 6.47 0 0 1-4.27-1.58l-.08.04-.03-.02 1.13-.47a5.5 5.5 0 1 0 5.13-9.87 5.5 5.5 0 0 0-3.8.07l-1.26-.51A6.98 6.98 0 0 1 8 0Zm-1.73 9.94.55-.23a2.5 2.5 0 0 1-1.34-1.34l-.23.55.68.28.34.74Zm.98.41.28-.68A2.47 2.47 0 0 1 8 9.64a2.48 2.48 0 0 1 .57-.06l1.57-.65a1 1 0 0 0-.27-1.96 1 1 0 0 0-.97.77l-1.66.69a2.48 2.48 0 0 1 1.01 2.36Z" />
          </svg>
        )
      case "epic":
        return (
          <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
            <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm1.5 4.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S8 6.83 8 6s.67-1.5 1.5-1.5ZM5 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm-4 2.5c-1.93 0-3.5-1.57-3.5-3.5S6.57 6.5 8.5 8.5 12 10.07 12 12s-1.57 3.5-3.5 3.5Z" />
          </svg>
        )
      case "gog":
        return (
          <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
            <circle cx="8" cy="8" r="7.5" />
            <text x="8" y="10.5" textAnchor="middle" fontSize="6" fontWeight="bold" fill="white">G</text>
          </svg>
        )
      case "xbox":
        return (
          <svg viewBox="0 0 16 16" fill="currentColor" className={cls}>
            <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.5 11.5c-1.3 0-2-.7-3-1.5s-1.7-1.5-3-1.5c-1 0-1.5.3-1.5.3s-.2.4-.2.9c0 .9.8 2.3 2.3 2.3 1.1 0 1.7-.5 2.4-.5s1.3.5 2.4.5c1 0 1.8-.6 2-1.5 0-.6-.2-1-.2-1s-.8-.5-1.2-.5Z" />
          </svg>
        )
      case "pc":
        return <Monitor className={cls} />
      case "iso":
        return <Disc className={cls} />
      default:
        return <Gamepad2 className={cls} />
    }
  }

  if (!isElectron) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Scan directory management is only available in the Otix desktop app.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em]">Scanners</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage directories where Otix scans for games and ISO files.
        </p>
      </div>

      {/* Game scan directories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Game Directories</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Folders containing installed games (Steam, GOG, Epic, PC executables)
            </p>
          </div>
          <button
            onClick={handleAddGamePath}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            + Add Folder
          </button>
        </div>

        {gamePaths.length === 0 ? (
          <div className="rounded-xl p-6 text-center">
            <p className="text-xs text-muted-foreground/50">No game directories configured</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {gamePaths.map((path) => (
              <div
                key={path}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{path}</span>
                </div>
                <button
                  onClick={() => handleRemoveGamePath(path)}
                  className="text-muted-foreground/40 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                  title="Remove directory"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ISO directories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">ISO Directories</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Folders containing ISO disc images for installation
            </p>
          </div>
          <button
            onClick={handleAddIsoPath}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            + Add Folder
          </button>
        </div>

        {isoPaths.length === 0 ? (
          <div className="rounded-xl p-6 text-center">
            <p className="text-xs text-muted-foreground/50">No ISO directories configured</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {isoPaths.map((path) => (
              <div
                key={path}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Disc className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{path}</span>
                </div>
                <button
                  onClick={() => handleRemoveIsoPath(path)}
                  className="text-muted-foreground/40 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                  title="Remove directory"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scan action */}
      <div className="flex items-center justify-between rounded-xl bg-emerald-500/5 p-4">
        <div>
          <p className="text-sm font-medium">Ready to Scan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gameCount} games currently in library
            {lastScan && ` · Last scan: ${lastScan}`}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || (gamePaths.length === 0 && isoPaths.length === 0)}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {scanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {/* ── Library overview ── */}
      {scannedGames.length > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-semibold text-white/70">Library</span>
              <span className="text-emerald-400/60">{verifiedMatched.length} verified</span>
              <span className="text-emerald-400/30">{autoMatched.length} auto</span>
              <span className="text-blue-400/60">{suggestedGames.length} suggestions</span>
              <span className="text-muted-foreground/40">{unmatchedGames.length} unmatched</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-muted-foreground/30">{scannedGames.length} total</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMatchAll}
                disabled={matching}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {matching ? "Matching..." : "Match All"}
              </button>
              <button
                onClick={handleVerifyAll}
                disabled={autoMatched.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Verify{autoMatched.length > 0 ? ` ${autoMatched.length}` : ""}
              </button>
              <button
                onClick={handleDeleteAllGames}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
              >
                Delete All
              </button>
            </div>
          </div>

          {/* Platform chips */}
          <div className="flex flex-wrap gap-1.5">
            {platformBreakdown.map(([platform, count]) => (
              <span
                key={platform}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/[0.04] text-muted-foreground/60"
              >
                <PlatformIcon platform={platform} />
                {platformLabels[platform] || platform}
                <span className="font-medium ml-0.5 text-muted-foreground/40">{count}</span>
              </span>
            ))}
          </div>

          {/* ── Suggestions (most actionable) ── */}
          {suggestedGames.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-blue-400/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60" />
                Suggestions — review and accept or reject
              </h4>
              <div className="space-y-2">
                {suggestedGames.map((game) => {
                  const suggestion = game.otixMatchSuggestion
                  const posterUrl = game.otixPosterUrl
                  return (
                    <div
                      key={game.id}
                      className="flex items-stretch gap-3 rounded-lg bg-blue-500/[0.04] p-2.5"
                    >
                      {/* Suggested media poster */}
                      <div className="flex-shrink-0 w-10 rounded overflow-hidden bg-white/[0.04]">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt=""
                            className="w-10 h-14 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <div className="w-10 h-14 flex items-center justify-center text-[10px] font-bold text-muted-foreground/20">
                            ?
                          </div>
                        )}
                      </div>

                      {/* Game vs suggestion text */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{game.title}</span>
                          <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                          <span className="text-muted-foreground/30">→</span>
                          <span className="font-medium text-blue-400/70 truncate">{suggestion?.title || "?"}</span>
                          <span className="text-blue-400/40 font-semibold ml-auto">
                            {Math.round((game.otixConfidence ?? 0) * 100)}%
                          </span>
                        </div>
                        {/* Confidence bar */}
                        <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden mt-0.5 max-w-[120px]">
                          <div
                            className="h-full rounded-full bg-blue-400/60"
                            style={{ width: `${Math.min(100, Math.round((game.otixConfidence ?? 0) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-stretch gap-1.5 flex-shrink-0 min-w-[72px]">
                        <button
                          onClick={() => handleAcceptSuggestion(game)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                        >
                          <Check size={12} /> Accept
                        </button>
                        <button
                          onClick={() => {
                            rejectSuggestion(game, game.otixMatchSuggestion?.mediaId ?? "")
                            const updated = scannedGames.map((g) =>
                              g.id === game.id ? { ...g, otixMatchSuggestion: undefined, otixConfidence: undefined } : g,
                            )
                            setScannedGames(updated)
                            setScannedGamesState(updated)
                          }}
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                        >
                          <X size={12} /> Deny
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Verified matched games ── */}
          {verifiedMatched.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                Verified ({verifiedMatched.length})
              </div>
              <div className="space-y-1.5">
                {verifiedMatched.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-stretch gap-3 rounded-lg bg-emerald-500/[0.03] p-2.5 hover:bg-emerald-500/[0.05] transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 rounded overflow-hidden bg-white/[0.04]">
                      {game.otixPosterUrl ? (
                        <img src={game.otixPosterUrl} alt="" className="w-8 h-11 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="w-8 h-11 flex items-center justify-center text-[8px] font-bold text-muted-foreground/20">?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{game.title}</span>
                        <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                        <span className="text-emerald-400/60">→</span>
                        <span className="font-medium text-emerald-400/70 truncate">{game.otixMediaTitle || "?"}</span>
                        {game.otixConfidence != null && (
                          <span className="text-muted-foreground/30 ml-auto">{Math.round(game.otixConfidence * 100)}%</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleUnmatch(game)} className="flex-shrink-0 self-center text-[10px] text-muted-foreground/30 hover:text-red-400 transition-colors px-1.5 py-1">Unmatch</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Auto-matched games ── */}
          {autoMatched.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400/40 hover:text-emerald-400/60 transition-colors"
              >
                <span className={`transition-transform ${showBreakdown ? "rotate-90" : ""}`}>▸</span>
                Auto-Matched ({autoMatched.length}) — review and verify
              </button>
              {showBreakdown && (
                <div className="space-y-1.5">
                  {autoMatched.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-stretch gap-3 rounded-lg bg-white/[0.02] p-2.5 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex-shrink-0 w-8 rounded overflow-hidden bg-white/[0.04]">
                        {game.otixPosterUrl ? (
                          <img src={game.otixPosterUrl} alt="" className="w-8 h-11 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div className="w-8 h-11 flex items-center justify-center text-[8px] font-bold text-muted-foreground/20">?</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{game.title}</span>
                          <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                          <span className="text-emerald-400/60">→</span>
                          <span className="font-medium text-emerald-400/70 truncate">{game.otixMediaTitle || "?"}</span>
                          {game.otixConfidence != null && (
                            <span className="text-muted-foreground/30 ml-auto">{Math.round(game.otixConfidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            const updated = scannedGames.map((g) =>
                              g.id === game.id ? { ...g, otixMatchVerified: true } : g,
                            )
                            setScannedGames(updated)
                            setScannedGamesState(updated)
                          }}
                          className="text-[10px] font-medium text-emerald-400/60 hover:text-emerald-400 transition-colors px-1.5 py-1"
                        >
                          Verify
                        </button>
                        <button onClick={() => handleUnmatch(game)} className="text-[10px] text-muted-foreground/30 hover:text-red-400 transition-colors px-1.5 py-1">Unmatch</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Unmatched games ── */}
          {unmatchedGames.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
              >
                <span className={`transition-transform ${showBreakdown ? "rotate-90" : ""}`}>▸</span>
                Unmatched ({unmatchedGames.length})
              </button>
              {showBreakdown && (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {unmatchedGames.map((game) => (
                    <div key={game.id}>
                      <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlatformIcon platform={game.platform} className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground/70 truncate">{game.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[10px] text-muted-foreground/20 uppercase tracking-wider">
                            {platformLabels[game.platform] || game.platform}
                          </span>
                          <button
                            onClick={() => handleOpenMatchSearch(game)}
                            className="text-[10px] font-medium text-blue-400/60 hover:text-blue-400 transition-colors"
                          >
                            Find Match
                          </button>
                        </div>
                      </div>

                      {/* Inline match search panel */}
                      {matchingGameId === game.id && (
                        <div className="ml-5 mt-1 mb-2 p-2.5 rounded-lg bg-white/[0.03] space-y-2">
                          <input
                            type="text"
                            value={matchSearch}
                            onChange={(e) => handleMatchSearchChange(e.target.value)}
                            placeholder="Search Otix catalog..."
                            className="w-full bg-white/[0.06] rounded px-2.5 py-1.5 text-xs text-white/70 placeholder:text-muted-foreground/30 outline-none focus:bg-white/[0.08] transition-colors"
                            autoFocus
                          />
                          {searching && (
                            <p className="text-[10px] text-muted-foreground/30 text-center py-2">Searching...</p>
                          )}
                          {matchResults && matchResults.length === 0 && !searching && (
                            <p className="text-[10px] text-muted-foreground/30 text-center py-2">No results found</p>
                          )}
                          {matchResults && matchResults.length > 0 && !searching && (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {matchResults.map((result) => (
                                <div
                                  key={result.id}
                                  className="flex items-center gap-2.5 rounded bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.06] transition-colors cursor-pointer"
                                  onClick={() => handleManualMatch(game.id, result)}
                                >
                                  <div className="w-6 h-8 rounded overflow-hidden bg-white/[0.04] flex-shrink-0">
                                    {result.posterUrl ? (
                                      <img src={result.posterUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground/20">?</div>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-white/70 truncate">{result.title}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleManualMatch(game.id, result) }}
                                    className="ml-auto text-[10px] font-medium text-emerald-400/70 hover:text-emerald-400 flex-shrink-0"
                                  >
                                    Match
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => { setMatchingGameId(null); setMatchResults(null); setMatchSearch("") }}
                            className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
