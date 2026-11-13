import { useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Search,
  RotateCw,
  Play,
  Clock,
  Trophy,
  Users,
  FolderOpen,
  Sliders,
  ChevronDown,
  Gamepad2,
  Check,
  Info,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { useGameAchievements } from "@/features/launcher/hooks/use-game-achievements"
import { getDesktopAPI } from "@/lib/desktop/api"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import { PLATFORM_LABELS } from "@/constants/games"
import { useAuth } from "@/lib/providers/auth"
import type { LocalGame } from "@/features/launcher/types"

export const SteamLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { runningGame, runningGames = [], cycleActiveGame } = useRunningGame()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [activeSteamTab, setActiveSteamTab] = useState<"library" | "store" | "community">("library")
  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)
  const [showInstalledOnly, setShowInstalledOnly] = useState(false)

  const {
    filteredGames,
    activeGame,
    selectGame,
    searchQuery,
    setSearchQuery,
  } = useLauncherGames()

  const installedGames = useMemo(
    () => filteredGames.filter((g) => !!g.exePath && g.platform !== "iso"),
    [filteredGames]
  )
  const otherGames = useMemo(
    () => filteredGames.filter((g) => !g.exePath || g.platform === "iso"),
    [filteredGames]
  )

  const { stats: activeGameStats } = useGameAchievements(activeGame?.id)

  const handleLaunch = async (g: LocalGame) => {
    await launchGame(g)
  }

  const handleOpenFolder = async (g: LocalGame) => {
    const api = getDesktopAPI()
    if (api?.showItemInFolder && g.exePath) {
      await api.showItemInFolder(g.exePath)
    }
  }

  const isSelectedRunning = runningGame && activeGame && runningGame.game.title?.toLowerCase() === activeGame.title?.toLowerCase()

  return (
    <div className="w-full h-screen bg-[var(--dk-surface-base)] text-muted-foreground font-sans flex flex-col overflow-hidden select-none">
      {/* ── Deck Top Chrome Bar ── */}
      <div className="h-10 bg-[var(--dk-surface-overlay)] px-4 flex items-center justify-between border-b border-white/[0.04] text-xs shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-primary">
            <Gamepad2 size={18} />
            <span className="font-bold tracking-wider text-foreground text-sm">OTIX</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-muted-foreground">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Back to Otix"
              className="p-1 hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
            </button>
            <button className="p-1 hover:text-foreground transition-colors cursor-pointer opacity-40 cursor-not-allowed">
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Steam Top Tabs */}
          <div className="flex items-center gap-4 font-bold text-xs uppercase tracking-widest text-foreground">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Go to Otix Discover"
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Store
            </button>
            <button
              onClick={() => setActiveSteamTab("library")}
              className={`hover:text-primary transition-colors cursor-pointer ${
                activeSteamTab === "library" ? "text-foreground border-b-2 border-primary pb-1 mt-1" : ""
              }`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveSteamTab("community")}
              className={`hover:text-primary transition-colors cursor-pointer ${
                activeSteamTab === "community" ? "text-primary" : ""
              }`}
            >
              Community
            </button>
          </div>
        </div>

        {/* Right window buttons */}
        <div className="flex items-center gap-3 text-muted-foreground">
          {runningGame && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold border border-primary/30">
              <span>Playing {runningGame.game.title}</span>
              {runningGames.length > 1 && (
                <button
                  type="button"
                  onClick={() => void cycleActiveGame()}
                  title={`Running ${runningGames.length} games. Click or press Ctrl+Tab to cycle active game focus.`}
                  className="inline-flex items-center gap-1 pl-1.5 border-l border-primary/30 text-[9px] font-semibold text-primary hover:text-foreground transition-colors cursor-pointer"
                >
                  <RotateCw className="h-2 w-2" />
                  <span>+${runningGames.length - 1}</span>
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pl-3 border-l border-white/[0.06]">
            <button
              onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
              title={user?.username ? `View ${user.username}'s profile` : "User Profile"}
              className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer group"
            >
              <span className="text-[11px] font-semibold text-foreground/80 group-hover:text-primary transition-colors max-w-[100px] truncate">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user?.username || "User"}
                  className="w-5 h-5 rounded-sm object-cover border border-white/[0.06]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-sm">
                  {(user?.username?.[0] || "U").toUpperCase()}
                </div>
              )}
            </button>
            <button
              onClick={() => navigate({ to: "/" })}
              title="Exit Launcher (Back to Otix)"
              className="p-1 text-foreground/40 hover:text-foreground transition-colors cursor-pointer ml-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Steam Deck / Client Layout ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Games Sidebar */}
        <aside className="w-64 lg:w-72 bg-[var(--dk-surface-subtle)] border-r border-white/[0.04] flex flex-col shrink-0">
          {/* Search & Filters */}
          <div className="p-2.5 border-b border-white/[0.04] space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary" size={13} />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-field)]/80 focus:bg-[var(--dk-surface-field)] rounded px-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none border border-transparent focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <button
                onClick={() => setShowInstalledOnly(!showInstalledOnly)}
                className={`flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer ${
                  showInstalledOnly ? "text-primary font-bold" : ""
                }`}
              >
                <Clock size={11} />
                <span>Ready to play ({installedGames.length})</span>
              </button>
              <span className="text-[10px] text-muted-foreground/80">{filteredGames.length}</span>
            </div>
          </div>

          {/* Games List (Grouped by Category) */}
          <div className="flex-1 overflow-y-auto py-2 space-y-3 scrollbar-none">
            {/* Installed Category */}
            <div>
              <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
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
                      onClick={() => selectGame(game.id)}
                      className={`px-4 py-1.5 flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-primary/20 text-primary font-bold"
                          : "text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-[var(--dk-surface-raised)] shrink-0">
                        {game.iconUrl || game.posterUrl ? (
                          <img
                            src={game.iconUrl || game.posterUrl || ""}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <Gamepad2 size={12} className="text-primary" />
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
                <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
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
                        onClick={() => selectGame(game.id)}
                        className={`px-4 py-1.5 flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                          isSelected
                            ? "bg-primary/20 text-primary font-bold"
                            : "text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-[var(--dk-surface-raised)] shrink-0 opacity-60">
                          {game.iconUrl || game.posterUrl ? (
                            <img
                              src={game.iconUrl || game.posterUrl || ""}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <Gamepad2 size={12} className="text-muted-foreground" />
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
          <main className="flex-1 flex flex-col overflow-y-auto bg-[var(--dk-surface-base)] scrollbar-none">
            {/* Steam Game Hero Banner */}
            <div className="relative h-80 lg:h-96 w-full shrink-0 overflow-hidden bg-[var(--dk-surface-overlay)]">
              {(activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl) && (
                <img
                  src={activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl || ""}
                  alt={activeGame.title}
                  className="w-full h-full object-cover brightness-75"
                  loading="lazy"
                  decoding="async"
                />
              )}
              {/* Steam ambient gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-base)] via-[var(--dk-surface-base)]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--dk-surface-overlay)]/90 via-[var(--dk-surface-base)]/40 to-transparent" />

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
                    <h1 className="text-3xl lg:text-4xl font-black text-foreground uppercase tracking-tight drop-shadow-lg mb-2">
                      {activeGame.title}
                    </h1>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded bg-[var(--dk-surface-ghost-active)] text-foreground font-bold uppercase text-[9px]">
                      {PLATFORM_LABELS[activeGame.platform] || activeGame.platform}
                    </span>
                    {activeGame.data?.releaseDate && <span>Released {activeGame.data.releaseDate.slice(0, 4)}</span>}
                  </div>
                </div>

                {/* Steam Iconic PLAY Button */}
                <div className="flex items-center gap-3 shrink-0">
                  {!!activeGame.exePath && activeGame.platform !== "iso" ? (
                    <button
                      onClick={() => handleLaunch(activeGame)}
                      className="flex items-center gap-3 px-10 py-4 rounded-md text-base font-black uppercase tracking-wider text-primary-foreground bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25 cursor-pointer transition hover:brightness-110 active:scale-95"
                    >
                      <Play size={18} fill="currentColor" />
                      <span>{isSelectedRunning ? "Running" : "Play"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setDetailGame(activeGame)}
                      className="flex items-center gap-2 px-8 py-4 rounded-md text-sm font-black uppercase tracking-wider text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer border border-white/[0.04]"
                    >
                      <Info size={16} />
                      <span>View Details</span>
                    </button>
                  )}

                  {/* Settings / Gear */}
                  <button
                    onClick={() => handleOpenFolder(activeGame)}
                    title="Browse local files"
                    className="p-3.5 rounded-md bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground/80 hover:text-foreground transition-colors cursor-pointer border border-white/[0.04]"
                  >
                    <FolderOpen size={16} />
                  </button>
                  <button
                    onClick={() => setDetailGame(activeGame)}
                    title="Properties"
                    className="p-3.5 rounded-md bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground/80 hover:text-foreground transition-colors cursor-pointer border border-white/[0.04]"
                  >
                    <Sliders size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Steam Stats Bar */}
            <div className="bg-[var(--dk-surface-overlay)] border-y border-white/[0.04] px-8 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">
                  Last Played
                </span>
                <span className="font-bold text-foreground">
                  {activeGame.lastPlayedAt
                    ? new Date(activeGame.lastPlayedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : "Never"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">
                  Play Time
                </span>
                <span className="font-bold text-foreground">
                  {activeGame.data?.steamPlaytimeForever
                    ? `${(activeGame.data.steamPlaytimeForever / 60).toFixed(1)} hours`
                    : "Ready to launch"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">
                  Cloud Status
                </span>
                <span className="font-bold text-primary flex items-center gap-1">
                  <Check size={13} />
                  Up to date
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">
                  Achievements
                </span>
                <span className="font-bold text-foreground">
                  {activeGameStats.total > 0
                    ? `${activeGameStats.unlocked} of ${activeGameStats.total} (${activeGameStats.completionPercentage}%)`
                    : "No achievements"}
                </span>
              </div>
            </div>

            {/* Steam Content Body: Overview & Activity */}
            <div className="p-8 space-y-8 max-w-5xl">
              {/* Overview */}
              <div className="p-5 rounded-lg bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-2">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">About This Game</h3>
                <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                  {activeGame.data?.overview || activeGame.description || "No description available."}
                </p>
              </div>

              {/* Achievements Showcase */}
              <div className="p-5 rounded-lg bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Achievements</h3>
                  </div>
                  <button
                    onClick={() => setDetailGame(activeGame)}
                    className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                  >
                    View My Achievements
                  </button>
                </div>
                {/* Progress bar */}
                <div className="w-full h-3 rounded-full bg-[var(--dk-surface-field)] overflow-hidden p-0.5 border border-white/[0.04]">
                  <div
                    className="h-full rounded-full bg-primary transition-colors duration-300"
                    style={{ width: `${activeGameStats.completionPercentage}%` }}
                  />
                </div>
              </div>

              {/* Friends Activity */}
              <div className="p-5 rounded-lg bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-primary" />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Friends Who Play</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  3 friends recently played this game.
                </p>
              </div>
            </div>
          </main>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-2">
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

      {hasDisambiguationTarget && <ConsoleDisambiguationModal {...disambiguationModalProps} />}
    </div>
  )
};
