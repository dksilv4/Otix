import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { getScannedGames, setScannedGames, setLocalGamesMapEntry, getScanPaths, getIsoPaths, hasElectronAPI } from "@/features/game-scanner/storage"
import { useMatchLocalGames } from "@/features/game-scanner/queries"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab, ShelfRow } from "../types"

export function useGames() {
  const [games, setGames] = useState<DetectedGame[]>(() => getScannedGames())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<GamesTab>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [scanning, setScanning] = useState(false)

  const matchMutation = useMatchLocalGames()
  const hasMatched = useRef(false)
  const gamesRef = useRef(games)
  gamesRef.current = games

  // Auto-match on first mount
  useEffect(() => {
    if (games.length > 0 && !hasMatched.current) {
      const needsMatch = games.some((g) => !g.otixMediaId && !g.otixMatchSuggestion)
      if (needsMatch) {
        hasMatched.current = true
        matchMutation.mutateAsync(games).then((matched) => {
          if (matched && matched.length > 0) setGames(matched)
        }).catch(() => {})
      } else {
        hasMatched.current = true
      }
    }
  }, [])

  // Restore match data from previous scans
  useEffect(() => {
    if (games.length > 0) {
      setScannedGames(games)
      for (const g of games) {
        if (g.otixMediaId) setLocalGamesMapEntry(g.otixMediaId, g)
      }
      if (hasElectronAPI()) {
        (window as any).electronAPI.setLibrary(games).catch(() => {})
      }
    }
  }, [games])

  // Re-match games that matched before but lost poster art
  useEffect(() => {
    if (games.length === 0 || hasMatched.current) return
    const needsArt = games.filter((g) => g.otixMediaId && !g.otixPosterUrl && !g.otixLogoUrl)
    if (needsArt.length === 0) return
    const stripped = needsArt.map((g) => ({ ...g, otixMediaId: undefined as string | undefined }))
    matchMutation.mutateAsync(stripped).then((updated) => {
      if (!updated) return
      setGames((prev) => {
        const map = new Map(updated.map((g) => [g.id, g]))
        return prev.map((g) => map.get(g.id) ?? g)
      })
    }).catch(() => {})
  }, [])

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) ?? games[0] ?? null,
    [games, selectedId],
  )

  useEffect(() => {
    if (!selectedId && games.length > 0) {
      setSelectedId(games[0].id)
    }
  }, [games, selectedId])

  const filteredGames = useMemo(() => {
    let result = games
    if (activeTab === "matched") result = result.filter((g) => g.otixMediaId)
    if (activeTab === "unmatched") result = result.filter((g) => !g.otixMediaId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (g) => g.title.toLowerCase().includes(q) || g.platform.toLowerCase().includes(q) || g.installDir.toLowerCase().includes(q),
      )
    }
    return result
  }, [games, activeTab, searchQuery])

  const matchedGames = useMemo(() => games.filter((g) => g.otixMediaId), [games])
  const unmatchedGames = useMemo(() => games.filter((g) => !g.otixMediaId), [games])

  // Build shelves from real game data
  const shelves = useMemo((): ShelfRow[] => {
    const hasMatchedGames = matchedGames.length > 0
    return [
      {
        id: "recent",
        label: "Recently Played",
        icon: "🕐",
        games: matchedGames.slice(0, 5),
        emptyMessage: "Play some games to see them here",
      },
      {
        id: "matched",
        label: "Matched Games",
        icon: "✅",
        games: matchedGames.slice(0, 8),
        emptyMessage: hasMatchedGames ? "" : "No games matched yet — scan your library to get started",
      },
      {
        id: "suggested",
        label: "Suggested Matches",
        icon: "🔗",
        games: games.filter((g) => g.otixMatchSuggestion).slice(0, 6),
        emptyMessage: "No match suggestions yet",
      },
      {
        id: "unmatched",
        label: "Unmatched Games",
        icon: "🔍",
        games: unmatchedGames.filter((g) => !g.otixMatchSuggestion).slice(0, 6),
        emptyMessage: "All games matched!",
      },
      {
        id: "available",
        label: "Available to Install",
        icon: "⬇️",
        games: games.filter((g) => g.platform === "iso" || (!g.otixMediaId && !g.exePath.startsWith("steam://"))).slice(0, 6),
        emptyMessage: "No installable games available",
      },
    ]
  }, [matchedGames, unmatchedGames, games])

  const totalSize = useMemo(() => {
    return games.length * 50 // estimate
  }, [games])

  const selectGame = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleAcceptSuggestion = useCallback((game: DetectedGame) => {
    if (!game.otixMatchSuggestion) return
    setGames((prev) =>
      prev.map((g) =>
        g.id === game.id
          ? {
              ...g,
              otixMediaId: game.otixMatchSuggestion!.mediaId,
              otixMediaTitle: game.otixMatchSuggestion!.title,
              otixMediaSlug: game.otixMatchSuggestion!.slug,
              otixMatchSuggestion: undefined,
            }
          : g,
      ),
    )
  }, [])

  const handleRejectSuggestion = useCallback((game: DetectedGame) => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === game.id ? { ...g, otixMatchSuggestion: undefined, otixConfidence: undefined } : g,
      ),
    )
  }, [])

  const handleRescan = useCallback(async () => {
    if (!hasElectronAPI()) return
    setScanning(true)
    try {
      const api = (window as any).electronAPI
      const gamePaths = getScanPaths()
      const isoPaths = getIsoPaths()
      const scanned = await api.scanPaths(gamePaths, isoPaths)

      // Carry over previous match data
      const prevOtixMap = new Map<string, DetectedGame>()
      for (const g of gamesRef.current) {
        if (g.otixMediaId || g.otixMatchSuggestion) {
          prevOtixMap.set(g.id, g)
        }
      }

      const matched = await matchMutation.mutateAsync(scanned)
      if (!matched) return

      const restored = matched.map((g) => {
        if (g.otixMediaId || g.otixMatchSuggestion) return g
        const prev = prevOtixMap.get(g.id)
        if (!prev) return g
        return {
          ...g,
          otixMediaId: prev.otixMediaId,
          otixMediaTitle: prev.otixMediaTitle,
          otixMediaSlug: prev.otixMediaSlug,
          otixConfidence: prev.otixConfidence,
          otixPosterUrl: prev.otixPosterUrl,
          otixTextlessPosterUrl: prev.otixTextlessPosterUrl,
          otixLogoUrl: prev.otixLogoUrl,
          otixMatchSuggestion: prev.otixMatchSuggestion,
        }
      })

      setGames(restored)
    } catch (err) {
      console.error("Rescan failed:", err)
    } finally {
      setScanning(false)
    }
  }, [matchMutation])

  return {
    games,
    selectedGame,
    filteredGames,
    matchedGames,
    unmatchedGames,
    shelves,
    sidePanelOpen,
    activeTab,
    searchQuery,
    totalSize,
    scanning,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setSearchQuery,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleRescan,
  }
}
