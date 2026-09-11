import { useState, useCallback, useEffect } from "react"
import { useLocalGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { hasDesktopAPI } from "@/lib/desktop/api"
import { useNavPillsVisibility } from "@/features/navigation"
import { ModernHeader } from "./modern-header"
import { ModernDashboard } from "./modern-dashboard"
import { ModernLibrary } from "./modern-library"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

export function ModernLauncherView() {
  const isDesktop = hasDesktopAPI()
  const { setOverride } = useNavPillsVisibility()

  // Clear navigation pills while Modern launcher is active
  useEffect(() => {
    setOverride({ hidden: true })
    return () => setOverride(null)
  }, [setOverride])

  const { data: localGames = [] } = useLocalGames(
    isDesktop ? { sortBy: "last_played_at", sortDir: "desc" } : undefined
  )
  const { data: popularGames = [] } = usePopularGames()

  const [activeTab, setActiveTab] = useState<"dashboard" | "library">("dashboard")
  const [searchQuery, setSearchQuery] = useState("")
  const [detailGame, setDetailGame] = useState<LocalGame | DisplayGame | null>(null)

  const handleOpenDetails = useCallback((game: LocalGame | DisplayGame) => {
    setDetailGame(game)
  }, [])

  const handleSelectGame = useCallback((game: LocalGame | DisplayGame) => {
    // Spotlight selection
  }, [])

  return (
    <div className="w-full h-full bg-neutral-950 text-white font-sans select-none overflow-y-auto overflow-x-hidden relative scroll-smooth">
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
        onClose={() => setDetailGame(null)}
      />
    </div>
  )
}
