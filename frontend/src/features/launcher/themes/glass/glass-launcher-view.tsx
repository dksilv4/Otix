import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  Search,
  RotateCw,
  ArrowLeft,
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

export const GlassLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated: _isAuthenticated } = useAuth()
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

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  const activeBackdrop =
    activeGame?.otixBackdropUrl ||
    activeGame?.backdropUrl ||
    activeGame?.data?.backdropUrl ||
    activeGame?.posterUrl

  return (
    <div className="relative w-full h-full bg-background text-foreground flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Background Animated Gradient Orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-primary/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Dynamic blurred game backdrop */}
      <AnimatePresence mode="wait">
        {activeBackdrop && (
          <motion.div
            key={activeBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 pointer-events-none"
            style={{ backgroundImage: `url(${activeBackdrop})` }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-background/50 backdrop-blur-3xl pointer-events-none" />

      {/* Top Glass Floating Header */}
      <header className="relative z-20 px-8 pt-6">
        <div className="px-6 py-3.5 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl border border-white/[0.04] shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Return to Otix"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-[var(--dk-surface-ghost)] flex items-center justify-center border border-white/[0.04]">
                <ArrowLeft size={16} />
              </div>
              <span className="text-xs font-black tracking-wider uppercase">Otix</span>
            </button>

            <div className="h-5 w-px bg-[var(--dk-separator)]" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-foreground">SPATIAL GLASS</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30">
                V10
              </span>
            </div>
          </div>

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

            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
              <input
                type="text"
                placeholder="Search aero library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground border border-white/[0.04] outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <button
              onClick={() => navigate({ to: '/settings/launcher' })}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <Settings size={16} />
            </button>

            {/* Profile */}
            <button
              onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
              className="flex items-center gap-2.5 pl-2 cursor-pointer hover:opacity-90"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-xl object-cover ring-1 ring-white/20" />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-xs font-black text-white shadow-lg">
                  {(user?.username?.[0] || "U").toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Aero Glass Stage */}
      <div className="relative z-10 px-8 py-6 flex-1 flex flex-col justify-between overflow-hidden">
        {activeGame && (
          <div className="max-w-3xl space-y-4">
            <motion.div
              key={activeGame.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 rounded-3xl bg-white/[0.05] backdrop-blur-2xl border border-white/[0.12] shadow-[0_16px_50px_rgba(0,0,0,0.5)] space-y-4"
            >
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-primary/20 text-primary font-extrabold text-[10px] tracking-wider uppercase border border-primary/30">
                  {activeGame.platform}
                </span>
                {activeGame.data?.avgRating && (
                  <span className="text-xs font-bold text-primary">★ {activeGame.data.avgRating}%</span>
                )}
              </div>

              {activeGame.otixLogoUrl || activeGame.data?.logoUrl ? (
                <div className="max-h-20 max-w-sm drop-shadow-xl">
                  <MediaLogo
                    src={activeGame.otixLogoUrl || activeGame.data?.logoUrl || ''}
                    alt={activeGame.title}
                    className="max-h-16 max-w-xs object-contain"
                  />
                </div>
              ) : (
                <h1 className="text-4xl lg:text-5xl font-black text-foreground tracking-tight">
                  {activeGame.title}
                </h1>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                {activeGame.description || activeGame.data?.overview}
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handlePlayGame(activeGame)}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Play size={14} className="fill-current" />
                  <span>Launch Title</span>
                </button>

                <button
                  onClick={() => setDetailGame(activeGame)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] text-foreground font-bold text-xs uppercase tracking-wider border border-white/[0.04] transition-all cursor-pointer"
                >
                  <Sliders size={13} />
                  <span>Settings</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Bottom Floating Glass Card Shelf */}
        <div className="pb-16 pt-2">
          <div
            ref={containerRef}
            className="flex items-center gap-4 overflow-x-auto no-scrollbar py-3 scroll-smooth"
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
                  className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer bg-[var(--dk-surface-glass)] border border-white/[0.04] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-[1.03] active:scale-[0.97] ${
                    isSelected
                      ? "w-36 sm:w-44 aspect-[3/4] ring-2 ring-primary shadow-lg shadow-primary/25"
                      : "w-28 sm:w-36 aspect-[3/4] opacity-70 hover:opacity-100 ring-1 ring-white/[0.06]"
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
                    <div className="w-full h-full bg-[var(--dk-surface-ghost)] flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                      {game.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent flex flex-col justify-end p-2.5">
                    <span className="text-[11px] font-bold text-foreground truncate">{game.title}</span>
                  </div>
                </div>
              )
            })}
            {paddingEnd > 0 && (
              <div style={{ width: paddingEnd, flexShrink: 0 }} aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

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
