import { useCallback } from "react"
import { useGames } from "../hooks/use-games"
import { GamesHero } from "./games-hero"
import { GamesSidePanel } from "./games-side-panel"
import { GamesShelf } from "./games-shelf"
import type { DetectedGame } from "@/features/game-scanner/types"

export function GamesPage() {
  const {
    selectedGame,
    games,
    filteredGames,
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
  } = useGames()

  const handlePlay = useCallback((game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.launchGame(game).catch(console.error)
    }
  }, [])

  const handleOpenFolder = useCallback((game: DetectedGame) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      // Open the install directory in file explorer
      const { shell } = window as any
      if (shell?.openPath) shell.openPath(game.installDir)
      else (window as any).electronAPI.selectDirectory()
    }
  }, [])

  const handleFavorite = useCallback((_gameId: string) => {
    // TODO: persist favorites
  }, [])

  const matchedCount = filteredGames.filter((g) => g.otixMediaId).length
  const unmatchedCount = filteredGames.filter((g) => !g.otixMediaId).length
  const isoCount = filteredGames.filter((g) => g.platform === "iso").length
  const suggestionCount = filteredGames.filter((g) => g.otixMatchSuggestion).length

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-extrabold text-foreground">🎮 Games</h1>
          <span className="text-[11px] text-white/25 bg-white/5 px-2.5 py-1 rounded-lg">
            {games.length} titles
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {matchedCount > 0 && <span className="text-emerald-400">{matchedCount} matched</span>}
          {suggestionCount > 0 && <span className="text-blue-400">{suggestionCount} suggested</span>}
          {unmatchedCount > 0 && <span className="text-white/30">{unmatchedCount} unmatched</span>}
        </div>
      </div>

      {/* Browser wrapper (single surface) */}
      <div className="rounded-3xl overflow-hidden bg-[rgba(10,10,15,0.5)]">
        <div className="p-5">
          {/* Hero + Side Panel row */}
          <div className="flex gap-2.5 min-h-[180px] mb-5">
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
              onRescan={handleRescan}
              scanning={scanning}
            />
            <GamesHero
              game={selectedGame}
              onTogglePanel={() => setSidePanelOpen(!sidePanelOpen)}
              onPlay={handlePlay}
              onOpenFolder={handleOpenFolder}
              onFavorite={handleFavorite}
              isFavorite={false}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              panelLabel={selectedGame?.otixMediaTitle || selectedGame?.title || "Browse"}
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-thin">
            {["For You", "Recently Played", "Matched", "Suggested", "Unmatched", "Available"].map((label) => (
              <button
                key={label}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap text-white/40 hover:text-white/60 hover:bg-white/5"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Shelves */}
          <GamesShelf
            rows={shelves}
            onSelectGame={selectGame}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
          />

          {/* Footer */}
          <div className="flex gap-4 pt-3 mt-4 border-t border-white/5 text-[10px] text-white/10">
            <span>{matchedCount} matched</span>
            <span>{unmatchedCount} unmatched</span>
            <span>{isoCount} ISOs</span>
            <span>{suggestionCount} suggestions</span>
            <span>{totalSize} GB total</span>
            <span className="ml-auto">
              {scanning ? "Scanning..." : `Last scan: ${games.length > 0 ? "loaded" : "—"}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
