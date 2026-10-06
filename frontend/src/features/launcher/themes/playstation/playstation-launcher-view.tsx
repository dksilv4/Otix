import { useState, useMemo } from "react"
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
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const PlayStationLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const _isDesktop = hasDesktopAPI()
  const { data: localGames = [] } = useLauncherVisibleGames()
  const { data: popularGames = [] } = usePopularGames()
  const { runningGame } = useRunningGame()
  const { toast } = useToast()

  const [soundEnabled, setSoundEnabled] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const allGames = useMemo(() => {
    const list: LocalGame[] = [...localGames]
    popularGames.forEach((pop) => {
      if (!list.some((g) => g.id === pop.id || g.title.toLowerCase() === pop.title.toLowerCase())) {
        list.push({
          id: pop.id,
          title: pop.title,
          platform: "steam",
          posterUrl: pop.posterUrl,
          otixPosterUrl: pop.posterUrl,
          otixBackdropUrl: pop.backdropUrl,
          otixLogoUrl: pop.logoUrl,
          description: pop.overview,
          data: pop,
        })
      }
    })
    return list
  }, [localGames, popularGames])

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return allGames
    return allGames.filter((g) => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [allGames, searchQuery])

  const activeGame = useMemo(() => {
    if (!filteredGames.length) return null
    if (selectedGameId) {
      const found = filteredGames.find((g) => g.id === selectedGameId)
      if (found) return found
    }
    return filteredGames[0]
  }, [filteredGames, selectedGameId])

  const activeBackdrop =
    activeGame?.otixBackdropUrl ||
    activeGame?.backdropUrl ||
    activeGame?.data?.backdropUrl ||
    activeGame?.posterUrl

  const handlePlayGame = async (game: LocalGame) => {
    const api = getDesktopAPI()
    if (!api?.launchGame) {
      toast({
        title: "Desktop Client Required",
        description: "Install the Otix Desktop app to launch games natively.",
        variant: "default",
      })
      return
    }
    try {
      await api.launchGame(game)
      toast({
        title: "Starting Game",
        description: `Launching ${game.title}...`,
        variant: "success",
      })
    } catch {
      toast({
        title: "Launch Failed",
        description: "Could not launch game executable.",
        variant: "error",
      })
    }
  }

  return (
    <div className="relative w-full h-full bg-[#05070e] text-white flex flex-col justify-between select-none overflow-hidden font-sans">
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

      <div className="absolute inset-0 bg-gradient-to-t from-[#05070e] via-[#05070e]/60 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05070e] via-[#05070e]/40 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent pointer-events-none" />

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
            <span className="text-lg font-black tracking-widest text-white">OTIX</span>
            <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              CrossBar V4
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {runningGame && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Playing {runningGame.title}</span>
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
                  logoUrl={activeGame.otixLogoUrl || activeGame.data?.logoUrl || null}
                  title={activeGame.title}
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
          <div className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-white/50">
            <span>Games Ribbon</span>
            <span className="text-white/20">·</span>
            <span className="text-blue-400">{filteredGames.length} Available</span>
          </div>

          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" size={13} />
            <input
              type="text"
              placeholder="Quick search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 rounded-full pl-8 pr-3 py-1 text-xs text-white placeholder-white/30 border border-white/10 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 px-12 overflow-x-auto no-scrollbar py-3 scroll-smooth">
          {filteredGames.map((game) => {
            const isSelected = activeGame?.id === game.id
            const poster = game.otixPosterUrl || game.posterUrl

            return (
              <motion.div
                key={game.id}
                layout
                onClick={() => setSelectedGameId(game.id)}
                whileHover={{ y: -6, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? "w-40 sm:w-48 aspect-[2/3] ring-4 ring-white shadow-[0_16px_40px_rgba(37,99,235,0.6)]"
                    : "w-32 sm:w-36 aspect-[2/3] opacity-60 hover:opacity-95 ring-1 ring-white/10"
                }`}
              >
                {poster ? (
                  <img src={poster} alt={game.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center p-3 text-center">
                    <span className="text-xs font-bold text-white/70">{game.title}</span>
                  </div>
                )}

                {isSelected && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3">
                    <span className="text-xs font-extrabold text-white truncate">{game.title}</span>
                    <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                      Press Play
                    </span>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {detailGame && (
        <LauncherGameSheet
          game={detailGame}
          isOpen={!!detailGame}
          onClose={() => setDetailGame(null)}
        />
      )}
    </div>
  )
};
