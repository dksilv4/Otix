import { useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Search,
  Play,
  Clock,
  CloudCheck,
  Trophy,
  Users,
  Settings,
  FolderOpen,
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Check,
  HardDrive,
  Info,
  Maximize2,
  Minus,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherVisibleGames } from "@/features/launcher/data/game-queries"
import { usePopularGames } from "@/features/launcher/data/queries"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import { isApplicationGame } from "@/features/launcher/utils"
import { PLATFORM_LABELS } from "@/constants/games"
import { useAuth } from "@/lib/providers/auth"
import type { LocalGame } from "@/features/launcher/types"

export function SteamLauncherView() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const isDesktop = hasDesktopAPI()
  const { data: localGames = [] } = useLauncherVisibleGames()
  const { data: popularGames = [] } = usePopularGames()
  const { runningGame, elapsedMs } = useRunningGame()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [activeSteamTab, setActiveSteamTab] = useState<"library" | "store" | "community">("library")
  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)
  const [showInstalledOnly, setShowInstalledOnly] = useState(false)

  const games = useMemo(() => {
    return localGames.filter((g) => !isApplicationGame(g))
  }, [localGames])

  const filteredGames = useMemo(() => {
    let list = [...games]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((g) => g.title.toLowerCase().includes(q))
    }
    if (showInstalledOnly) {
      list = list.filter((g) => !!g.exePath && g.platform !== "iso")
    }
    return list
  }, [games, searchQuery, showInstalledOnly])

  const installedGames = useMemo(
    () => filteredGames.filter((g) => !!g.exePath && g.platform !== "iso"),
    [filteredGames]
  )
  const otherGames = useMemo(
    () => filteredGames.filter((g) => !g.exePath || g.platform === "iso"),
    [filteredGames]
  )

  const activeGame = useMemo(() => {
    if (selectedGameId) {
      const found = games.find((g) => g.id === selectedGameId)
      if (found) return found
    }
    return installedGames[0] || games[0] || null
  }, [selectedGameId, games, installedGames])

  const handleLaunch = async (g: LocalGame) => {
    const api = getDesktopAPI()
    if (!api?.launchGame) {
      toast({
        title: "Desktop App Required",
        description: "Otix desktop client is needed to boot games natively.",
        variant: "default",
      })
      return
    }
    try {
      await api.launchGame(g)
      toast({ title: "Otix Launcher", description: `Preparing to launch ${g.title}...`, variant: "success" })
    } catch (err) {
      toast({ title: "Error", description: (err as Error)?.message || "Failed to launch", variant: "error" })
    }
  }

  const handleOpenFolder = async (g: LocalGame) => {
    const api = getDesktopAPI()
    if (api?.showItemInFolder && g.exePath) {
      await api.showItemInFolder(g.exePath)
    }
  }

  const isSelectedRunning = runningGame && activeGame && runningGame.title?.toLowerCase() === activeGame.title?.toLowerCase()

  return (
    <div className="w-full h-screen bg-[#1b2838] text-[#c6d4df] font-sans flex flex-col overflow-hidden select-none">
      {/* ── Deck Top Chrome Bar ── */}
      <div className="h-10 bg-[#171a21] px-4 flex items-center justify-between border-b border-[#0e141b] text-xs shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#66c0f4]">
            <Gamepad2 size={18} />
            <span className="font-bold tracking-wider text-white text-sm">OTIX</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[#8f98a0]">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Back to Otix"
              className="p-1 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
            </button>
            <button className="p-1 hover:text-white transition-colors cursor-pointer opacity-40 cursor-not-allowed">
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Steam Top Tabs */}
          <div className="flex items-center gap-4 font-bold text-xs uppercase tracking-widest text-[#c7d5e0]">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Go to Otix Discover"
              className="hover:text-[#66c0f4] transition-colors cursor-pointer"
            >
              Store
            </button>
            <button
              onClick={() => setActiveSteamTab("library")}
              className={`hover:text-[#66c0f4] transition-colors cursor-pointer ${
                activeSteamTab === "library" ? "text-white border-b-2 border-[#1a9fff] pb-1 mt-1" : ""
              }`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveSteamTab("community")}
              className={`hover:text-[#66c0f4] transition-colors cursor-pointer ${
                activeSteamTab === "community" ? "text-[#66c0f4]" : ""
              }`}
            >
              Community
            </button>
          </div>
        </div>

        {/* Right window buttons */}
        <div className="flex items-center gap-3 text-[#8f98a0]">
          {runningGame && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Playing {runningGame.title}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pl-3 border-l border-[#2a475e]/40">
            <button
              onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
              title={user?.username ? `View ${user.username}'s profile` : "User Profile"}
              className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer group"
            >
              <span className="text-[11px] font-semibold text-white/80 group-hover:text-[#66c0f4] transition-colors max-w-[100px] truncate">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user?.username || "User"}
                  className="w-5 h-5 rounded-sm object-cover border border-[#2a475e]"
                />
              ) : (
                <div className="w-5 h-5 rounded-sm bg-gradient-to-tr from-[#1a9fff] to-[#66c0f4] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                  {(user?.username?.[0] || "U").toUpperCase()}
                </div>
              )}
            </button>
            <button
              onClick={() => navigate({ to: "/" })}
              title="Exit Launcher (Back to Otix)"
              className="p-1 text-white/40 hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Steam Deck / Client Layout ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Games Sidebar */}
        <aside className="w-64 lg:w-72 bg-[#121a24] border-r border-[#0e141b] flex flex-col shrink-0">
          {/* Search & Filters */}
          <div className="p-2.5 border-b border-[#1b2838] space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#66c0f4]" size={13} />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1b2838] hover:bg-[#212f42] focus:bg-[#212f42] rounded px-8 py-1.5 text-xs text-white placeholder-[#536577] outline-none border border-transparent focus:border-[#66c0f4]/50 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#8f98a0] px-1">
              <button
                onClick={() => setShowInstalledOnly(!showInstalledOnly)}
                className={`flex items-center gap-1 hover:text-white transition-colors cursor-pointer ${
                  showInstalledOnly ? "text-[#66c0f4] font-bold" : ""
                }`}
              >
                <Clock size={11} />
                <span>Ready to play ({installedGames.length})</span>
              </button>
              <span className="text-[10px] text-[#536577]">{filteredGames.length}</span>
            </div>
          </div>

          {/* Games List (Grouped by Category) */}
          <div className="flex-1 overflow-y-auto py-2 space-y-3 scrollbar-none">
            {/* Installed Category */}
            <div>
              <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-[#8f98a0] uppercase">
                <span className="flex items-center gap-1">
                  <ChevronDown size={12} />
                  <span>Installed & Ready ({installedGames.length})</span>
                </span>
              </div>
              <div className="space-y-0.5">
                {installedGames.map((game) => {
                  const isSelected = activeGame?.id === game.id
                  return (
                    <div
                      key={game.id}
                      onClick={() => setSelectedGameId(game.id)}
                      className={`px-4 py-1.5 flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-[#2a475e] text-white font-bold"
                          : "text-[#c6d4df] hover:bg-[#1b2838] hover:text-white"
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-[#2a475e] shrink-0">
                        {game.iconUrl || game.posterUrl ? (
                          <img src={game.iconUrl || game.posterUrl || ""} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Gamepad2 size={12} className="text-[#66c0f4]" />
                        )}
                      </div>
                      <span className="truncate">{game.title}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Other / Uninstalled Games */}
            {otherGames.length > 0 && (
              <div>
                <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-[#8f98a0] uppercase">
                  <span className="flex items-center gap-1">
                    <ChevronDown size={12} />
                    <span>Uninstalled & Media ({otherGames.length})</span>
                  </span>
                </div>
                <div className="space-y-0.5">
                  {otherGames.map((game) => {
                    const isSelected = activeGame?.id === game.id
                    return (
                      <div
                        key={game.id}
                        onClick={() => setSelectedGameId(game.id)}
                        className={`px-4 py-1.5 flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                          isSelected
                            ? "bg-[#2a475e] text-white font-bold"
                            : "text-[#8f98a0] hover:bg-[#1b2838] hover:text-[#c6d4df]"
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-[#1b2838] shrink-0 opacity-60">
                          {game.iconUrl || game.posterUrl ? (
                            <img src={game.iconUrl || game.posterUrl || ""} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Gamepad2 size={12} className="text-[#536577]" />
                          )}
                        </div>
                        <span className="truncate">{game.title}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Game Showcase */}
        {activeGame ? (
          <main className="flex-1 flex flex-col overflow-y-auto bg-[#1b2838] scrollbar-none">
            {/* Steam Game Hero Banner */}
            <div className="relative h-80 lg:h-96 w-full shrink-0 overflow-hidden bg-[#0e141b]">
              {(activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl) && (
                <img
                  src={activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl || ""}
                  alt={activeGame.title}
                  className="w-full h-full object-cover brightness-75"
                />
              )}
              {/* Steam ambient gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1b2838] via-[#1b2838]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#171a21]/90 via-[#1b2838]/40 to-transparent" />

              {/* Logo / Game Title in bottom-left */}
              <div className="absolute bottom-6 left-8 right-8 flex items-end justify-between gap-6">
                <div className="max-w-md">
                  {(activeGame.otixLogoUrl || activeGame.data?.logoUrl || activeGame.logoUrl) ? (
                    <MediaLogo
                      src={activeGame.otixLogoUrl || activeGame.data?.logoUrl || activeGame.logoUrl || ""}
                      alt={activeGame.title}
                      className="h-20 max-w-[320px] object-contain object-left mb-3 drop-shadow-xl"
                      background="dark"
                    />
                  ) : (
                    <h1 className="text-3xl lg:text-4xl font-black text-white uppercase tracking-tight drop-shadow-lg mb-2">
                      {activeGame.title}
                    </h1>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[#8f98a0]">
                    <span className="px-2 py-0.5 rounded bg-[#2a475e]/60 text-white font-bold uppercase text-[9px]">
                      {PLATFORM_LABELS[activeGame.platform] || activeGame.platform}
                    </span>
                    {activeGame.data?.releaseDate && <span>Released {activeGame.data.releaseDate.slice(0, 4)}</span>}
                  </div>
                </div>

                {/* Steam Iconic Green PLAY Button */}
                <div className="flex items-center gap-3 shrink-0">
                  {!!activeGame.exePath && activeGame.platform !== "iso" ? (
                    <button
                      onClick={() => handleLaunch(activeGame)}
                      className="flex items-center gap-3 px-10 py-4 rounded-md text-base font-black uppercase tracking-wider text-white shadow-xl cursor-pointer transition-all hover:brightness-110 active:scale-95"
                      style={{
                        background: "linear-gradient(to right, #5c7e10 0%, #5cbf10 100%)",
                        boxShadow: "0 0 24px rgba(92, 191, 16, 0.4)",
                      }}
                    >
                      <Play size={18} fill="white" />
                      <span>{isSelectedRunning ? "Running" : "Play"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setDetailGame(activeGame)}
                      className="flex items-center gap-2 px-8 py-4 rounded-md text-sm font-black uppercase tracking-wider text-white bg-[#2a475e] hover:bg-[#385e7d] transition-colors cursor-pointer"
                    >
                      <Info size={16} />
                      <span>View Details</span>
                    </button>
                  )}

                  {/* Settings / Gear */}
                  <button
                    onClick={() => handleOpenFolder(activeGame)}
                    title="Browse local files"
                    className="p-3.5 rounded-md bg-[#2a475e]/50 hover:bg-[#2a475e] text-white/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <FolderOpen size={16} />
                  </button>
                  <button
                    onClick={() => setDetailGame(activeGame)}
                    title="Properties"
                    className="p-3.5 rounded-md bg-[#2a475e]/50 hover:bg-[#2a475e] text-white/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <Sliders size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Steam Stats Bar */}
            <div className="bg-[#17202d] border-y border-[#0e141b] px-8 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-[#8f98a0] uppercase tracking-wider font-semibold block">
                  Last Played
                </span>
                <span className="font-bold text-white">
                  {activeGame.lastPlayedAt
                    ? new Date(activeGame.lastPlayedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : "Never"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8f98a0] uppercase tracking-wider font-semibold block">
                  Play Time
                </span>
                <span className="font-bold text-white">
                  {activeGame.data?.steamPlaytimeForever
                    ? `${(activeGame.data.steamPlaytimeForever / 60).toFixed(1)} hours`
                    : "Ready to launch"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8f98a0] uppercase tracking-wider font-semibold block">
                  Cloud Status
                </span>
                <span className="font-bold text-[#66c0f4] flex items-center gap-1">
                  <Check size={13} />
                  Up to date
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#8f98a0] uppercase tracking-wider font-semibold block">
                  Achievements
                </span>
                <span className="font-bold text-white">14 of 28 (50%)</span>
              </div>
            </div>

            {/* Steam Content Body: Overview & Activity */}
            <div className="p-8 space-y-8 max-w-5xl">
              {/* Overview */}
              <div className="p-5 rounded-lg bg-[#16202d] border border-[#212c3d] space-y-2">
                <h3 className="text-xs font-bold text-[#66c0f4] uppercase tracking-wider">About This Game</h3>
                <p className="text-xs text-[#acb2b8] leading-relaxed font-normal">
                  {activeGame.data?.overview || activeGame.description || "No description available."}
                </p>
              </div>

              {/* Achievements Showcase */}
              <div className="p-5 rounded-lg bg-[#16202d] border border-[#212c3d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Achievements</h3>
                  </div>
                  <span className="text-[11px] text-[#66c0f4] font-semibold">View My Achievements</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-3 rounded-full bg-[#0e141b] overflow-hidden p-0.5 border border-[#2a475e]/30">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#1a9fff] to-[#66c0f4]" style={{ width: "50%" }} />
                </div>
              </div>

              {/* Friends Activity */}
              <div className="p-5 rounded-lg bg-[#16202d] border border-[#212c3d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-[#66c0f4]" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Friends Who Play</h3>
                  </div>
                </div>
                <p className="text-xs text-[#8f98a0]">
                  3 friends recently played this game.
                </p>
              </div>
            </div>
          </main>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#8f98a0] space-y-2">
            <Gamepad2 size={48} className="opacity-30" />
            <span className="text-sm">Select a game from the library to view details</span>
          </div>
        )}
      </div>

      {/* Detail Sheet if opened */}
      <LauncherGameSheet
        game={detailGame}
        onClose={() => setDetailGame(null)}
      />
    </div>
  )
}
