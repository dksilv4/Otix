import { useQuery } from '@tanstack/react-query'
import { mediaQueries, useMediaParams } from '@media'
import type { MediaItemDetail } from '@media'
import { Badge } from '@ui/atoms/badge'
import { extractValidGameModes } from '@/features/media/game/utils/platforms'

export interface MediaGameModesSectionProps {
  detail?: MediaItemDetail
  className?: string
}

export const MediaGameModesSection = ({
  detail,
  className = '',
}: MediaGameModesSectionProps) => {
  const { mediaId } = useMediaParams()

  const { data } = useQuery({
    ...mediaQueries.detail('game', mediaId),
    enabled: !detail && Boolean(mediaId),
  })

  const sourceData = detail ?? data
  const gameModes = extractValidGameModes(sourceData?.gameModes)

  if (gameModes.length === 0) {
    return null
  }

  return (
    <div
      id="media-game-modes-section"
      data-testid="media-game-modes-section"
      className={`glass-card p-5 sm:p-6 space-y-3 ${className}`}
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Game Modes
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {gameModes.map((m) => (
          <Badge
            key={m.id}
            variant="secondary"
            className="bg-[var(--dk-surface-ghost)] text-foreground/90 hover:bg-[var(--dk-surface-glass-hover)] border-0 font-medium text-xs px-2.5 py-1 rounded-lg transition-colors"
          >
            {m.gameMode.name}
          </Badge>
        ))}
      </div>
    </div>
  )
}
