import { useNavigate } from "@tanstack/react-router"
import { Gamepad2 } from "lucide-react"
import { isDesktop } from "@/lib/desktop"
import { useLocalGames } from "@/features/launcher/data/game-queries"
import { GameCard } from "@/features/launcher/components/molecules/game-card"

export const LocalGamesOverviewSection = () => {
  const navigate = useNavigate()
  const { data: games = [] } = useLocalGames({ sortBy: 'last_played_at', sortDir: 'desc' })

  const gamesList = Array.isArray(games) ? games : []
  const isElectron = isDesktop()
  if (!isElectron) return null

  if (gamesList.length === 0) {
    return (
      <div className="rounded-2xl bg-[var(--dk-surface-glass)]/60 backdrop-blur-xl border border-white/[0.04] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your Games
            </h2>
          </div>
          <button
            onClick={() => navigate({ to: '/settings/paths' })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Manage Drive Locations
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          No local games detected yet. Add a game folder or run a scan to populate your library.
        </p>
      </div>
    )
  }

  const preview = gamesList.filter(g => g && g.platform !== 'iso' && !g.sources?.includes('iso')).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Games
        </h2>
        <button
          onClick={() =>
            navigate({ to: "/launcher" })
          }
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {preview.map((game, i) => (
          <GameCard key={game.id} game={game} index={i} />
        ))}
        {gamesList.length > 5 && (
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/launcher" })
            }
            className="flex aspect-[16/10] items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]/60 hover:bg-[var(--dk-surface-elevated)] backdrop-blur-xl border border-white/[0.04] transition-colors duration-200"
          >
            <span className="text-sm text-muted-foreground">
              +{gamesList.length - 5} more
            </span>
          </button>
        )}
      </div>
    </div>
  )
};
