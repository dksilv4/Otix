import type { GameDetail } from '../media-queries'
import { Badge } from '@ui/atoms/badge'
import { cn } from '@/lib/utils'

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
  className?: string
}

function formatNumber(n?: number): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US').format(n)
}

export function GameSection({ game, platforms, gameModes, className }: GameSectionProps) {
  const hasModes = gameModes && gameModes.length > 0
  const hasPlatforms = platforms && platforms.length > 0
  const hasSteamStats =
    game.currentPlayers != null ||
    game.recommendations != null ||
    game.reviewSummary

  if (!hasModes && !hasPlatforms && !hasSteamStats && !game.website) return null

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
                className="flex items-center gap-2 rounded-xl bg-[var(--dk-surface-base)] px-3 py-2 shadow-[var(--dk-shadow-xs)]"
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
