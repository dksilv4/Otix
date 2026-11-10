import { useState, useEffect } from "react"
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
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const RetroLauncherView = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)

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
    <div className="relative w-full h-full bg-[var(--dk-surface-base)] text-primary flex flex-col justify-between font-mono select-none overflow-hidden">
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
      <header className="relative z-20 px-6 py-4 border-b border-white/[0.04] bg-[var(--dk-surface-overlay)]/90 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: "/" })}
            title="Disconnect Terminal (Return to Otix)"
            className="flex items-center gap-2 px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all cursor-pointer text-xs"
          >
            <ArrowLeft size={13} />
            <span>EXIT://OTIX</span>
          </button>

          <div className="flex items-center gap-2 text-xs">
            <Terminal size={14} className="text-primary animate-pulse" />
            <span className="font-black tracking-widest text-primary">NETRUNNER_V7</span>
            <span className="text-[10px] text-primary/60 font-bold">[ONLINE]</span>
          </div>
        </div>

        {/* Live System Diagnostics */}
        <div className="flex items-center gap-5 text-xs text-primary/70">
          <div className="flex items-center gap-1.5">
            <Cpu size={13} />
            <span className="text-primary">CPU: {cpuUsage}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity size={13} />
            <span className="text-primary">RAM: {ramUsage}GB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio size={13} />
            <span className="text-primary">{fpsVal} FPS</span>
          </div>

          {/* User NetID */}
          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            className="flex items-center gap-2 pl-3 border-l border-white/[0.06] text-primary hover:underline cursor-pointer"
          >
            <span className="font-bold">USER::{user?.username?.toUpperCase() || "ROOT"}</span>
          </button>
        </div>
      </header>

      {/* Main Terminal Body: Dual Column Matrix */}
      <div className="relative z-20 flex-1 flex overflow-hidden">
        {/* Left Game Matrix Table */}
        <aside className="w-80 lg:w-96 border-r border-white/[0.04] bg-[var(--dk-surface-subtle)] flex flex-col">
          <div className="p-3 border-b border-white/[0.04]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary/60" size={13} />
              <input
                type="text"
                placeholder="GREP TARGET..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-field)] text-primary placeholder:text-primary/40 text-xs px-8 py-1.5 rounded border border-white/[0.04] outline-none focus:border-primary transition-colors uppercase"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
            <div className="text-[10px] text-primary/60 px-2 py-1 uppercase tracking-widest font-bold">
              // BINARY REGISTRY ({filteredGames.length} NODES)
            </div>
            {filteredGames.map((game, idx) => {
              const isSelected = activeGame?.id === game.id
              return (
                <div
                  key={game.id}
                  onClick={() => selectGame(game.id)}
                  className={`px-3 py-2 rounded text-xs cursor-pointer flex items-center justify-between border transition-all ${
                    isSelected
                      ? "bg-primary/20 text-primary border-primary font-bold shadow-lg shadow-primary/25"
                      : "text-primary/70 border-transparent hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-primary/50 font-mono">[{String(idx + 1).padStart(2, "0")}]</span>
                    <span className="truncate">{game.title}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-[var(--dk-surface-raised)] border border-white/[0.04] text-primary/80 shrink-0">
                    {game.platform}
                  </span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Right Active Node Inspector */}
        <main className="flex-1 flex flex-col justify-between p-8 overflow-y-auto no-scrollbar bg-[var(--dk-surface-base)]">
          {activeGame ? (
            <div className="space-y-6 max-w-4xl">
              {/* Header block */}
              <div className="border border-white/[0.04] bg-[var(--dk-surface-subtle)] p-5 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-[11px] text-primary/70">
                  <span>NODE_ID: {activeGame.id}</span>
                  <span>STATUS: READY_FOR_EXEC</span>
                </div>
                <h1 className="text-3xl font-black tracking-wider text-primary uppercase">
                  {activeGame.title}
                </h1>
                <p className="text-xs text-primary/80 leading-relaxed">
                  {activeGame.description || activeGame.data?.overview || "Binary payload loaded."}
                </p>
              </div>

              {/* Graphic Card Visualizer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="aspect-[16/9] rounded-lg overflow-hidden border border-white/[0.04] bg-black relative group">
                  {activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl ? (
                    <img
                      src={activeGame.otixBackdropUrl || activeGame.backdropUrl || activeGame.posterUrl || ""}
                      alt={activeGame.title}
                      className="w-full h-full object-cover filter grayscale contrast-150 group-hover:filter-none transition-all duration-300"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary/60">
                      NO FEED SIGNAL
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-primary border border-primary/40">
                    RAW FEED // CAM 01
                  </div>
                </div>

                {/* Telemetry Panel */}
                <div className="border border-white/[0.04] rounded-lg p-5 bg-[var(--dk-surface-subtle)] space-y-3 text-xs">
                  <div className="text-[11px] font-bold text-primary uppercase tracking-wider border-b border-white/[0.04] pb-2">
                    // PAYLOAD SPECIFICATIONS
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-primary/70">ENGINE / PLATFORM:</span>
                    <span className="text-primary uppercase">{activeGame.platform}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-primary/70">RELEASE EPOCH:</span>
                    <span className="text-primary">{activeGame.data?.releaseDate || "ARCHIVE"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-primary/70">GLOBAL RATING:</span>
                    <span className="text-primary">{activeGame.data?.avgRating ? `${activeGame.data.avgRating}/100` : "N/A"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-primary/70">LOGGED CYCLES:</span>
                    <span className="text-primary">
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
                  className="flex items-center gap-2 px-8 py-3 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-widest cursor-pointer shadow-lg shadow-primary/25 active:scale-95 transition-all"
                >
                  <Play size={14} fill="currentColor" />
                  <span>INITIALIZE PROCESS</span>
                </button>

                <button
                  onClick={() => setDetailGame(activeGame)}
                  className="flex items-center gap-2 px-5 py-3 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Sliders size={14} />
                  <span>PROPERTIES</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-primary/60">NO NODE SELECTED</div>
          )}

          {/* Bottom terminal status line */}
          <div className="pt-6 border-t border-white/[0.04] text-[11px] text-primary/70 flex justify-between">
            <span>OTIX_DAEMON://127.0.0.1:4545</span>
            <span>PRESS [ALT+T] TO CYCLE THEMES</span>
          </div>
        </main>
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
