import { useState, useMemo } from "react"
import { Clock, Flame, Gamepad2, ChevronRight, FolderCheck } from "lucide-react"
import { ModernHeroSpotlight } from "./modern-hero-spotlight"
import { LauncherActionButtons } from "../common/launcher-action-buttons"
import { PLATFORM_LABELS } from "@/constants/games"
import { isApplicationGame } from "@/features/launcher/utils"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

interface ModernDashboardProps {
  localGames: LocalGame[]
  popularGames: any[]
  onOpenDetails: (game: LocalGame | DisplayGame) => void
  onSelectGame: (game: LocalGame | DisplayGame) => void
  onSwitchToLibrary: () => void
}

export function ModernDashboard({
  localGames,
  popularGames,
  onOpenDetails,
  onSelectGame,
  onSwitchToLibrary,
}: ModernDashboardProps) {
  // Filter out non-games
  const playableLocalGames = useMemo(
    () => localGames.filter((g) => !isApplicationGame(g)),
    [localGames]
  )

  // Recently played (games with lastPlayedAt)
  const recentGames = useMemo(() => {
    return [...playableLocalGames]
      .filter((g) => g.lastPlayedAt)
      .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())
      .slice(0, 10)
  }, [playableLocalGames])

  // Installed & ready (has exePath and not iso)
  const installedGames = useMemo(() => {
    return playableLocalGames.filter((g) => !!g.exePath && g.platform !== "iso")
  }, [playableLocalGames])

  // Top featured game for the hero
  const [selectedHeroGame, setSelectedHeroGame] = useState<LocalGame | null>(null)
  const heroGame = selectedHeroGame || recentGames[0] || installedGames[0] || playableLocalGames[0] || null

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-10 pb-28">
      {/* ── Spotlight Hero ── */}
      {heroGame && (
        <ModernHeroSpotlight
          game={heroGame}
          onOpenDetails={onOpenDetails}
        />
      )}

      {/* ── Jump Back In Reel (Recent Games) ── */}
      {recentGames.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[oklch(0.705_0.213_47.604)]" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Jump Back In
              </h2>
            </div>
            <button
              onClick={onSwitchToLibrary}
              className="text-xs font-semibold text-white/40 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none snap-x">
            {recentGames.map((game) => {
              const poster = game.otixPosterUrl || game.data?.posterUrl || game.posterUrl
              const isHero = heroGame?.id === game.id

              return (
                <div
                  key={game.id}
                  onClick={() => {
                    setSelectedHeroGame(game)
                    onSelectGame(game)
                  }}
                  className={`group relative flex-none w-48 sm:w-56 aspect-[16/10] rounded-2xl overflow-hidden cursor-pointer border transition-all duration-300 snap-start bg-neutral-900 ${
                    isHero
                      ? "border-[oklch(0.705_0.213_47.604)] ring-2 ring-[oklch(0.705_0.213_47.604/0.3)] scale-[1.02]"
                      : "border-white/[0.08] hover:border-white/25 hover:-translate-y-1"
                  }`}
                >
                  {poster ? (
                    <img
                      src={poster}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-white/30">
                      <Gamepad2 size={32} />
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                  {/* Content overlay */}
                  <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-black/60 text-white/90 text-[9px] font-black uppercase tracking-wider backdrop-blur-md">
                        {PLATFORM_LABELS[game.platform] || game.platform}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-white truncate drop-shadow-md">
                        {game.title}
                      </h4>
                      {game.lastPlayedAt && (
                        <span className="text-[10px] text-white/50 block">
                          Played {new Date(game.lastPlayedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Installed & Ready Shelf ── */}
      {installedGames.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderCheck size={16} className="text-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Installed & Ready ({installedGames.length})
              </h2>
            </div>
            <button
              onClick={onSwitchToLibrary}
              className="text-xs font-semibold text-white/40 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Manage Library</span>
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {installedGames.slice(0, 12).map((game) => {
              const poster = game.otixPosterUrl || game.data?.posterUrl || game.posterUrl

              return (
                <div
                  key={game.id}
                  onClick={() => onOpenDetails(game)}
                  className="group relative rounded-2xl overflow-hidden aspect-[2/3] bg-neutral-900 border border-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5"
                >
                  {poster ? (
                    <img
                      src={poster}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-white/30">
                      <Gamepad2 size={28} className="mb-2" />
                      <span className="text-[11px] font-bold text-white/60 line-clamp-2">
                        {game.title}
                      </span>
                    </div>
                  )}

                  {/* Gradient & Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                  {/* Top platform pill */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white/80 text-[8px] font-black uppercase tracking-wider">
                      {PLATFORM_LABELS[game.platform] || game.platform}
                    </span>
                  </div>

                  {/* Bottom title & Quick Play */}
                  <div className="absolute inset-x-0 bottom-0 p-3 z-10 space-y-1.5">
                    <h4 className="text-xs font-extrabold text-white line-clamp-1 drop-shadow">
                      {game.title}
                    </h4>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <LauncherActionButtons game={game} size="sm" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Community / Popular Shelf (Catalog) ── */}
      {popularGames && popularGames.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Popular in Catalog
              </h2>
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none snap-x">
            {popularGames.slice(0, 10).map((game: any) => (
              <div
                key={game.id}
                onClick={() => onOpenDetails(game)}
                className="group relative flex-none w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer border border-white/[0.08] hover:border-white/30 transition-all duration-300 snap-start bg-neutral-900"
              >
                {game.posterUrl ? (
                  <img
                    src={game.posterUrl}
                    alt={game.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <Gamepad2 size={24} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <h4 className="text-xs font-bold text-white line-clamp-1">{game.title}</h4>
                  {game.avgRating && (
                    <span className="text-[10px] text-amber-400 font-bold">
                      ★ {(game.avgRating / 10).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
