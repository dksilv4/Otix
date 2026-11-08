import { useState, useCallback, useEffect } from "react"
import { useParams, useLocation, useNavigate } from "@tanstack/react-router"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { hasDesktopAPI } from "@/lib/desktop/api"
import { ModernHeader } from "./modern-header"
import { ModernDashboard } from "./modern-dashboard"
import { ModernLibrary } from "./modern-library"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

export const ModernLauncherView = () => {
  const isDesktop = hasDesktopAPI()
  const params = useParams({ strict: false }) as { gameId?: string }
  const location = useLocation()
  const navigate = useNavigate()

  const { data: localGames = [] } = useLauncherVisibleGames(
    isDesktop ? { sortBy: "last_played_at", sortDir: "desc" } : undefined
  )
  const { data: popularGames = [] } = usePopularGames()

  const [activeTab, setActiveTab] = useState<"dashboard" | "library">("dashboard")
  const [searchQuery, setSearchQuery] = useState("")
  const [detailGame, setDetailGame] = useState<LocalGame | DisplayGame | null>(null)

  useEffect(() => {
    if (location.pathname.endsWith("/library")) {
      setActiveTab("library")
    }
  }, [location.pathname])

  useEffect(() => {
    if (params?.gameId) {
      const found =
        localGames.find((g) => g.id === params.gameId) ||
        popularGames.find((g) => g.id === params.gameId)
      if (found) {
        setDetailGame(found as any)
      }
    }
  }, [params?.gameId, localGames, popularGames])

  const handleOpenDetails = useCallback(
    (game: LocalGame | DisplayGame) => {
      setDetailGame(game)
      if (game.id) {
        void navigate({ to: "/launcher/$gameId", params: { gameId: game.id }, replace: true })
      }
    },
    [navigate]
  )

  const handleCloseDetails = useCallback(() => {
    setDetailGame(null)
    if (params?.gameId) {
      void navigate({ to: "/launcher", replace: true })
    }
  }, [navigate, params?.gameId])

  const handleSelectGame = useCallback((_game: LocalGame | DisplayGame) => {
    // Spotlight selection
  }, [])

  return (
    <div className="w-full h-full bg-background text-foreground font-sans select-none overflow-y-auto overflow-x-hidden relative scroll-smooth">
      {/* Top Header */}
      <ModernHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Main Content Area */}
      <main className="w-full">
        {activeTab === "dashboard" && !searchQuery ? (
          <ModernDashboard
            localGames={localGames}
            popularGames={popularGames}
            onOpenDetails={handleOpenDetails}
            onSelectGame={handleSelectGame}
            onSwitchToLibrary={() => setActiveTab("library")}
          />
        ) : (
          <ModernLibrary
            localGames={localGames}
            popularGames={popularGames}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onOpenDetails={handleOpenDetails}
          />
        )}
      </main>

      {/* Slide-over Game Detail Sheet */}
      <LauncherGameSheet
        game={detailGame}
        onClose={handleCloseDetails}
      />
    </div>
  )
};
