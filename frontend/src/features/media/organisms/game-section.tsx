// TODO: Review this file
import type { GameDetail } from '../media-queries'
import { Badge } from '@ui/atoms/badge'
import { cn } from '@/lib/utils'
import './game-section.scss'

function PlatformIcon({ slug }: { slug: string }) {
  const cls = 'h-4 w-4 text-muted-foreground shrink-0'
  const s = slug.toLowerCase()

  // PlayStation — △ ○ × □
  if (s.includes('playstation')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2l4 6-4 6-4-6z" />
        <circle cx="8" cy="8" r="2" />
        <path d="M5 5l6 6M11 5l-6 6" />
        <circle cx="8" cy="8" r="5" />
      </svg>
    )
  }

  // Xbox — X mark
  if (s.includes('xbox')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M5 5l6 6M11 5l-6 6" />
      </svg>
    )
  }

  // Nintendo Switch — two rectangles with controller
  if (s.includes('nintendo') || s.includes('switch')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4" width="5" height="9" rx="1.5" />
        <rect x="9.5" y="4" width="5" height="9" rx="1.5" />
        <rect x="6.5" y="6" width="3" height="3" rx="0.5" />
        <circle cx="4" cy="7" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="12" cy="10" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  // PC / Windows
  if (s === 'pc' || s.includes('windows')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="1" y="2" width="14" height="10" rx="1" />
        <path d="M5 16h6M8 12v4" />
      </svg>
    )
  }

  // Mac
  if (s.includes('mac')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M10 2c.5 0 1.5.5 2 1.5.5 1 .5 3 .5 5 0 3-.5 5.5-2 5.5-1 0-1.5-.5-2.5-.5s-1.5.5-2.5.5c-1.5 0-2-2.5-2-5.5 0-2 0-4 .5-5C4.5 2.5 5.5 2 6 2" />
        <path d="M9 4c0-.5 0-1.5-.5-2S7 2 7.5 3s.5 1 .5 1" />
      </svg>
    )
  }

  // Linux
  if (s.includes('linux')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M4 6c1.5-1 4-1 5 1M12 6c-1.5-1-4-1-5 1" />
        <path d="M5 10c1 .5 2.5 0 3.5 1s2 1 2.5 0" />
        <circle cx="6.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        <circle cx="9.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  // Android
  if (s.includes('android')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="3" y="5" width="10" height="7" rx="2" />
        <circle cx="6" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="10" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <path d="M6 4l-2-2M10 4l2-2" />
        <path d="M5 12v2M11 12v2M6.5 14h3" />
      </svg>
    )
  }

  // iOS / iPhone
  if (s.includes('ios') || s.includes('iphone')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="4" y="1" width="8" height="14" rx="2" />
        <circle cx="8" cy="12" r="0.75" fill="currentColor" stroke="none" />
        <path d="M7 3h2" />
      </svg>
    )
  }

  // Generic — gamepad
  return (
    <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="9" rx="3" />
      <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1" fill="currentColor" stroke="none" />
      <path d="M3 6h2M11 6h2" />
    </svg>
  )
}

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
    <section className={cn('dk-media-game-section', className)}>
      {/* Platforms */}
      {hasPlatforms && (
        <div className="dk-media-game-section__section">
          <h3 className="dk-media-game-section__heading">
            Platforms
          </h3>
          <div className="dk-media-game-section__tags">
            {platforms!.map((p) => (
              <div
                key={p.id}
                className="dk-media-game-section__platform-badge"
              >
                <PlatformIcon slug={p.platform.slug} />
                <span className="dk-media-game-section__platform-name">
                  {p.platform.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game modes */}
      {hasModes && (
        <div className="dk-media-game-section__section">
          <h3 className="dk-media-game-section__heading">
            Game Modes
          </h3>
          <div className="dk-media-game-section__modes">
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
        <div className="dk-media-game-section__section">
          <h3 className="dk-media-game-section__heading">
            Your Steam Playtime
          </h3>
          <dl className="dk-media-game-section__stats-grid">
            <div>
              <dt className="dk-media-game-section__stat-label">Total</dt>
              <dd className="dk-media-game-section__stat-value">{formatPlaytime(steamPlaytimeForever!)}</dd>
            </div>
            {steamPlaytime2weeks != null && steamPlaytime2weeks > 0 && (
              <div>
                <dt className="dk-media-game-section__stat-label">Recent (2 weeks)</dt>
                <dd className={cn('dk-media-game-section__stat-value', 'dk-media-game-section__stat-value--positive')}>{formatPlaytime(steamPlaytime2weeks)}</dd>
              </div>
            )}
            {steamRtimeLastPlayed != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Last Played</dt>
                <dd className="dk-media-game-section__stat-value">{formatDaysAgo(steamRtimeLastPlayed)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Time to Beat */}
      {hasTimeToBeat && (
        <div className="dk-media-game-section__section">
          <h3 className="dk-media-game-section__heading">
            Time to Beat
          </h3>
          <dl className="dk-media-game-section__stats-grid">
            {game.timeToBeat?.hastly != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Story (Speedrun)</dt>
                <dd className="dk-media-game-section__stat-value">{formatMinutesToHours(game.timeToBeat.hastly)}</dd>
              </div>
            )}
            {game.timeToBeat?.normally != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Story + Extras</dt>
                <dd className="dk-media-game-section__stat-value">{formatMinutesToHours(game.timeToBeat.normally)}</dd>
              </div>
            )}
            {game.timeToBeat?.completely != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Completionist</dt>
                <dd className="dk-media-game-section__stat-value">{formatMinutesToHours(game.timeToBeat.completely)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Steam stats */}
      {hasSteamStats && (
        <div className="dk-media-game-section__section">
          <h3 className="dk-media-game-section__heading">
            Steam Stats
          </h3>
          <dl className="dk-media-game-section__stats-grid">
            {game.currentPlayers != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Current Players</dt>
                <dd className="dk-media-game-section__stat-value">
                  {formatNumber(game.currentPlayers)}
                </dd>
              </div>
            )}
            {game.recommendations != null && (
              <div>
                <dt className="dk-media-game-section__stat-label">Recommendations</dt>
                <dd className="dk-media-game-section__stat-value">
                  {formatNumber(game.recommendations)}
                </dd>
              </div>
            )}
            {game.reviewSummary && (
              <div>
                <dt className="dk-media-game-section__stat-label">Reviews</dt>
                <dd className={cn('dk-media-game-section__stat-value', 'capitalize')}>
                  {game.reviewSummary}
                </dd>
              </div>
            )}
            {game.isFree && (
              <div>
                <dt className="dk-media-game-section__stat-label">Price</dt>
                <dd className={cn('dk-media-game-section__stat-value', 'dk-media-game-section__stat-value--free')}>Free</dd>
              </div>
            )}
            {game.hasMultiplayer && (
              <div>
                <dt className="dk-media-game-section__stat-label">Multiplayer</dt>
                <dd className="dk-media-game-section__stat-value">Yes</dd>
              </div>
            )}
            {game.website && (
              <div>
                <dt className="dk-media-game-section__stat-label">Website</dt>
                <dd className="text-sm">
                  <a
                    href={game.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dk-media-game-section__link"
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
