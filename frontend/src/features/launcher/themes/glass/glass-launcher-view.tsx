import { useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  Search,
  ArrowLeft,
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

export function GlassLauncherView() {
  const navigate = useNavigate()
  const { user, isAuthenticated: _isAuthenticated } = useAuth()
  const _isDesktop = hasDesktopAPI()
  const { data: localGames = [] } = useLauncherVisibleGames()
  const { data: popularGames = [] } = usePopularGames()
  const { runningGame } = useRunningGame()
  const { toast } = useToast()

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

  const handlePlayGame = async (game: LocalGame) => {
    const api = getDesktopAPI()
    if (!api?.launchGame) {
      toast({
        title: "Desktop Client Required",
        description: "Install Otix Desktop to launch local games natively.",
        variant: "default",
      })
      return
    }
    try {
      await api.launchGame(game)
      toast({
        title: "Launching Game",
        description: `Starting ${game.title}...`,
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

  const activeBackdrop =
    activeGame?.otixBackdropUrl ||
    activeGame?.backdropUrl ||
    activeGame?.data?.backdropUrl ||
    activeGame?.posterUrl

  return (
    <div className="relative w-full h-full bg-[#07050d] text-white flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Background Animated Gradient Orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/30 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-pink-600/25 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-600/20 rounded-full blur-[140px] pointer-events-none" />

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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl pointer-events-none" />

      {/* Top Glass Floating Header */}
      <header className="relative z-20 px-8 pt-6">
        <div className="px-6 py-3.5 rounded-2xl bg-white/[0.06] backdrop-blur-2xl border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Return to Otix"
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                <ArrowLeft size={16} />
              </div>
              <span className="text-xs font-black tracking-wider uppercase">Otix</span>
            </button>

            <div className="h-5 w-px bg-white/15" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-white">SPATIAL GLASS</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-400/30">
                V10
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {runningGame && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Playing {runningGame.title}</span>
              </div>
            )}

            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={13} />
              <input
                type="text"
                placeholder="Search aero library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 hover:bg-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-white/40 border border-white/10 outline-none focus:border-purple-400/50 transition-colors"
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
                <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 font-extrabold text-[10px] tracking-wider uppercase border border-purple-400/30">
                  {activeGame.platform}
                </span>
                {activeGame.data?.avgRating && (
                  <span className="text-xs font-bold text-amber-300">★ {activeGame.data.avgRating}%</span>
                )}
              </div>

              {activeGame.otixLogoUrl || activeGame.data?.logoUrl ? (
                <div className="max-h-20 max-w-sm drop-shadow-xl">
                  <MediaLogo
                    logoUrl={activeGame.otixLogoUrl || activeGame.data?.logoUrl || null}
                    title={activeGame.title}
                    className="max-h-16 max-w-xs object-contain"
                  />
                </div>
              ) : (
                <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
                  {activeGame.title}
                </h1>
              )}

              <p className="text-xs text-white/70 leading-relaxed max-w-2xl">
                {activeGame.description || activeGame.data?.overview}
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handlePlayGame(activeGame)}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-extrabold text-xs uppercase tracking-wider shadow-[0_0_30px_rgba(168,85,247,0.5)] active:scale-95 transition-all cursor-pointer"
                >
                  <Play size={14} fill="white" />
                  <span>Launch Title</span>
                </button>

                <button
                  onClick={() => setDetailGame(activeGame)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider border border-white/15 backdrop-blur-xl transition-all cursor-pointer"
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
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-3 scroll-smooth">
            {filteredGames.map((game) => {
              const isSelected = activeGame?.id === game.id
              const poster = game.otixPosterUrl || game.posterUrl
              return (
                <motion.div
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  whileHover={{ y: -6, scale: 1.03 }}
                  className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer backdrop-blur-xl transition-all duration-300 ${
                    isSelected
                      ? "w-36 sm:w-44 aspect-[3/4] ring-2 ring-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                      : "w-28 sm:w-36 aspect-[3/4] opacity-70 hover:opacity-100 ring-1 ring-white/10"
                  }`}
                >
                  {poster ? (
                    <img src={poster} alt={game.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center p-2 text-center text-xs text-white/60">
                      {game.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2.5">
                    <span className="text-[11px] font-bold text-white truncate">{game.title}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
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
}
