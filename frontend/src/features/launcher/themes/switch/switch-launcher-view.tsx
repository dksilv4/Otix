import { useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Play,
  Settings,
  Sliders,
  Sparkles,
  ArrowLeft,
  Volume2,
  Gamepad2,
  Power,
  Search,
} from "lucide-react"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@/old-features/ui/molecules/toast"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export function SwitchLauncherView() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const isDesktop = hasDesktopAPI()
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
    <div className="relative w-full h-full bg-[#1b1c20] text-neutral-100 flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Top Switch Navigation Bar */}
      <header className="relative z-20 px-8 py-5 flex items-center justify-between border-b border-white/[0.08]">
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
                className="w-10 h-10 rounded-full object-cover ring-2 ring-rose-500 shadow-md group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-red-600 flex items-center justify-center text-sm font-black text-white ring-2 ring-rose-400/50 shadow-md group-hover:scale-105 transition-transform">
                {(user?.username?.[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-sm font-extrabold text-white group-hover:text-rose-400 transition-colors">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
                Online
              </span>
            </div>
          </button>

          <div className="h-6 w-px bg-white/10 mx-2" />

          <button
            onClick={() => navigate({ to: "/" })}
            title="Exit to Otix Hub"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Otix App</span>
          </button>
        </div>

        {/* Right Status / Clock */}
        <div className="flex items-center gap-4">
          {runningGame && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/40">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Playing {runningGame.title}</span>
            </div>
          )}

          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" size={12} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 hover:bg-white/10 rounded-full pl-7 pr-3 py-1 text-xs text-white placeholder-white/30 outline-none border border-white/10 focus:border-rose-500/50 transition-colors"
            />
          </div>

          <span className="text-sm font-bold text-white/80 font-mono">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </header>

      {/* Middle Carousel of Large Game Cards */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8">
        {/* Selected Game Title & Launch Action Indicator */}
        <div className="max-w-4xl mx-auto w-full mb-4 px-2 flex items-end justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 block mb-1">
              Selected Game
            </span>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-white drop-shadow">
              {activeGame?.title || "No games found"}
            </h2>
            <span className="text-xs text-white/50 font-medium">
              {activeGame?.platform?.toUpperCase()} · {activeGame?.description?.slice(0, 90) || "Ready to play."}...
            </span>
          </div>

          {activeGame && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePlayGame(activeGame)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(225,29,72,0.5)] active:scale-95 transition-all cursor-pointer"
              >
                <Play size={14} fill="white" />
                <span>Start</span>
              </button>
              <button
                onClick={() => setDetailGame(activeGame)}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Game Options"
              >
                <Sliders size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Big Horizontal Card Carousel */}
        <div className="flex items-center gap-5 overflow-x-auto no-scrollbar py-6 px-4 scroll-smooth">
          {filteredGames.map((game) => {
            const isSelected = activeGame?.id === game.id
            const poster = game.otixPosterUrl || game.posterUrl

            return (
              <motion.div
                key={game.id}
                onClick={() => setSelectedGameId(game.id)}
                whileHover={{ y: -8, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? "w-48 sm:w-56 aspect-[3/4] ring-4 ring-rose-500 shadow-[0_20px_45px_rgba(225,29,72,0.45)]"
                    : "w-36 sm:w-44 aspect-[3/4] opacity-70 hover:opacity-100 ring-1 ring-white/10"
                }`}
              >
                {poster ? (
                  <img src={poster} alt={game.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-neutral-800 flex items-center justify-center p-3 text-center">
                    <span className="text-xs font-bold text-white/70">{game.title}</span>
                  </div>
                )}

                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-rose-600 text-[9px] font-black uppercase tracking-wider text-white shadow">
                    Active
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Bottom Switch Circle Dock Buttons */}
      <footer className="relative z-20 px-8 pb-20 pt-4 border-t border-white/[0.08] flex items-center justify-center gap-6">
        <button
          onClick={() => navigate({ to: "/" })}
          title="Otix Catalog"
          className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-rose-600/20 group-hover:border-rose-500/50 border border-white/10 flex items-center justify-center transition-colors shadow">
            <Gamepad2 size={20} className="text-rose-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Catalog</span>
        </button>

        <button
          onClick={() => navigate({ to: "/settings/launcher" })}
          title="System Settings"
          className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors shadow">
            <Settings size={20} className="text-white/70" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
        </button>

        <button
          onClick={() => navigate({ to: "/" })}
          title="Exit to Desktop"
          className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-rose-600/20 group-hover:border-rose-500/50 border border-white/10 flex items-center justify-center transition-colors shadow">
            <Power size={20} className="text-white/70 group-hover:text-rose-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Sleep</span>
        </button>
      </footer>

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
