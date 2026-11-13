import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Play,
  Settings,
  Sliders,
  Search,
  ArrowLeft,
  Flame,
  Layers,
} from "lucide-react"
import { MediaLogo } from "@/lib/media/media-logo"
import { useLauncherGames } from "@/features/launcher/hooks/use-launcher-games"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { useVirtualGrid } from "@/features/launcher/hooks/use-virtual-grid"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import { useAuth } from "@/lib/providers/auth"
import { LauncherGameSheet } from "../common/launcher-game-sheet"
import type { LocalGame } from "@/features/launcher/types"

export const ForgeLauncherView = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const [detailGame, setDetailGame] = useState<LocalGame | null>(null)
  const [activeNav, setActiveNav] = useState<"store" | "library" | "unreal">("library")

  const {
    filteredGames,
    activeGame,
    selectGame,
    searchQuery,
    setSearchQuery,
  } = useLauncherGames()

  const {
    virtualItems,
    paddingTop,
    paddingBottom,
    containerRef,
  } = useVirtualGrid(filteredGames, {
    itemHeight: 280,
    gap: 16,
    columns: (width) => (width < 640 ? 2 : width < 768 ? 3 : width < 1024 ? 4 : 6),
    threshold: 24,
  })

  const handlePlayGame = async (game: LocalGame) => {
    await launchGame(game)
  }

  return (
    <div className="relative w-full h-full bg-background text-foreground flex select-none overflow-hidden font-sans">
      {/* Left Navigation Rail */}
      <aside className="w-56 bg-[var(--dk-surface-base)] border-r border-white/[0.04] flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Otix Forge Logo */}
          <div className="flex items-center gap-3 px-2">
            <button
              onClick={() => navigate({ to: "/" })}
              title="Return to Otix Hub"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-wider text-foreground">OTIX</span>
              <span className="text-[9px] uppercase font-bold text-primary">Forge V9</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveNav("store")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeNav === "store" ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Flame size={15} />
              <span>Store</span>
            </button>
            <button
              onClick={() => setActiveNav("library")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeNav === "library" ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Layers size={15} />
              <span>Library</span>
            </button>
            <button
              onClick={() => navigate({ to: '/settings/launcher' })}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer transition-colors"
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          </nav>

          {/* Installed Games List */}
          <div className="pt-3 border-t border-white/[0.04] space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3">
              Favorites
            </span>
            <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
              {filteredGames.slice(0, 8).map((game) => (
                <div
                  key={game.id}
                  onClick={() => selectGame(game.id)}
                  className={`px-3 py-1.5 rounded text-xs truncate cursor-pointer transition-colors ${
                    activeGame?.id === game.id
                      ? "text-primary font-bold bg-white/5"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {game.title}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User profile dock */}
        <div className="pt-3 border-t border-white/[0.04]">
          <button
            onClick={() => navigate({ to: user?.username ? `/user/${user.username}` : "/settings/profile" })}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 w-full cursor-pointer transition-colors"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                {(user?.username?.[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left truncate">
              <span className="text-xs font-bold text-foreground truncate">
                {user?.username || (isAuthenticated ? "Player" : "Guest")}
              </span>
              <span className="text-[9px] text-primary font-medium">Online</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Storefront & Library Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto no-scrollbar pb-20">
        {/* Top Header Filter Bar */}
        <header className="px-8 py-5 border-b border-white/[0.04] flex items-center justify-between bg-[var(--dk-surface-base)]/90 sticky top-0 z-30 backdrop-blur">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-foreground">All Games</h1>
            <span className="text-xs text-muted-foreground font-medium">
              {filteredGames.length} titles in catalog
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
              <input
                type="text"
                placeholder="Search catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-ghost)] text-xs text-foreground placeholder:text-muted-foreground pl-8 pr-3 py-1.5 rounded-lg outline-none border border-transparent focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </header>

        {/* Hero Feature Banner if activeGame selected */}
        {activeGame && (
          <div className="px-8 pt-6">
            <div
              className="relative h-72 rounded-2xl overflow-hidden border border-white/[0.04] group cursor-pointer shadow-xl"
              onClick={() => handlePlayGame(activeGame)}
            >
              {activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl ? (
                <img
                  src={activeGame.otixBackdropUrl || activeGame.data?.backdropUrl || activeGame.posterUrl || ""}
                  alt={activeGame.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent p-6 flex flex-col justify-end">
                <div className="space-y-2 max-w-xl">
                  {activeGame.otixLogoUrl || activeGame.data?.logoUrl ? (
                    <MediaLogo
                      src={activeGame.otixLogoUrl || activeGame.data?.logoUrl || ""}
                      alt={activeGame.title}
                      className="max-h-16 max-w-xs object-contain"
                    />
                  ) : (
                    <h2 className="text-3xl font-black text-foreground">{activeGame.title}</h2>
                  )}

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {activeGame.description || activeGame.data?.overview}
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlayGame(activeGame)
                      }}
                      className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-primary/25"
                    >
                      <Play size={14} className="fill-current" />
                      <span>Launch</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetailGame(activeGame)
                      }}
                      className="px-4 py-2.5 rounded-lg bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] text-foreground font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-white/[0.04]"
                    >
                      <Sliders size={13} />
                      <span>Details</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grid Catalog */}
        <div className="px-8 pt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Installed & Available Library
            </h2>
          </div>

          <div
            ref={containerRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            {paddingTop > 0 && (
              <div style={{ height: paddingTop, gridColumn: '1 / -1' }} aria-hidden="true" />
            )}
            {virtualItems.map(({ item: game, index }) => {
              const isSelected = activeGame?.id === game.id
              const poster = game.otixPosterUrl || game.posterUrl
              const isAboveFold = isSelected || index < 6
              return (
                <div
                  key={game.id}
                  onClick={() => selectGame(game.id)}
                  className={`group rounded-xl overflow-hidden cursor-pointer relative border transition-colors duration-200 ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/20"
                      : "border-transparent hover:border-white/[0.06] bg-[var(--dk-surface-ghost)]"
                  }`}
                >
                  <div className="aspect-[3/4] overflow-hidden">
                    {poster ? (
                      <img
                        src={poster}
                        alt={game.title}
                        loading={isAboveFold ? "eager" : "lazy"}
                        fetchPriority={isAboveFold ? "high" : "auto"}
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-[var(--dk-surface-field)] flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                        {game.title}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-0.5">
                    <span className="text-xs font-bold text-foreground truncate block">
                      {game.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground block uppercase">
                      {game.platform}
                    </span>
                  </div>
                </div>
              )
            })}
            {paddingBottom > 0 && (
              <div style={{ height: paddingBottom, gridColumn: '1 / -1' }} aria-hidden="true" />
            )}
          </div>
        </div>
      </main>

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
