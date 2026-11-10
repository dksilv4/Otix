import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  Volume2,
  VolumeX,
  Clock,
  ArrowLeft,
  Search,
  RotateCw,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { useVirtualRow } from "@/features/launcher/hooks/use-virtual-grid"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const PlayStationLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { runningGame, runningGames = [], cycleActiveGame } = useRunningGame()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [soundEnabled, setSoundEnabled] = useState(true)
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
    itemWidth: 160,
    gap: 16,
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

  const activeBackdrop =
    activeGame?.otixBackdropUrl ||
    activeGame?.backdropUrl ||
    activeGame?.data?.backdropUrl ||
    activeGame?.posterUrl

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  return (
    <div className="relative w-full h-full bg-background text-foreground flex flex-col justify-between select-none overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        {activeBackdrop && (
          <motion.div
            key={activeBackdrop}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 0.45, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute inset-0 bg-cover bg-center pointer-events-none filter saturate-120"
            style={{ backgroundImage: `url(${activeBackdrop})` }}
          />
        )}
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />

      {/* Top Status & User Navigation Bar */}
      <header className="relative z-20 px-10 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate({ to: "/" })}
            title="Exit Launcher (Back to Otix)"
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center border border-white/10 transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span className="text-xs uppercase font-bold tracking-widest text-white/60 group-hover:text-white transition-colors">
              Otix Home
            </span>
          </button>

          <div className="flex items-center gap-2 pl-4 border-l border-white/10">
            <span className="text-lg font-black tracking-widest text-foreground">OTIX</span>
            <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              CrossBar V4
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
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

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-white/40 hover:text-white transition-colors cursor-pointer p-1"
            title={soundEnabled ? "Mute ambient" : "Unmute ambient"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={() => navigate({ to: '/settings/launcher' })}
            className="text-white/40 hover:text-white transition-colors cursor-pointer p-1"
            title="Launcher Settings"
          >
            <Settings size={16} />
          </button>

          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            title={user?.username ? `View ${user.username}'s profile` : "User Profile"}
            className="flex items-center gap-2.5 pl-3 border-l border-white/15 cursor-pointer hover:opacity-90 transition-opacity"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.username || "User"}
                className="w-7 h-7 rounded-full object-cover border border-white/20 shadow-md"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
                {(user?.username?.[0] || "U").toUpperCase()}
              </div>
            )}
            <span className="text-xs font-bold text-white/80 max-w-[120px] truncate">
              {user?.username || (isAuthenticated ? "Player" : "Guest")}
            </span>
          </button>
        </div>
      </header>

      {/* Center Hero Focus */}
      <div className="relative z-20 px-12 pt-6 max-w-2xl space-y-4">
        {activeGame && (
          <motion.div
            key={activeGame.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-3"
          >
            {activeGame.otixLogoUrl || activeGame.data?.logoUrl ? (
              <div className="max-h-24 max-w-sm drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]">
                <MediaLogo
                  src={activeGame.otixLogoUrl || activeGame.data?.logoUrl || ""}
                  alt={activeGame.title}
                  className="max-h-20 max-w-xs object-contain"
                />
              </div>
            ) : (
              <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-2xl">
                {activeGame.title}
              </h1>
            )}

            <div className="flex items-center gap-4 text-xs text-white/60 pt-1">
              <span className="px-2 py-0.5 rounded bg-white/10 text-white font-semibold text-[11px]">
                {activeGame.platform?.toUpperCase() || "GAME"}
              </span>
              {activeGame.data?.releaseDate && (
                <span>{new Date(activeGame.data.releaseDate).getFullYear()}</span>
              )}
              {activeGame.data?.avgRating && (
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  ★ {(activeGame.data.avgRating / 10).toFixed(1)}
                </span>
              )}
              <span className="flex items-center gap-1 text-white/50">
                <Clock size={12} />
                {activeGame.data?.steamPlaytimeForever
                  ? `${(activeGame.data.steamPlaytimeForever / 60).toFixed(1)} hrs played`
                  : "Ready to Play"}
              </span>
            </div>

            <p className="text-xs text-white/70 line-clamp-2 leading-relaxed max-w-xl drop-shadow">
              {activeGame.description || activeGame.data?.overview || "Select Play to begin."}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handlePlayGame(activeGame)}
                className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-white text-black font-extrabold text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.4)] cursor-pointer"
              >
                <Play size={16} fill="black" />
                <span>Play Game</span>
              </button>

              <button
                onClick={() => setDetailGame(activeGame)}
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              >
                <Sliders size={14} />
                <span>Overview & Stats</span>
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom CrossBar Horizontal Ribbon */}
      <div className="relative z-20 pb-20 pt-4">
        <div className="px-12 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-muted-foreground">
            <span>Games Ribbon</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-primary">{filteredGames.length} Available</span>
          </div>

          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <input
              type="text"
              placeholder="Quick search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] focus:bg-[var(--dk-surface-field)] rounded-full pl-8 pr-3 py-1 text-xs text-foreground placeholder:text-muted-foreground border border-white/[0.04] outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex items-center gap-4 px-12 overflow-x-auto no-scrollbar py-3 scroll-smooth"
        >
          {paddingStart > 0 && (
            <div style={{ width: paddingStart, flexShrink: 0 }} aria-hidden="true" />
          )}
          {virtualItems.map(({ item: game, index }) => {
            const isSelected = activeGame?.id === game.id
            const poster = game.otixPosterUrl || game.posterUrl
            const isAboveFold = isSelected || index < 5

            return (
              <div
                key={game.id}
                onClick={() => selectGame(game.id)}
                className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-[1.03] active:scale-[0.97] ${
                  isSelected
                    ? "w-40 sm:w-48 aspect-[2/3] ring-2 ring-primary shadow-lg shadow-primary/25"
                    : "w-32 sm:w-36 aspect-[2/3] opacity-60 hover:opacity-95 ring-1 ring-white/[0.06]"
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
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent flex flex-col justify-end p-3">
                    <span className="text-xs font-extrabold text-foreground truncate">{game.title}</span>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider">
                      Press Play
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {paddingEnd > 0 && (
            <div style={{ width: paddingEnd, flexShrink: 0 }} aria-hidden="true" />
          )}
        </div>
      </div>

      {detailGame && (
        <LauncherGameSheet
          game={detailGame}
          onClose={() => setDetailGame(null)}
        />
      )}

      {hasDisambiguationTarget && <ConsoleDisambiguationModal {...disambiguationModalProps} />}
    </div>
  )
};
