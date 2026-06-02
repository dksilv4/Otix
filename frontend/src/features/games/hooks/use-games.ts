import { useState, useMemo, useCallback, useEffect } from "react"
import { getScannedGames, setScannedGames, setLocalGamesMapEntry } from "@/features/game-scanner/storage"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab, ShelfRow } from "../types"

export function useGames() {
  const [games, setGames] = useState<DetectedGame[]>(() => getScannedGames())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<GamesTab>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) ?? games[0] ?? null,
    [games, selectedId],
  )

  useEffect(() => {
    if (!selectedId && games.length > 0) {
      setSelectedId(games[0].id)
    }
  }, [games, selectedId])

  useEffect(() => {
    setScannedGames(games)
    for (const game of games) {
      if (game.otixMediaId) {
        setLocalGamesMapEntry(game.otixMediaId, game)
      }
    }
  }, [games])

  const filteredGames = useMemo(() => {
    let result = games
    if (activeTab === "matched") result = result.filter((g) => g.otixMediaId)
    if (activeTab === "unmatched") result = result.filter((g) => !g.otixMediaId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (g) => g.title.toLowerCase().includes(q) || g.platform.toLowerCase().includes(q),
      )
    }
    return result
  }, [games, activeTab, searchQuery])

  const matchedGames = useMemo(() => games.filter((g) => g.otixMediaId), [games])
  const unmatchedGames = useMemo(() => games.filter((g) => !g.otixMediaId), [games])

  const shelves = useMemo((): ShelfRow[] => {
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
        games: matchedGames.slice(0, 6),
        emptyMessage: "Match games from your library to see them here",
      },
      {
        id: "unmatched",
        label: "Unmatched Games",
        icon: "🔍",
        games: unmatchedGames.slice(0, 6),
        emptyMessage: "No unmatched games",
      },
      {
        id: "available",
        label: "Available to Install",
        icon: "⬇️",
        games: unmatchedGames.filter((g) => g.platform === "iso").slice(0, 6),
        emptyMessage: "No installable games available",
      },
    ]
  }, [matchedGames, unmatchedGames])

  const totalSize = useMemo(() => {
    return games.length * 50
  }, [games])

  const selectGame = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

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
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setSearchQuery,
  }
}
