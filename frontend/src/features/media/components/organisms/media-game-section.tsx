import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { mediaQueries, formatNumber, formatPlaytime, formatMinutesToHours, formatDaysAgo } from '@media'
import { Badge } from '@ui/atoms/badge'
import { PlatformIcon } from './media-game-platform-icon'

interface GameSectionProps {
  className?: string
}

export function GameSection({ className }: GameSectionProps = {}) {
  const params = useParams({ strict: false }) as { mediaId?: string }
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail('game', mediaId))
  if (!data || !data.game) return null

  const game = data.game
  const platforms = data.platforms
  const gameModes = data.gameModes
  const steamPlaytimeForever = data.steamPlaytimeForever
  const steamPlaytime2weeks = data.steamPlaytime2weeks
  const steamRtimeLastPlayed = data.steamRtimeLastPlayed

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
    <section className={`space-y-6 ${className || ''}`}>
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
                className="glass-inset flex items-center gap-2 rounded-xl px-3 py-2"
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
                <dd className="text-sm font-medium text-green-500">{formatPlaytime(steamPlaytime2weeks)}</dd>
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
                <dd className="text-sm font-medium capitalize">
                  {game.reviewSummary}
                </dd>
              </div>
            )}
            {game.isFree && (
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="text-sm font-medium text-green-600 dark:text-green-400">Free</dd>
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
