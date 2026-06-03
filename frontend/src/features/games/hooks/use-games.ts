import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  getScannedGames,
  setScannedGames,
  hasElectronAPI,
  getScanPaths,
  getIsoPaths,
  setLocalGamesMapEntry,
} from "@/features/game-scanner/storage"
import { useMatchLocalGames } from "@/features/game-scanner/queries"
import { usePopularGames, useGameDetail, useGameGenres, useSeedFromTitles } from "@/features/games/games-queries"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab, ShelfRow } from "../types"

export function useGames() {
  // ── Local games (from scanner) ─────────────────────────────────────
  const [localGames, setLocalGames] = useState<DetectedGame[]>(() => getScannedGames())
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<GamesTab>("all")
  const [localSearchQuery, setLocalSearchQuery] = useState("")
  const [scanning, setScanning] = useState(false)

  const matchMutation = useMatchLocalGames()
  const seedMutation = useSeedFromTitles()
  const initialized = useRef(false)
  const hasSeeded = useRef(false)

  // ── Selected local game & catalog detail ──────────────────────────

  const selectedLocalGame = useMemo(
    () => localGames.find((g) => g.id === selectedLocalId) ?? localGames[0] ?? null,
    [localGames, selectedLocalId],
  )

  const { data: gameDetail } = useGameDetail(selectedLocalGame?.otixMediaId)

  // ── Build installed map ───────────────────────────────────────────

  const installedMap = useMemo(() => {
    const map = new Map<string, DetectedGame>()
    for (const g of localGames) {
      if (g.otixMediaId) map.set(g.otixMediaId, g)
    }
    return map
  }, [localGames])

  // ── Auto-match on mount ──────────────────────────────────────────

  useEffect(() => {
    if (initialized.current || localGames.length === 0) return
    initialized.current = true
    const needsMatch = localGames.some((g) => !g.otixMediaId && !g.otixMatchSuggestion)
    if (!needsMatch) return
    matchMutation.mutateAsync(localGames).then((matched) => {
      if (matched && matched.length > 0) {
        setLocalGames(matched)
        setScannedGames(matched)
      }
    }).catch(() => {})
  }, [])

  // ── Seed backend titles ───────────────────────────────────────────

  useEffect(() => {
    if (localGames.length === 0 || hasSeeded.current) return
    hasSeeded.current = true
    if (!hasElectronAPI()) return
    const titles = [...new Set(localGames.map((g) => g.title))]
    seedMutation.mutate(titles)
  }, [])

  // ── Sync to storage ──────────────────────────────────────────────

  useEffect(() => {
    if (localGames.length === 0) return
    setScannedGames(localGames)
    for (const g of localGames) {
      if (g.otixMediaId) setLocalGamesMapEntry(g.otixMediaId, g)
    }
  }, [localGames])

  // ── Auto-select first game ───────────────────────────────────────

  useEffect(() => {
    if (!selectedLocalId && localGames.length > 0) {
      setSelectedLocalId(localGames[0].id)
    }
  }, [localGames, selectedLocalId])

  // ── Local game filtering ─────────────────────────────────────────

  const filteredLocalGames = useMemo(() => {
    let result = localGames
    if (activeTab === "matched") result = result.filter((g) => g.otixMediaId)
    if (activeTab === "unmatched") result = result.filter((g) => !g.otixMediaId)
    if (localSearchQuery.trim()) {
      const q = localSearchQuery.toLowerCase()
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.platform.toLowerCase().includes(q) ||
          g.installDir.toLowerCase().includes(q),
      )
    }
    return result
  }, [localGames, activeTab, localSearchQuery])

  const matchedGames = useMemo(() => localGames.filter((g) => g.otixMediaId), [localGames])
  const unmatchedGames = useMemo(() => localGames.filter((g) => !g.otixMediaId), [localGames])

  // ── Shelves ───────────────────────────────────────────────────────

  const { data: popularGames = [] } = usePopularGames()

  const shelves = useMemo((): ShelfRow[] => {
    const rows: ShelfRow[] = []
    if (matchedGames.length > 0) {
      rows.push({
        id: "matched",
        label: "Installed Games",
        icon: "✓",
        games: matchedGames.slice(0, 12),
      })
    }
    const suggested = localGames.filter((g) => g.otixMatchSuggestion)
    if (suggested.length > 0) {
      rows.push({
        id: "suggested",
        label: "Suggested Matches",
        icon: "🔗",
        games: suggested.slice(0, 8),
      })
    }
    const unmatched = unmatchedGames.filter((g) => !g.otixMatchSuggestion)
    if (unmatched.length > 0) {
      rows.push({
        id: "unmatched",
        label: "Unmatched Games",
        icon: "🔍",
        games: unmatched.slice(0, 8),
      })
    }
    if (popularGames.length > 0) {
      rows.push({
        id: "popular",
        label: "Popular on Otix",
        icon: "🔥",
        games: [],
        catalogGames: popularGames.slice(0, 12),
      })
    }
    return rows
  }, [matchedGames, unmatchedGames, localGames, popularGames])

  // ── Genres (for hero metadata) ────────────────────────────────────

  const { data: genres = [] } = useGameGenres()

  // ── Actions ────────────────────────────────────────────────────────

  const selectGame = useCallback((id: string) => {
    setSelectedLocalId(id)
  }, [])

  const handleAcceptSuggestion = useCallback((game: DetectedGame) => {
    if (!game.otixMatchSuggestion) return
    setLocalGames((prev) =>
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
    setLocalGames((prev) =>
      prev.map((g) =>
        g.id === game.id
          ? { ...g, otixMatchSuggestion: undefined, otixConfidence: undefined }
          : g,
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
      const carryOver = new Map<string, DetectedGame>()
      for (const g of localGames) {
        if (g.otixMediaId || g.otixMatchSuggestion) carryOver.set(g.id, g)
      }
      const matched = await matchMutation.mutateAsync(scanned)
      if (!matched) return
      const restored = matched.map((g) => {
        if (g.otixMediaId || g.otixMatchSuggestion) return g
        const prev = carryOver.get(g.id)
        if (!prev) return g
        return { ...g, ...prev }
      })
      setLocalGames(restored)
      setScannedGames(restored)
      const titles = [...new Set(scanned.map((g) => g.title))]
      seedMutation.mutate(titles)
    } catch (err) {
      console.error("Rescan failed:", err)
    } finally {
      setScanning(false)
    }
  }, [])

  const handlePlay = useCallback((game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.launchGame(game).catch(console.error)
    }
  }, [])

  const handleOpenFolder = useCallback((game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const { shell } = window as any
      if (shell?.openPath) shell.openPath(game.installDir)
    }
  }, [])

  return {
    // Local games
    localGames,
    filteredLocalGames,
    selectedLocalGame,
    matchedGames,
    unmatchedGames,

    // Catalog detail
    gameDetail,

    // Shelves + genres
    shelves,
    genres,

    // UI state
    sidePanelOpen,
    activeTab,
    localSearchQuery,
    scanning,

    // Stats
    matchedCount: matchedGames.length,
    unmatchedCount: unmatchedGames.length,
    suggestionCount: localGames.filter((g) => g.otixMatchSuggestion).length,

    // Actions
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setLocalSearchQuery,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleRescan,
    handlePlay,
    handleOpenFolder,
  }
}
