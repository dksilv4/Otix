import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Terminal,
  Play,
  Sliders,
  Cpu,
  Activity,
  Radio,
  Search,
  ArrowLeft,
} from "lucide-react"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useAuth } from "@/lib/providers/auth"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export function RetroLauncherView() {
  const navigate = useNavigate()
  const { user, isAuthenticated: _isAuthenticated } = useAuth()
  const _isDesktop = hasDesktopAPI()
  const { data: localGames = [] } = useLauncherVisibleGames()
  const { data: popularGames = [] } = usePopularGames()
  const { runningGame: _runningGame } = useRunningGame()
  const { toast } = useToast()

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Telemetry ticker state
  const [cpuUsage, setCpuUsage] = useState(24)
  const [ramUsage, setRamUsage] = useState(4.2)
  const [fpsVal, setFpsVal] = useState(144)

  useEffect(() => {
    const timer = setInterval(() => {
      setCpuUsage(Math.floor(18 + Math.random() * 15))
      setRamUsage(Number((4.1 + Math.random() * 0.4).toFixed(1)))
      setFpsVal(Math.floor(142 + Math.random() * 5))
    }, 2000)
    return () => clearInterval(timer)
  }, [])

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
        title: "DAEMON OFFLINE",
        description: "Otix Desktop engine not detected on localhost.",
        variant: "default",
      })
      return
    }
    try {
      await api.launchGame(game)
      toast({
        title: "EXEC PROCESS INITIALIZED",
        description: `Spawning ${game.title}...`,
        variant: "success",
      })
    } catch {
      toast({
        title: "EXEC FAILURE",
        description: "Process spawn returned non-zero code.",
        variant: "error",
      })
    }
  }

  return (
    <div className="relative w-full h-full bg-[#080a08] text-[#33ff33] flex flex-col justify-between font-mono select-none overflow-hidden">
      {/* CRT Scanline and Phosphor Glow effect */}
      <div
        className="absolute inset-0 pointer-events-none z-30 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.75) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))",
          backgroundSize: "100% 3px, 6px 100%",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_60%,_rgba(0,0,0,0.85)_100%)] pointer-events-none z-20" />

      {/* Top Cyberpunk Telemetry Terminal Header */}
      <header className="relative z-20 px-6 py-4 border-b border-[#1f3f1f] bg-[#0c120c]/90 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: "/" })}
            title="Disconnect Terminal (Return to Otix)"
            className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#1f3f1f]/40 hover:bg-[#33ff33]/20 text-[#33ff33] border border-[#1f3f1f] transition-all cursor-pointer text-xs"
          >
            <ArrowLeft size={13} />
            <span>EXIT://OTIX</span>
          </button>

          <div className="flex items-center gap-2 text-xs">
            <Terminal size={14} className="text-[#33ff33] animate-pulse" />
            <span className="font-black tracking-widest text-[#33ff33]">NETRUNNER_V7</span>
            <span className="text-[10px] text-[#227722] font-bold">[ONLINE]</span>
          </div>
        </div>

        {/* Live System Diagnostics */}
        <div className="flex items-center gap-5 text-xs text-[#228822]">
          <div className="flex items-center gap-1.5">
            <Cpu size={13} />
            <span className="text-[#33ff33]">CPU: {cpuUsage}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity size={13} />
            <span className="text-[#33ff33]">RAM: {ramUsage}GB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio size={13} />
            <span className="text-[#33ff33]">{fpsVal} FPS</span>
          </div>

          {/* User NetID */}
          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            className="flex items-center gap-2 pl-3 border-l border-[#1f3f1f] text-[#33ff33] hover:underline cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-[#33ff33] animate-ping" />
            <span className="font-bold">USER::{user?.username?.toUpperCase() || "ROOT"}</span>
          </button>
        </div>
      </header>

      {/* Main Terminal Body: Dual Column Matrix */}
      <div className="relative z-20 flex-1 flex overflow-hidden">
        {/* Left Game Matrix Table */}
        <aside className="w-80 lg:w-96 border-r border-[#1f3f1f] bg-[#091009]/80 flex flex-col">
          <div className="p-3 border-b border-[#1f3f1f]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#227722]" size={13} />
              <input
                type="text"
                placeholder="GREP TARGET..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#050805] text-[#33ff33] placeholder-[#1f4f1f] text-xs px-8 py-1.5 rounded border border-[#1f3f1f] outline-none focus:border-[#33ff33] transition-colors uppercase"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
            <div className="text-[10px] text-[#227722] px-2 py-1 uppercase tracking-widest font-bold">
              // BINARY REGISTRY ({filteredGames.length} NODES)
            </div>
            {filteredGames.map((game, idx) => {
              const isSelected = activeGame?.id === game.id
              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={`px-3 py-2 rounded text-xs cursor-pointer flex items-center justify-between border transition-all ${
                    isSelected
                      ? "bg-[#33ff33]/15 text-[#33ff33] border-[#33ff33] font-bold shadow-[0_0_12px_rgba(51,255,51,0.2)]"
                      : "text-[#228822] border-transparent hover:bg-[#112211] hover:text-[#33ff33]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-[#1f4f1f] font-mono">[{String(idx + 1).padStart(2, "0")}]</span>
                    <span className="truncate">{game.title}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-[#050805] border border-[#1f3f1f] text-[#227722] shrink-0">
                    {game.platform}
                  </span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Right Active Node Inspector */}
        <main className="flex-1 flex flex-col justify-between p-8 overflow-y-auto no-scrollbar bg-[#070b07]">
          {activeGame ? (
            <div className="space-y-6 max-w-4xl">
              {/* Header block */}
              <div className="border border-[#1f3f1f] bg-[#0d160d] p-5 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#228822]">
                  <span>NODE_ID: {activeGame.id}</span>
                  <span>STATUS: READY_FOR_EXEC</span>
                </div>
                <h1 className="text-3xl font-black tracking-wider text-[#33ff33] uppercase">
                  {activeGame.title}
                </h1>
                <p className="text-xs text-[#22aa22] leading-relaxed">
                  {activeGame.description || activeGame.data?.overview || "Binary payload loaded."}
                </p>
              </div>

              {/* Graphic Card Visualizer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="aspect-[16/9] rounded-lg overflow-hidden border border-[#1f3f1f] bg-black relative group">
                  {activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl ? (
                    <img
                      src={activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl || ""}
                      alt={activeGame.title}
                      className="w-full h-full object-cover filter grayscale contrast-150 group-hover:filter-none transition-all duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#227722]">
                      NO FEED SIGNAL
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-[#33ff33] border border-[#33ff33]/40">
                    RAW FEED // CAM 01
                  </div>
                </div>

                {/* Telemetry Panel */}
                <div className="border border-[#1f3f1f] rounded-lg p-5 bg-[#091009] space-y-3 text-xs">
                  <div className="text-[11px] font-bold text-[#33ff33] uppercase tracking-wider border-b border-[#1f3f1f] pb-2">
                    // PAYLOAD SPECIFICATIONS
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1f3f1f]/50">
                    <span className="text-[#227722]">ENGINE / PLATFORM:</span>
                    <span className="text-[#33ff33] uppercase">{activeGame.platform}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1f3f1f]/50">
                    <span className="text-[#227722]">RELEASE EPOCH:</span>
                    <span className="text-[#33ff33]">{activeGame.data?.releaseDate || "ARCHIVE"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1f3f1f]/50">
                    <span className="text-[#227722]">GLOBAL RATING:</span>
                    <span className="text-[#33ff33]">{activeGame.data?.avgRating ? `${activeGame.data.avgRating}/100` : "N/A"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#227722]">LOGGED CYCLES:</span>
                    <span className="text-[#33ff33]">
                      {activeGame.data?.steamPlaytimeForever
                        ? `${(activeGame.data.steamPlaytimeForever / 60).toFixed(1)} HRS`
                        : "0.0 HRS"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Execution Actions */}
              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={() => handlePlayGame(activeGame)}
                  className="flex items-center gap-2 px-8 py-3 rounded bg-[#33ff33] hover:bg-[#44ff44] text-black font-black text-xs uppercase tracking-widest cursor-pointer shadow-[0_0_20px_rgba(51,255,51,0.5)] active:scale-95 transition-all"
                >
                  <Play size={14} fill="black" />
                  <span>INITIALIZE PROCESS</span>
                </button>

                <button
                  onClick={() => setDetailGame(activeGame)}
                  className="flex items-center gap-2 px-5 py-3 rounded bg-[#122212] hover:bg-[#1a331a] text-[#33ff33] border border-[#1f3f1f] text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Sliders size={14} />
                  <span>PROPERTIES</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[#227722]">NO NODE SELECTED</div>
          )}

          {/* Bottom terminal status line */}
          <div className="pt-6 border-t border-[#1f3f1f] text-[11px] text-[#227722] flex justify-between">
            <span>OTIX_DAEMON://127.0.0.1:4545</span>
            <span>PRESS [ALT+T] TO CYCLE THEMES</span>
          </div>
        </main>
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
