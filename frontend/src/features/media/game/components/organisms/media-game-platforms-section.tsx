import { useQuery } from '@tanstack/react-query'
import { mediaQueries, useMediaParams } from '@media'
import type { MediaItemDetail } from '@media'
import { PlatformIcon } from './media-game-platform-icon'
import { isPS5Slug, isPS4Slug } from '@/features/media/game/utils/platform-icons'
import { extractValidPlatforms } from '@/features/media/game/utils/platforms'

export interface MediaGamePlatformsSectionProps {
  detail?: MediaItemDetail
  className?: string
}

export const MediaGamePlatformsSection = ({
  detail,
  className = '',
}: MediaGamePlatformsSectionProps) => {
  const { mediaId } = useMediaParams()

  const { data } = useQuery({
    ...mediaQueries.detail('game', mediaId),
    enabled: !detail && Boolean(mediaId),
  })

  const sourceData = detail ?? data
  const platforms = extractValidPlatforms(sourceData?.platforms)

  if (platforms.length === 0) {
    return null
  }

  return (
    <div
      id="media-game-platforms-section"
      data-testid="media-game-platforms-section"
      className={`glass-card p-5 sm:p-6 space-y-3 ${className}`}
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Platforms
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {platforms.map((p) => {
          const isPs = isPS5Slug(p.platform.slug) || isPS4Slug(p.platform.slug)

          if (isPs) {
            return (
              <div
                key={p.id}
                title={p.platform.name}
                aria-label={p.platform.name}
                className="flex items-center justify-center transition-transform hover:scale-105"
              >
                <PlatformIcon
                  slug={p.platform.slug}
                  className="h-8 px-2.5 text-xs rounded-[4px]"
                />
              </div>
            )
          }

          return (
            <div
              key={p.id}
              title={p.platform.name}
              aria-label={p.platform.name}
              className="glass-inset flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:scale-105 hover:bg-[var(--dk-surface-glass)] hover:text-foreground"
            >
              <PlatformIcon slug={p.platform.slug} className="h-4 w-4" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
