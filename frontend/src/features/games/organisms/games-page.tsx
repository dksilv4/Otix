import { useCallback } from "react"
import { useGames } from "../hooks/use-games"
import { GamesHero } from "./games-hero"
import { GamesSidePanel } from "./games-side-panel"
import { GamesShelf } from "./games-shelf"
import type { DetectedGame } from "@/features/game-scanner/types"

export function GamesPage() {
  const {
    selectedGame,
    filteredGames,
    shelves,
    sidePanelOpen,
    activeTab,
    searchQuery,
    totalSize,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setSearchQuery,
  } = useGames()

  const handlePlay = useCallback((game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.launchGame(game).catch(console.error)
    }
  }, [])

  const handleOpenFolder = useCallback((_game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.selectDirectory()
    }
  }, [])

  const handleFavorite = useCallback((_gameId: string) => {
    // Placeholder — will be connected to persisted state
  }, [])

  const matchedCount = filteredGames.filter((g) => g.otixMediaId).length
  const unmatchedCount = filteredGames.filter((g) => !g.otixMediaId).length
  const isoCount = filteredGames.filter((g) => g.platform === "iso").length

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-2.5">
        <h1 className="text-xl font-extrabold text-foreground">🎮 Games</h1>
        <span className="text-[11px] text-white/25 bg-white/5 px-2.5 py-1 rounded-lg">
          {filteredGames.length} titles
        </span>
      </div>

      {/* Hero row */}
      <div className="flex gap-2.5 min-h-[180px]">
        <GamesSidePanel
          open={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
          games={filteredGames}
          selectedId={selectedGame?.id ?? null}
          onSelect={selectGame}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRescan={() => {}}
        />
        <GamesHero
          game={selectedGame}
          onTogglePanel={() => setSidePanelOpen(!sidePanelOpen)}
          onPlay={handlePlay}
          onOpenFolder={handleOpenFolder}
          onFavorite={handleFavorite}
          isFavorite={false}
          panelLabel={selectedGame?.otixMediaTitle || selectedGame?.title || "Browse"}
        />
      </div>

      {/* Game Pass shelves */}
      <GamesShelf rows={shelves} onSelectGame={selectGame} />

      {/* Footer stats */}
      <div className="flex gap-4 pt-3 border-t border-white/5 text-[10px] text-white/10">
        <span>{matchedCount} matched</span>
        <span>{unmatchedCount} unmatched</span>
        <span>{isoCount} ISOs</span>
        <span>{totalSize} GB total</span>
        <span className="ml-auto">Last scan: —</span>
      </div>
    </div>
  )
}
