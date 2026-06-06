// TODO: Review this file
import './scanners-section.scss'
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Disc, Monitor, Gamepad2, Folder, Check, X } from "lucide-react"
import { getScanPaths, setScanPaths, getIsoPaths, setIsoPaths, getScannedGames, setScannedGames, getLastScanTime, setLastScanTime, hasDesktopAPI, rejectSuggestion, filterRejectedSuggestions } from "@/features/game-scanner/storage"
import { useMatchLocalGames } from "@/features/game-scanner/queries"
import { useClaimGame } from "@/features/library/library-queries"
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
  const [showAutoBreakdown, setShowAutoBreakdown] = useState(false)
  const [showUnmatchedBreakdown, setShowUnmatchedBreakdown] = useState(false)
  const [matchingGameId, setMatchingGameId] = useState<string | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [matchResults, setMatchResults] = useState<{ id: string; title: string; slug?: string; posterUrl?: string | null }[] | null>(null)
  const [searching, setSearching] = useState(false)
  const matchSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(() => getLastScanTime())

  const isDesktop = hasDesktopAPI()

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
    if (!isDesktop) return
    const api = (window as any).desktopAPI
    const dir = await api.selectDirectory()
    if (!dir) return
    const updated = [...gamePaths, dir]
    setGamePathsState(updated)
    setScanPaths(updated)
  }, [gamePaths, isDesktop])

  const handleRemoveGamePath = useCallback((path: string) => {
    const updated = gamePaths.filter((p) => p !== path)
    setGamePathsState(updated)
    setScanPaths(updated)
  }, [gamePaths])

  const handleAddIsoPath = useCallback(async () => {
    if (!isDesktop) return
    const api = (window as any).desktopAPI
    const dir = await api.selectDirectory()
    if (!dir) return
    const updated = [...isoPaths, dir]
    setIsoPathsState(updated)
    setIsoPaths(updated)
  }, [isoPaths, isDesktop])

  const handleRemoveIsoPath = useCallback((path: string) => {
    const updated = isoPaths.filter((p) => p !== path)
    setIsoPathsState(updated)
    setIsoPaths(updated)
  }, [isoPaths])

  // ── Match / unmatch ─────────────────────────────────────────────────

  const matchMutation = useMatchLocalGames()
  const claimMutation = useClaimGame()
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
    const newlyClaimed: string[] = []
    const withClaimed = scannedGames.map((g) => {
      if (!g.otixMediaId || g.otixMatchVerified) return g
      newlyClaimed.push(g.otixMediaId)
      return { ...g, otixMatchVerified: true, otixClaimed: true }
    })
    setScannedGames(withClaimed)
    setScannedGamesState(withClaimed)

    // Claim each newly verified game on the backend (fire-and-forget).
    for (const mediaId of newlyClaimed) {
      claimMutation.mutate(mediaId)
    }
  }, [scannedGames, claimMutation])

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
    // Claim the game on the backend (fire-and-forget), mark claimed locally
    const final = !game.otixClaimed
      ? updated.map((g) => (g.id === game.id ? { ...g, otixClaimed: true } : g))
      : updated
    setScannedGames(final)
    setScannedGamesState(final)

    if (!game.otixClaimed) {
      claimMutation.mutate(sug.mediaId)
    }
  }, [scannedGames, claimMutation])

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
    apiClient.get<{ items: { id: string; title: string; slug?: string; posterUrl?: string | null }[] }>("/media/search", {
      params: { q: game.title, media_type: "game", page_size: 8 },
    }).then(({ data }) => {
      setMatchResults((data.items ?? []).map((item) => ({ id: item.id, title: item.title, slug: item.slug || "", posterUrl: item.posterUrl })))
    }).catch(() => {})
  }, [])

  const handleMatchSearchChange = useCallback((query: string) => {
    setMatchSearch(query)
    if (matchSearchTimer.current) clearTimeout(matchSearchTimer.current)
    if (!query.trim()) { setMatchResults(null); return }
    setSearching(true)
    matchSearchTimer.current = setTimeout(() => {
      apiClient.get<{ items: { id: string; title: string; slug?: string; posterUrl?: string | null }[] }>("/media/search", {
        params: { q: query, media_type: "game", page_size: 8 },
      }).then(({ data }) => {
        setMatchResults((data.items ?? []).map((item) => ({ id: item.id, title: item.title, slug: item.slug || "", posterUrl: item.posterUrl })))
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

    // Claim the game on the backend (fire-and-forget), skip if already claimed
    if (!scannedGames.find((g) => g.id === gameId)?.otixClaimed) {
      claimMutation.mutate(media.id)
      const withClaimed = updated.map((g) =>
        g.id === gameId ? { ...g, otixClaimed: true } : g,
      )
      setScannedGames(withClaimed)
      setScannedGamesState(withClaimed)
    }
  }, [scannedGames, claimMutation])

  const handleScan = useCallback(async () => {
    if (!isDesktop) return
    setScanning(true)
    try {
      const api = (window as any).desktopAPI
      const scanned = await api.scanPaths(gamePaths, isoPaths)
      if (scanned && scanned.length > 0) {
        setScannedGames(scanned)
        setScannedGamesState(scanned)
        setGameCount(scanned.length)
      }
      const now = new Date().toLocaleString()
      setLastScan(now)
      setLastScanTime(now)

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
  }, [gamePaths, isoPaths, isDesktop, matchMutation])

  const handleDeleteAllGames = useCallback(async () => {
    setScannedGames([])
    setScannedGamesState([])
    setGameCount(0)
    if (hasDesktopAPI()) {
      (window as any).desktopAPI.saveScannedGames([]).catch(() => {})
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

  if (!isDesktop) {
    return (
      <div className="dk-settings-scanners__notice">
        <p className="dk-settings-scanners__notice-text">
          Scan directory management is only available in the Otix desktop app.
        </p>
      </div>
    )
  }

  return (
    <div className="dk-settings-scanners__body">
      <div>
        <h2 className="dk-settings-scanners__header-title">Scanners</h2>
        <p className="dk-settings-scanners__header-desc">
          Manage directories where Otix scans for games and ISO files.
        </p>
      </div>

      {/* Game scan directories */}
      <div className="dk-settings-scanners__section">
        <div className="dk-settings-scanners__section-header">
          <div>
            <h3 className="dk-settings-scanners__section-label">Game Directories</h3>
            <p className="dk-settings-scanners__section-desc">
              Folders containing installed games (Steam, GOG, Epic, PC executables)
            </p>
          </div>
          <button
            onClick={handleAddGamePath}
            className="dk-settings-scanners__ghost-btn dk-settings-scanners__ghost-btn--add"
          >
            + Add Folder
          </button>
        </div>

        {gamePaths.length === 0 ? (
          <div className="dk-settings-scanners__empty">
            <p className="dk-settings-scanners__empty-text">No game directories configured</p>
          </div>
        ) : (
          <div className="dk-settings-scanners__path-list">
            {gamePaths.map((path) => (
              <div
                key={path}
                className="dk-settings-scanners__path-row"
              >
                <div className="dk-settings-scanners__path-row-content">
                  <Folder className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="dk-settings-scanners__path-text">{path}</span>
                </div>
                <button
                  onClick={() => handleRemoveGamePath(path)}
                  className="dk-settings-scanners__path-remove"
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
      <div className="dk-settings-scanners__section">
        <div className="dk-settings-scanners__section-header">
          <div>
            <h3 className="dk-settings-scanners__section-label">ISO Directories</h3>
            <p className="dk-settings-scanners__section-desc">
              Folders containing ISO disc images for installation
            </p>
          </div>
          <button
            onClick={handleAddIsoPath}
            className="dk-settings-scanners__ghost-btn dk-settings-scanners__ghost-btn--add"
          >
            + Add Folder
          </button>
        </div>

        {isoPaths.length === 0 ? (
          <div className="dk-settings-scanners__empty">
            <p className="dk-settings-scanners__empty-text">No ISO directories configured</p>
          </div>
        ) : (
          <div className="dk-settings-scanners__path-list">
            {isoPaths.map((path) => (
              <div
                key={path}
                className="dk-settings-scanners__path-row"
              >
                <div className="dk-settings-scanners__path-row-content">
                  <Disc className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="dk-settings-scanners__path-text">{path}</span>
                </div>
                <button
                  onClick={() => handleRemoveIsoPath(path)}
                  className="dk-settings-scanners__path-remove"
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
      <div className="dk-settings-scanners__scan-banner">
        <div>
          <p className="dk-settings-scanners__scan-banner-title">Ready to Scan</p>
          <p className="dk-settings-scanners__scan-banner-desc">
            {gameCount} games currently in library
            {lastScan && ` · Last scan: ${lastScan}`}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || (gamePaths.length === 0 && isoPaths.length === 0)}
          className="dk-settings-scanners__scan-btn"
        >
          {scanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {/* ── Library overview ── */}
      {scannedGames.length > 0 && (
        <div className="dk-settings-scanners__library">
          {/* Summary bar */}
          <div className="dk-settings-scanners__summary">
            <div className="dk-settings-scanners__summary-stats">
              <span className="dk-settings-scanners__summary-label">Library</span>
              <span className="dk-settings-scanners__summary-stat--verified">{verifiedMatched.length} verified</span>
              <span className="dk-settings-scanners__summary-stat--auto">{autoMatched.length} auto</span>
              <span className="dk-settings-scanners__summary-stat--suggestions">{suggestedGames.length} suggestions</span>
              <span className="dk-settings-scanners__summary-stat--unmatched">{unmatchedGames.length} unmatched</span>
              <span className="dk-settings-scanners__summary-stat--total">·</span>
              <span className="dk-settings-scanners__summary-stat--total">{scannedGames.length} total</span>
            </div>
            <div className="dk-settings-scanners__summary-actions">
              <button
                onClick={handleMatchAll}
                disabled={matching}
                className="dk-settings-scanners__ghost-btn dk-settings-scanners__ghost-btn--action"
              >
                {matching ? "Matching..." : "Match All"}
              </button>
              <button
                onClick={handleVerifyAll}
                disabled={autoMatched.length === 0}
                className="dk-settings-scanners__ghost-btn dk-settings-scanners__ghost-btn--add"
              >
                Verify{autoMatched.length > 0 ? ` ${autoMatched.length}` : ""}
              </button>
              <button
                onClick={handleDeleteAllGames}
                className="dk-settings-scanners__ghost-btn dk-settings-scanners__ghost-btn--danger"
              >
                Delete All
              </button>
            </div>
          </div>

          {/* Platform chips */}
          <div className="dk-settings-scanners__chips">
            {platformBreakdown.map(([platform, count]) => (
              <span
                key={platform}
                className="dk-settings-scanners__chip"
              >
                <PlatformIcon platform={platform} />
                {platformLabels[platform] || platform}
                <span className="dk-settings-scanners__chip-count">{count}</span>
              </span>
            ))}
          </div>

          {/* ── Suggestions (most actionable) ── */}
          {suggestedGames.length > 0 && (
            <div className="dk-settings-scanners__suggestions">
              <h4 className="dk-settings-scanners__suggestions-header">
                <span className="dk-settings-scanners__toggle-dot dk-settings-scanners__toggle-dot--blue" />
                Suggestions — review and accept or reject
              </h4>
              <div className="dk-settings-scanners__suggestions-list">
                {suggestedGames.map((game) => {
                  const suggestion = game.otixMatchSuggestion
                  const posterUrl = game.otixPosterUrl
                  return (
                    <div
                      key={game.id}
                      className="dk-settings-scanners__suggestion-card"
                    >
                      {/* Suggested media poster */}
                      <div className="dk-settings-scanners__suggestion-poster">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt=""
                            className="dk-settings-scanners__suggestion-poster-img"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <div className="dk-settings-scanners__suggestion-poster-placeholder">
                            ?
                          </div>
                        )}
                      </div>

                      {/* Game vs suggestion text */}
                      <div className="dk-settings-scanners__suggestion-info">
                        <div className="dk-settings-scanners__suggestion-title-row">
                          <span className="dk-settings-scanners__suggestion-game-title">{game.title}</span>
                          <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                        </div>
                        <div className="dk-settings-scanners__suggestion-match-row">
                          <span className="dk-settings-scanners__suggestion-match-arrow">→</span>
                          <span className="dk-settings-scanners__suggestion-match-title">{suggestion?.title || "?"}</span>
                          <span className="dk-settings-scanners__suggestion-confidence">
                            {Math.round((game.otixConfidence ?? 0) * 100)}%
                          </span>
                        </div>
                        {/* Confidence bar */}
                        <div className="dk-settings-scanners__confidence-bar">
                          <div
                            className="dk-settings-scanners__confidence-bar-fill"
                            style={{ width: `${Math.min(100, Math.round((game.otixConfidence ?? 0) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="dk-settings-scanners__suggestion-actions">
                        <button
                          onClick={() => handleAcceptSuggestion(game)}
                          className="dk-settings-scanners__suggest-btn dk-settings-scanners__suggest-btn--accept"
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
                          className="dk-settings-scanners__suggest-btn dk-settings-scanners__suggest-btn--deny"
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
            <div className="dk-settings-scanners__section">
              <div className="dk-settings-scanners__toggle dk-settings-scanners__toggle--verified">
                <span className="dk-settings-scanners__toggle-dot dk-settings-scanners__toggle-dot--verified" />
                Verified ({verifiedMatched.length})
              </div>
              <div className="dk-settings-scanners__section-content">
                {verifiedMatched.map((game) => (
                  <div
                    key={game.id}
                    className="dk-settings-scanners__game-card dk-settings-scanners__game-card--verified"
                  >
                    <div className="dk-settings-scanners__game-poster">
                      {game.otixPosterUrl ? (
                        <img src={game.otixPosterUrl} alt="" className="dk-settings-scanners__game-poster-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="dk-settings-scanners__game-poster-placeholder">?</div>
                      )}
                    </div>
                    <div className="dk-settings-scanners__game-info">
                      <div className="dk-settings-scanners__game-title-row">
                        <span className="dk-settings-scanners__game-title">{game.title}</span>
                        <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                      </div>
                      <div className="dk-settings-scanners__game-match-row">
                        <span className="dk-settings-scanners__game-match-arrow">→</span>
                        <span className="dk-settings-scanners__game-match-title">{game.otixMediaTitle || "?"}</span>
                        {game.otixConfidence != null && (
                          <span className="dk-settings-scanners__game-confidence">{Math.round(game.otixConfidence * 100)}%</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleUnmatch(game)} className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--unmatch">Unmatch</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Auto-matched games ── */}
          {autoMatched.length > 0 && (
            <div className="dk-settings-scanners__section">
              <button
                onClick={() => setShowAutoBreakdown(!showAutoBreakdown)}
                className="dk-settings-scanners__toggle dk-settings-scanners__toggle--auto"
              >
                <span className={`dk-settings-scanners__toggle-arrow ${showAutoBreakdown ? "dk-settings-scanners__toggle-arrow--open" : ""}`}>▸</span>
                Auto-Matched ({autoMatched.length}) — review and verify
              </button>
              {showAutoBreakdown && (
                <div className="dk-settings-scanners__section-content">
                  {autoMatched.map((game) => (
                    <div
                      key={game.id}
                      className="dk-settings-scanners__game-card dk-settings-scanners__game-card--auto"
                    >
                      <div className="dk-settings-scanners__game-poster">
                        {game.otixPosterUrl ? (
                          <img src={game.otixPosterUrl} alt="" className="dk-settings-scanners__game-poster-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div className="dk-settings-scanners__game-poster-placeholder">?</div>
                        )}
                      </div>
                      <div className="dk-settings-scanners__game-info">
                        <div className="dk-settings-scanners__game-title-row">
                          <span className="dk-settings-scanners__game-title">{game.title}</span>
                          <PlatformIcon platform={game.platform} className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                        </div>
                        <div className="dk-settings-scanners__game-match-row">
                          <span className="dk-settings-scanners__game-match-arrow">→</span>
                          <span className="dk-settings-scanners__game-match-title">{game.otixMediaTitle || "?"}</span>
                          {game.otixConfidence != null && (
                            <span className="dk-settings-scanners__game-confidence">{Math.round(game.otixConfidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                      <div className="dk-settings-scanners__game-actions">
                        <button
                          onClick={() => {
                            const updated = scannedGames.map((g) =>
                              g.id === game.id ? { ...g, otixMatchVerified: true } : g,
                            )
                            setScannedGames(updated)
                            setScannedGamesState(updated)
                            if (game.otixMediaId && !game.otixClaimed) {
                              claimMutation.mutate(game.otixMediaId)
                              const claimed = updated.map((g) =>
                                g.id === game.id ? { ...g, otixClaimed: true } : g,
                              )
                              setScannedGames(claimed)
                              setScannedGamesState(claimed)
                            }
                          }}
                          className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--verify"
                        >
                          Verify
                        </button>
                        <button onClick={() => handleUnmatch(game)} className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--unmatch">Unmatch</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Unmatched games ── */}
          {unmatchedGames.length > 0 && (
            <div className="dk-settings-scanners__section">
              <button
                onClick={() => setShowUnmatchedBreakdown(!showUnmatchedBreakdown)}
                className="dk-settings-scanners__toggle dk-settings-scanners__toggle--unmatched"
              >
                <span className={`dk-settings-scanners__toggle-arrow ${showUnmatchedBreakdown ? "dk-settings-scanners__toggle-arrow--open" : ""}`}>▸</span>
                Unmatched ({unmatchedGames.length})
              </button>
              {showUnmatchedBreakdown && (
                <div className="dk-settings-scanners__section-content--scroll">
                  {unmatchedGames.map((game) => (
                    <div key={game.id}>
                      <div className="dk-settings-scanners__unmatched-row">
                        <div className="dk-settings-scanners__unmatched-content">
                          <PlatformIcon platform={game.platform} className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
                          <span className="dk-settings-scanners__unmatched-title">{game.title}</span>
                        </div>
                        <div className="dk-settings-scanners__unmatched-meta">
                          <span className="dk-settings-scanners__unmatched-platform">
                            {platformLabels[game.platform] || game.platform}
                          </span>
                          <button
                            onClick={() => handleOpenMatchSearch(game)}
                            className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--find"
                          >
                            Find Match
                          </button>
                        </div>
                      </div>

                      {/* Inline match search panel */}
                      {matchingGameId === game.id && (
                        <div className="dk-settings-scanners__search">
                          <input
                            type="text"
                            value={matchSearch}
                            onChange={(e) => handleMatchSearchChange(e.target.value)}
                            placeholder="Search Otix catalog..."
                            className="dk-settings-scanners__search-input"
                            autoFocus
                          />
                          {searching && (
                            <p className="dk-settings-scanners__search-status">Searching...</p>
                          )}
                          {matchResults && matchResults.length === 0 && !searching && (
                            <p className="dk-settings-scanners__search-status">No results found</p>
                          )}
                          {matchResults && matchResults.length > 0 && !searching && (
                            <div className="dk-settings-scanners__section-content--results">
                              {matchResults.map((result) => (
                                <div
                                  key={result.id}
                                  className="dk-settings-scanners__result"
                                  onClick={() => handleManualMatch(game.id, result)}
                                >
                                  <div className="dk-settings-scanners__result-poster">
                                    {result.posterUrl ? (
                                      <img src={result.posterUrl} alt="" className="dk-settings-scanners__result-poster-img" />
                                    ) : (
                                      <div className="dk-settings-scanners__result-poster-placeholder">?</div>
                                    )}
                                  </div>
                                  <span className="dk-settings-scanners__result-title">{result.title}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleManualMatch(game.id, result) }}
                                    className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--match"
                                  >
                                    Match
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => { setMatchingGameId(null); setMatchResults(null); setMatchSearch("") }}
                            className="dk-settings-scanners__text-btn dk-settings-scanners__text-btn--cancel"
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
