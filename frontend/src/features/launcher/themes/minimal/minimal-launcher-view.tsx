import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Play,
  ArrowLeft,
  Search,
  Sliders,
} from "lucide-react"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const MinimalLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)

  const {
    filteredGames,
    activeGame,
    selectGame,
    searchQuery,
    setSearchQuery,
  } = useLauncherGames()

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  return (
    <div className="relative w-full h-full bg-[var(--dk-surface-base)] text-foreground flex select-none overflow-hidden font-sans">
      {/* Left Clean Editorial Index */}
      <aside className="w-80 lg:w-96 border-r border-white/[0.04] flex flex-col justify-between p-8 shrink-0 bg-[var(--dk-surface-subtle)]">
        <div className="space-y-8">
          {/* Brand header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Return to Otix"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-xs uppercase tracking-widest font-semibold"
            >
              <ArrowLeft size={14} />
              <span>Otix</span>
            </button>
            <span className="text-[10px] tracking-widest uppercase font-mono text-muted-foreground/60">
              V8 · Minimal
            </span>
          </div>

          {/* User info */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Library</span>
            <span className="text-xs font-mono text-foreground">
              {filteredGames.length} titles
            </span>
          </div>

          {/* Clean search */}
          <div className="relative">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent pl-6 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 border-b border-white/[0.06] focus:border-primary outline-none transition-colors"
            />
          </div>

          {/* Vertical Title List */}
          <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto no-scrollbar pr-2">
            {filteredGames.map((game, i) => {
              const isSelected = activeGame?.id === game.id
              return (
                <div
                  key={game.id}
                  onClick={() => selectGame(game.id)}
                  className={`group flex items-center justify-between py-2 px-2.5 rounded cursor-pointer transition-all ${
                    isSelected
                      ? "text-primary font-bold bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs truncate">{game.title}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* User Pill Footer */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground">
          <span>{user?.username || (isAuthenticated ? "Player" : "Guest")}</span>
          <button
            onClick={() => navigate({ to: '/settings/launcher' })}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Settings
          </button>
        </div>
      </aside>

      {/* Right Museum Stage: Generous White-space, Big Art, Clean Typo */}
      <main className="flex-1 flex flex-col justify-between p-12 lg:p-16 overflow-y-auto no-scrollbar">
        {activeGame ? (
          <div className="max-w-4xl space-y-10">
            {/* Top metadata */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs tracking-widest uppercase text-muted-foreground font-mono">
                <span>{activeGame.platform}</span>
                <span>/</span>
                <span>{activeGame.data?.releaseDate ? new Date(activeGame.data.releaseDate).getFullYear() : "Archived"}</span>
                {activeGame.data?.avgRating && (
                  <>
                    <span>/</span>
                    <span className="text-foreground">Rating {activeGame.data.avgRating}%</span>
                  </>
                )}
              </div>

              <h1 className="text-5xl lg:text-6xl font-light tracking-tight text-foreground">
                {activeGame.title}
              </h1>

              <p className="text-sm text-muted-foreground leading-relaxed font-light max-w-2xl pt-2">
                {activeGame.description || activeGame.data?.overview}
              </p>
            </div>

            {/* Clean Full-Width Hero Art View */}
            <div className="relative aspect-[21/9] rounded-xl overflow-hidden bg-[var(--dk-surface-field)] border border-white/[0.04] shadow-2xl">
              {activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl ? (
                <img
                  src={activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl || ""}
                  alt={activeGame.title}
                  className="w-full h-full object-cover filter brightness-95 contrast-105"
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </div>

            {/* Launch Actions */}
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={() => handlePlayGame(activeGame)}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors cursor-pointer shadow-lg shadow-primary/25"
              >
                <Play size={14} fill="currentColor" />
                <span>Launch Title</span>
              </button>

              <button
                onClick={() => setDetailGame(activeGame)}
                className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/20 text-foreground hover:bg-white/5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <Sliders size={13} />
                <span>Details & Art</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">No title selected.</div>
        )}

        <div className="pt-12 text-xs text-muted-foreground/60 font-mono flex items-center justify-between">
          <span>OTIX ZEN GALLERY</span>
          <span>PRESS ALT+T FOR THEMES</span>
        </div>
      </main>

      {hasDisambiguationTarget && (
        <ConsoleDisambiguationModal {...disambiguationModalProps} />
      )}

      {detailGame && (
        <LauncherGameSheet
          game={detailGame}
          onClose={() => setDetailGame(null)}
        />
      )}
    </div>
  )
};
