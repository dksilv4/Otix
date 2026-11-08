import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  Search,
  RotateCw,
  ArrowLeft,
  Flame,
  Gamepad2,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const XboxLauncherView = () => {
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

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  const spotlightBackdrop =
    activeGame?.otixBackdropUrl ||
    activeGame?.backdropUrl ||
    activeGame?.data?.backdropUrl ||
    activeGame?.posterUrl

  return (
    <div className="relative w-full h-full bg-[#0a0d0c] text-white flex flex-col select-none overflow-y-auto no-scrollbar font-sans">
      {/* Xbox Green Accent Subtle Grid & Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,124,16,0.18),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(16,124,16,0.1),transparent_50%)] pointer-events-none" />

      {/* Top Gamertag & System Navigation */}
      <header className="relative z-20 px-8 py-5 flex items-center justify-between border-b border-white/[0.06] backdrop-blur-md bg-black/40">
        <div className="flex items-center gap-5">
          <button
            onClick={() => navigate({ to: "/" })}
            title="Exit Launcher (Back to Otix)"
            className="flex items-center gap-2 text-white/50 hover:text-[#107c10] transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-white/5 group-hover:bg-[#107c10]/20 flex items-center justify-center border border-white/10 group-hover:border-[#107c10]/40 transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span className="text-xs uppercase font-extrabold tracking-wider">Otix Hub</span>
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <span className="text-base font-black tracking-wider text-white">OTIX</span>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[#107c10]/25 text-[#107c10] border border-[#107c10]/40">
              Blade V5
            </span>
          </div>
        </div>

        {/* Gamertag & Status */}
        <div className="flex items-center gap-4">
          {runningGame && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-primary/20 text-primary text-xs font-bold border border-primary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Playing {runningGame.game.title}</span>
              {runningGames.length > 1 && (
                <button
                  type="button"
                  onClick={() => void cycleActiveGame()}
                  title={`Running ${runningGames.length} games. Click or press Ctrl+Tab to cycle active game focus.`}
                  className="inline-flex items-center gap-1 pl-2 border-l border-primary/30 text-[10px] font-semibold text-primary hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCw className="h-2.5 w-2.5" />
                  <span>+${runningGames.length - 1}</span>
                </button>
              )}
            </div>
          )}

          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" size={13} />
            <input
              type="text"
              placeholder="Find game..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 hover:bg-white/10 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-white/30 border border-white/10 outline-none focus:border-[#107c10] transition-colors"
            />
          </div>

          <button
            onClick={() => navigate({ to: '/settings/launcher' })}
            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings size={16} />
          </button>

          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            title={user?.username ? `Gamertag: ${user.username}` : "Profile"}
            className="flex items-center gap-2.5 pl-3 border-l border-white/15 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="flex flex-col text-right">
              <span className="text-xs font-extrabold text-white truncate max-w-[120px]">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              <span className="text-[9px] font-bold text-[#107c10] uppercase tracking-wider">
                12,450 G
              </span>
            </div>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.username || "User"}
                className="w-8 h-8 rounded-md object-cover ring-2 ring-[#107c10]"
              />
            ) : (
              <div className="w-8 h-8 rounded-md bg-[#107c10] flex items-center justify-center text-xs font-black text-white shadow-md">
                {(user?.username?.[0] || "U").toUpperCase()}
              </div>
            )}
          </button>
        </div>
      </header>

      {/* Main Bento Live Grid Content */}
      <div className="p-8 space-y-8 max-w-7xl mx-auto w-full pb-24">
        {/* Top Hero Big Tile */}
        {activeGame && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Main Spotlight Tile */}
            <motion.div
              layout
              className="lg:col-span-8 h-80 rounded-2xl relative overflow-hidden group cursor-pointer border border-white/10 shadow-2xl"
              onClick={() => handlePlayGame(activeGame)}
            >
              {spotlightBackdrop && (
                <img
                  src={spotlightBackdrop}
                  alt={activeGame.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#107c10] text-black font-black text-[10px] tracking-wider uppercase shadow">
                    Jump Back In
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/50 text-white/80 text-[10px] font-bold uppercase backdrop-blur-sm border border-white/10">
                    {activeGame.platform}
                  </span>
                </div>

                <div className="space-y-2">
                  {activeGame.otixLogoUrl || activeGame.data?.logoUrl ? (
                    <div className="max-h-16 max-w-xs">
                      <MediaLogo
                        src={activeGame.otixLogoUrl || activeGame.data?.logoUrl || ""}
                        alt={activeGame.title}
                        className="max-h-14 max-w-xs object-contain"
                      />
                    </div>
                  ) : (
                    <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-md">
                      {activeGame.title}
                    </h2>
                  )}

                  <p className="text-xs text-white/70 line-clamp-2 max-w-xl">
                    {activeGame.description || activeGame.data?.overview}
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlayGame(activeGame)
                      }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#107c10] hover:bg-[#149c14] text-white font-extrabold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,124,16,0.6)] cursor-pointer"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Press A to Play</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetailGame(activeGame)
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider backdrop-blur-md border border-white/10 cursor-pointer"
                    >
                      <Sliders size={13} />
                      <span>Manage</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Stat & Telemetry Tile */}
            <div className="lg:col-span-4 grid grid-rows-2 gap-5">
              {/* Game Stats Tile */}
              <div className="p-5 rounded-2xl bg-[#111714] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#107c10] uppercase tracking-wider">
                    Quick Resume
                  </span>
                  <Flame size={16} className="text-[#107c10]" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">Instant State</div>
                  <p className="text-xs text-white/50 mt-1">
                    Ready to resume right where you left off.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-white/60">
                  <span>Last session</span>
                  <span className="font-bold text-white">Yesterday</span>
                </div>
              </div>

              {/* Game Pass / Catalog Tile */}
              <div
                onClick={() => navigate({ to: "/" })}
                className="p-5 rounded-2xl bg-gradient-to-br from-[#107c10]/20 to-[#0e1f13] border border-[#107c10]/30 flex flex-col justify-between cursor-pointer hover:border-[#107c10]/60 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    Otix Catalog
                  </span>
                  <Gamepad2 size={16} className="text-[#107c10] group-hover:scale-110 transition-transform" />
                </div>
                <div>
                  <div className="text-xl font-black text-white">Discover More</div>
                  <p className="text-xs text-white/60 mt-1">
                    Browse all media, movies, shows, and games.
                  </p>
                </div>
                <span className="text-[10px] font-bold text-[#107c10] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                  Explore Catalog →
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bento Grid: My Games & Apps Matrix */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-white/70">
              My Games & Apps ({filteredGames.length})
            </h3>
            <span className="text-xs text-white/40 font-medium">Select tile to focus</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredGames.map((game) => {
              const isSelected = activeGame?.id === game.id
              const poster = game.otixPosterUrl || game.posterUrl

              return (
                <motion.div
                  key={game.id}
                  onClick={() => selectGame(game.id)}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className={`aspect-[3/4] rounded-xl overflow-hidden cursor-pointer relative border transition-all duration-200 group ${
                    isSelected
                      ? "border-[#107c10] ring-4 ring-[#107c10]/40 shadow-[0_0_24px_rgba(16,124,16,0.4)]"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  {poster ? (
                    <img
                      src={poster}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-900 flex items-center justify-center p-3 text-center">
                      <span className="text-xs font-bold text-white/60">{game.title}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                    <span className="text-xs font-black text-white truncate">{game.title}</span>
                    <span className="text-[10px] text-[#107c10] font-bold">Select</span>
                  </div>
                </motion.div>
              )
            })}
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
