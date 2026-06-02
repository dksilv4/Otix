import { useState, useMemo, useCallback, useEffect } from "react"
import { getScannedGames, setScannedGames, setLocalGamesMapEntry } from "@/features/game-scanner/storage"
import type { DetectedGame } from "@/features/game-scanner/types"
import type { GamesTab, ShelfRow } from "../types"

// Demo data for when no games are scanned yet
const DEMO_GAMES: DetectedGame[] = [
  { id: "elden", title: "Elden Ring", exePath: "", installDir: "D:/Games/Elden Ring", platform: "steam", otixMediaId: "game_1", otixMediaTitle: "Elden Ring", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "bg3", title: "Baldur's Gate 3", exePath: "", installDir: "D:/Games/BG3", platform: "steam", otixMediaId: "game_2", otixMediaTitle: "Baldur's Gate 3", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "cs2", title: "CS2", exePath: "", installDir: "D:/Games/CS2", platform: "steam", otixMediaId: "game_3", otixMediaTitle: "Counter-Strike 2", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "witcher", title: "The Witcher 3", exePath: "", installDir: "D:/Games/Witcher3", platform: "gog", otixMediaId: "game_4", otixMediaTitle: "The Witcher 3: Wild Hunt", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "cyberpunk", title: "Cyberpunk 2077", exePath: "", installDir: "D:/Games/Cyberpunk", platform: "gog", otixMediaId: "game_5", otixMediaTitle: "Cyberpunk 2077", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "helldivers", title: "Helldivers 2", exePath: "", installDir: "D:/Games/Helldivers2", platform: "steam", otixMediaId: "game_6", otixMediaTitle: "Helldivers 2", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "hollow", title: "Hollow Knight", exePath: "", installDir: "D:/Games/HollowKnight", platform: "steam", otixMediaId: "game_7", otixMediaTitle: "Hollow Knight", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "portal2", title: "Portal 2", exePath: "", installDir: "D:/Games/Portal2", platform: "steam", otixMediaId: "game_8", otixMediaTitle: "Portal 2", otixPosterUrl: "", otixLogoUrl: "", otixConfidence: 1 },
  { id: "rdr2", title: "Red Dead Redemption 2", exePath: "", installDir: "D:/Games/RDR2", platform: "iso", otixMediaId: undefined },
  { id: "gowr", title: "God of War Ragnarök", exePath: "", installDir: "D:/ISOs/GoW_Ragnarok", platform: "iso", otixMediaId: undefined },
  { id: "hades2", title: "Hades II", exePath: "", installDir: "D:/Games/Hades2", platform: "steam", otixMediaId: undefined },
  { id: "stellar", title: "Stellar Blade", exePath: "", installDir: "D:/Games/StellarBlade", platform: "pc", otixMediaId: undefined },
]

export function useGames() {
  const scannedGames = getScannedGames()
  const [games, setGames] = useState<DetectedGame[]>(
    () => scannedGames.length > 0 ? scannedGames : DEMO_GAMES,
  )
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
    if (scannedGames.length > 0) {
      setScannedGames(games)
      for (const game of games) {
        if (game.otixMediaId) {
          setLocalGamesMapEntry(game.otixMediaId, game)
        }
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

  const shelves = useMemo((): ShelfRow[] => [
    {
      id: "recent",
      label: "Recently Played",
      icon: "🕐",
      games: matchedGames.slice(0, 5),
      emptyMessage: "Play some games to see them here",
    },
    {
      id: "rpg",
      label: "Role-Playing Games",
      icon: "⚔️",
      games: matchedGames.filter(g => g.id === "bg3" || g.id === "witcher" || g.id === "cyberpunk" || g.id === "elden").slice(0, 6),
      emptyMessage: "No RPGs matched yet",
    },
    {
      id: "action",
      label: "Action & Adventure",
      icon: "💥",
      games: matchedGames.filter(g => g.id === "helldivers" || g.id === "hollow" || g.id === "portal2").slice(0, 6),
      emptyMessage: "No action games yet",
    },
    {
      id: "available",
      label: "Available to Install",
      icon: "⬇️",
      games: unmatchedGames.filter((g) => g.platform === "iso").slice(0, 6),
      emptyMessage: "No installable games available",
    },
  ], [matchedGames, unmatchedGames])

  const totalSize = useMemo(() => games.length * 50, [games])

  const selectGame = useCallback((id: string) => setSelectedId(id), [])

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
