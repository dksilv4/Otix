import { useNavigate } from "@tanstack/react-router"
import { isDesktop } from "@/lib/desktop/api"
import { useLocalGames } from "@/old-features/game-scanner/game-queries"
import { GameCard } from "@/old-features/game-scanner/molecules/game-card"

export function LocalGamesOverviewSection() {
  const navigate = useNavigate()
  const { data: games = [] } = useLocalGames({ sortBy: 'last_played_at', sortDir: 'desc' })

  const isElectron = isDesktop()
  if (!isElectron || games.length === 0) return null

  const preview = games.filter(g => g.platform !== 'iso' && !g.sources?.includes('iso')).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Games
        </h2>
        <button
          onClick={() =>
            navigate({ to: "/library/games" })
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
        {games.length > 5 && (
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/library/games" })
            }
            className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)]/50 hover:bg-[var(--dk-surface-elevated)] transition-all duration-200"
          >
            <span className="text-sm text-muted-foreground">
              +{games.length - 5} more
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
