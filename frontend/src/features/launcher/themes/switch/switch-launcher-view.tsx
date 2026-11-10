import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  ArrowLeft,
  Gamepad2,
  Power,
  Search,
  RotateCw,
} from "lucide-react"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { useVirtualRow } from "@/features/launcher/hooks/use-virtual-grid"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const SwitchLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { runningGame, runningGames = [], cycleActiveGame } = useRunningGame()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)

  const {
    filteredGames,
    activeGame,
    selectGame,
    searchQuery,
    setSearchQuery,
  } = useLauncherGames()

  const {
    virtualItems,
    paddingStart,
    paddingEnd,
    containerRef,
    scrollToIndex,
  } = useVirtualRow(filteredGames, {
    itemWidth: 200,
    gap: 20,
    threshold: 24,
  })

  // Scroll active game into view when changed via keyboard or selection
  useEffect(() => {
    if (activeGame) {
      const idx = filteredGames.findIndex((g) => g.id === activeGame.id)
      if (idx !== -1) {
        scrollToIndex(idx)
      }
    }
  }, [activeGame?.id, scrollToIndex, filteredGames])

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  return (
    <div className="relative w-full h-full bg-[var(--dk-surface-base)] text-foreground flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Top Switch Navigation Bar */}
      <header className="relative z-20 px-8 py-5 flex items-center justify-between border-b border-white/[0.04]">
        {/* User Account & Otix Branding */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            title={user?.username ? `Profile: ${user.username}` : "Profile"}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.username || "User"}
                loading="lazy"
                decoding="async"
                className="w-10 h-10 rounded-full object-cover ring-2 ring-primary shadow-md group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-black text-primary ring-2 ring-primary/40 shadow-md group-hover:scale-105 transition-transform">
                {(user?.username?.[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                Online
              </span>
            </div>
          </button>

          <div className="h-6 w-px bg-[var(--dk-separator)] mx-2" />

          <button
            onClick={() => navigate({ to: "/" })}
            title="Exit to Otix Hub"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer border border-white/[0.04]"
          >
            <ArrowLeft size={14} />
            <span>Otix App</span>
          </button>
        </div>

        {/* Right Status / Clock */}
        <div className="flex items-center gap-4">
          {runningGame && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">
              <span>Playing {runningGame.game.title}</span>
              {runningGames.length > 1 && (
                <button
                  type="button"
                  onClick={() => void cycleActiveGame()}
                  title={`Running ${runningGames.length} games. Click or press Ctrl+Tab to cycle active game focus.`}
                  className="inline-flex items-center gap-1 pl-2 border-l border-primary/30 text-[10px] font-semibold text-primary hover:text-foreground transition-colors cursor-pointer"
                >
                  <RotateCw className="h-2.5 w-2.5" />
                  <span>+${runningGames.length - 1}</span>
                </button>
              )}
            </div>
          )}

          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] rounded-full pl-7 pr-3 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none border border-white/[0.04] focus:border-primary/50 transition-colors"
            />
          </div>

          <span className="text-sm font-bold text-muted-foreground font-mono">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </header>

      {/* Middle Carousel of Large Game Cards */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8">
        {/* Selected Game Title & Launch Action Indicator */}
        <div className="max-w-4xl mx-auto w-full mb-4 px-2 flex items-end justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary block mb-1">
              Selected Game
            </span>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground drop-shadow">
              {activeGame?.title || "No games found"}
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              {activeGame?.platform?.toUpperCase()} · {activeGame?.description?.slice(0, 90) || "Ready to play."}...
            </span>
          </div>

          {activeGame && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePlayGame(activeGame)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/25 active:scale-95 transition-all cursor-pointer"
              >
                <Play size={14} className="fill-current" />
                <span>Start</span>
              </button>
              <button
                onClick={() => setDetailGame(activeGame)}
                className="p-2.5 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] text-foreground border border-white/[0.04] transition-colors cursor-pointer"
                title="Game Options"
              >
                <Sliders size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Big Horizontal Card Carousel */}
        <div
          ref={containerRef}
          className="flex items-center gap-5 overflow-x-auto no-scrollbar py-6 px-4 scroll-smooth"
        >
          {paddingStart > 0 && (
            <div style={{ width: paddingStart, flexShrink: 0 }} aria-hidden="true" />
          )}
          {virtualItems.map(({ item: game, index }) => {
            const isSelected = activeGame?.id === game.id
            const poster = game.otixPosterUrl || game.posterUrl
            const isAboveFold = isSelected || index < 5

            return (
              <motion.div
                key={game.id}
                onClick={() => selectGame(game.id)}
                whileHover={{ y: -8, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? "w-48 sm:w-56 aspect-[3/4] ring-2 ring-primary shadow-lg shadow-primary/20"
                    : "w-36 sm:w-44 aspect-[3/4] opacity-70 hover:opacity-100 ring-1 ring-white/[0.06]"
                }`}
              >
                {poster ? (
                  <img
                    src={poster}
                    alt={game.title}
                    loading={isAboveFold ? "eager" : "lazy"}
                    fetchPriority={isAboveFold ? "high" : "auto"}
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--dk-surface-ghost)] flex items-center justify-center p-3 text-center">
                    <span className="text-xs font-bold text-muted-foreground">{game.title}</span>
                  </div>
                )}

                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-primary text-[9px] font-black uppercase tracking-wider text-primary-foreground shadow">
                    Active
                  </div>
                )}
              </motion.div>
            )
          })}
          {paddingEnd > 0 && (
            <div style={{ width: paddingEnd, flexShrink: 0 }} aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Bottom Switch Circle Dock Buttons */}
      <footer className="relative z-20 px-8 pb-20 pt-4 border-t border-white/[0.04] flex items-center justify-center gap-6">
        <button
          onClick={() => navigate({ to: "/" })}
          title="Otix Catalog"
          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--dk-surface-ghost)] group-hover:bg-primary/20 border border-white/[0.04] group-hover:border-primary/40 flex items-center justify-center transition-colors shadow">
            <Gamepad2 size={20} className="text-primary" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Catalog</span>
        </button>

        <button
          onClick={() => navigate({ to: '/settings/launcher' })}
          title="System Settings"
          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--dk-surface-ghost)] group-hover:bg-[var(--dk-surface-field)] border border-white/[0.04] flex items-center justify-center transition-colors shadow">
            <Settings size={20} className="text-muted-foreground group-hover:text-foreground" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
        </button>

        <button
          onClick={() => navigate({ to: "/" })}
          title="Exit to Desktop"
          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-[var(--dk-surface-ghost)] group-hover:bg-primary/20 border border-white/[0.04] group-hover:border-primary/40 flex items-center justify-center transition-colors shadow">
            <Power size={20} className="text-muted-foreground group-hover:text-primary" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Sleep</span>
        </button>
      </footer>

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
