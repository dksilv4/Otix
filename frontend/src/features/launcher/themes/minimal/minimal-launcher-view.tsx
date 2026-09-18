import { useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  ArrowLeft,
  Search,
  Sliders,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export function MinimalLauncherView() {
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
        title: "Desktop App Required",
        description: "Install Otix Desktop to launch games.",
        variant: "default",
      })
      return
    }
    try {
      await api.launchGame(game)
      toast({
        title: "Launched",
        description: `Now playing ${game.title}`,
        variant: "success",
      })
    } catch {
      toast({
        title: "Launch Failed",
        description: "Could not execute binary.",
        variant: "error",
      })
    }
  }

  return (
    <div className="relative w-full h-full bg-[#0d0d0f] text-neutral-200 flex select-none overflow-hidden font-sans">
      {/* Left Clean Editorial Index */}
      <aside className="w-80 lg:w-96 border-r border-white/[0.08] flex flex-col justify-between p-8 shrink-0 bg-[#0a0a0c]">
        <div className="space-y-8">
          {/* Brand header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Return to Otix"
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs uppercase tracking-widest font-semibold"
            >
              <ArrowLeft size={14} />
              <span>Otix</span>
            </button>
            <span className="text-[10px] tracking-widest uppercase font-mono text-neutral-500">
              V8 · Minimal
            </span>
          </div>

          {/* User info */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-neutral-400">Library</span>
            <span className="text-xs font-mono text-neutral-300">
              {filteredGames.length} titles
            </span>
          </div>

          {/* Clean search */}
          <div className="relative">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent pl-6 pr-2 py-1 text-xs text-neutral-200 placeholder-neutral-600 border-b border-neutral-800 focus:border-neutral-400 outline-none transition-colors"
            />
          </div>

          {/* Vertical Title List */}
          <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto no-scrollbar pr-2">
            {filteredGames.map((game, i) => {
              const isSelected = activeGame?.id === game.id
              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={`group flex items-center justify-between py-2 px-2.5 rounded cursor-pointer transition-all ${
                    isSelected
                      ? "text-white font-bold bg-white/10"
                      : "text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  <span className="text-xs truncate">{game.title}</span>
                  <span className="text-[10px] font-mono text-neutral-600 group-hover:text-neutral-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* User Pill Footer */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-neutral-500">
          <span>{user?.username || (isAuthenticated ? "Player" : "Guest")}</span>
          <button
            onClick={() => navigate({ to: '/settings/launcher' })}
            className="hover:text-white transition-colors cursor-pointer"
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
              <div className="flex items-center gap-3 text-xs tracking-widest uppercase text-neutral-500 font-mono">
                <span>{activeGame.platform}</span>
                <span>/</span>
                <span>{activeGame.data?.releaseDate ? new Date(activeGame.data.releaseDate).getFullYear() : "Archived"}</span>
                {activeGame.data?.avgRating && (
                  <>
                    <span>/</span>
                    <span className="text-neutral-300">Rating {activeGame.data.avgRating}%</span>
                  </>
                )}
              </div>

              <h1 className="text-5xl lg:text-6xl font-light tracking-tight text-white">
                {activeGame.title}
              </h1>

              <p className="text-sm text-neutral-400 leading-relaxed font-light max-w-2xl pt-2">
                {activeGame.description || activeGame.data?.overview}
              </p>
            </div>

            {/* Clean Full-Width Hero Art View */}
            <div className="relative aspect-[21/9] rounded-xl overflow-hidden bg-neutral-900 border border-white/5 shadow-2xl">
              {activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl ? (
                <img
                  src={activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl || ""}
                  alt={activeGame.title}
                  className="w-full h-full object-cover filter brightness-95 contrast-105"
                />
              ) : null}
            </div>

            {/* Launch Actions */}
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={() => handlePlayGame(activeGame)}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                <Play size={14} fill="black" />
                <span>Launch Title</span>
              </button>

              <button
                onClick={() => setDetailGame(activeGame)}
                className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/20 text-white hover:bg-white/5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <Sliders size={13} />
                <span>Details & Art</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-neutral-500 text-sm">No title selected.</div>
        )}

        <div className="pt-12 text-xs text-neutral-600 font-mono flex items-center justify-between">
          <span>OTIX ZEN GALLERY</span>
          <span>PRESS ALT+T FOR THEMES</span>
        </div>
      </main>

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
