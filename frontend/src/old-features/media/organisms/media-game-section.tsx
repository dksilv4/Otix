// TODO: Review this file
import type { GameDetail } from '../media-queries'
import { Badge } from '@ui/atoms/badge'
import { cn } from '@/lib/utils'
import { PlatformIcon } from './media-game-platform-icon'

interface GameSectionProps {
  game: GameDetail
  platforms?: Array<{ id: string; platform: { id: string; name: string; slug: string; logoImageId?: string } }>
  gameModes?: Array<{ id: string; gameMode: { id: string; name: string; slug: string } }>
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  steamRtimeLastPlayed?: number | null
  className?: string
}

function formatNumber(n?: number): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US').format(n)
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

export function GameSection({ game, platforms, gameModes, steamPlaytimeForever, steamPlaytime2weeks, steamRtimeLastPlayed, className }: GameSectionProps) {
  const hasModes = gameModes && gameModes.length > 0
  const hasPlatforms = platforms && platforms.length > 0
  const hasSteamStats =
    game.currentPlayers != null ||
    game.recommendations != null ||
    game.reviewSummary
  const hasPlaytime = steamPlaytimeForever != null
  const hasTimeToBeat = game.timeToBeat?.normally != null || game.timeToBeat?.hastly != null || game.timeToBeat?.completely != null

  if (!hasModes && !hasPlatforms && !hasSteamStats && !hasPlaytime && !hasTimeToBeat && !game.website) return null

  return (
    <section className={cn('space-y-6', className)}>
      {/* Platforms */}
      {hasPlatforms && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Platforms
          </h3>
          <div className="flex flex-wrap gap-2">
            {platforms!.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-xs)' }}
              >
                <PlatformIcon slug={p.platform.slug} />
                <span className="text-xs font-medium text-muted-foreground">
                  {p.platform.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game modes */}
      {hasModes && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Game Modes
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {gameModes!.map((m) => (
              <Badge key={m.id} variant="outline">
                {m.gameMode.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Your Steam Playtime */}
      {hasPlaytime && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Your Steam Playtime
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-sm font-medium">{formatPlaytime(steamPlaytimeForever!)}</dd>
            </div>
            {steamPlaytime2weeks != null && steamPlaytime2weeks > 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">Recent (2 weeks)</dt>
                <dd className={cn('text-sm font-medium', 'text-green-500')}>{formatPlaytime(steamPlaytime2weeks)}</dd>
              </div>
            )}
            {steamRtimeLastPlayed != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Last Played</dt>
                <dd className="text-sm font-medium">{formatDaysAgo(steamRtimeLastPlayed)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Time to Beat */}
      {hasTimeToBeat && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Time to Beat
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {game.timeToBeat?.hastly != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Story (Speedrun)</dt>
                <dd className="text-sm font-medium">{formatMinutesToHours(game.timeToBeat.hastly)}</dd>
              </div>
            )}
            {game.timeToBeat?.normally != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Story + Extras</dt>
                <dd className="text-sm font-medium">{formatMinutesToHours(game.timeToBeat.normally)}</dd>
              </div>
            )}
            {game.timeToBeat?.completely != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Completionist</dt>
                <dd className="text-sm font-medium">{formatMinutesToHours(game.timeToBeat.completely)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Steam stats */}
      {hasSteamStats && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Steam Stats
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {game.currentPlayers != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Current Players</dt>
                <dd className="text-sm font-medium">
                  {formatNumber(game.currentPlayers)}
                </dd>
              </div>
            )}
            {game.recommendations != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Recommendations</dt>
                <dd className="text-sm font-medium">
                  {formatNumber(game.recommendations)}
                </dd>
              </div>
            )}
            {game.reviewSummary && (
              <div>
                <dt className="text-xs text-muted-foreground">Reviews</dt>
                <dd className={cn('text-sm font-medium', 'capitalize')}>
                  {game.reviewSummary}
                </dd>
              </div>
            )}
            {game.isFree && (
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className={cn('text-sm font-medium', 'text-green-600 dark:text-green-400')}>Free</dd>
              </div>
            )}
            {game.hasMultiplayer && (
              <div>
                <dt className="text-xs text-muted-foreground">Multiplayer</dt>
                <dd className="text-sm font-medium">Yes</dd>
              </div>
            )}
            {game.website && (
              <div>
                <dt className="text-xs text-muted-foreground">Website</dt>
                <dd className="text-sm">
                  <a
                    href={game.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Visit
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  )
}
