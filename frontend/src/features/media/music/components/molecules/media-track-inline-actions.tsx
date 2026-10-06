import { StarInput } from '@/features/review/molecules/star-input'

interface TrackInlineActionsProps {
  trackId?: string | null
  myRating?: number | null
  ratingPending?: boolean
  onRate?: (trackId: string, score: number) => void
  className?: string
}

export const TrackInlineActions = ({
  trackId,
  ratingPending = false,
  myRating,
  onRate,
  className,
}: TrackInlineActionsProps) => {
  const canRate = Boolean(trackId && onRate)

  if (!canRate) return null

  return (
    <div className={`flex items-center justify-end gap-2 ${className || ''}`}>
      {canRate && (
        <div onClick={(event) => event.stopPropagation()}>
          <StarInput
            size="sm"
            value={myRating ?? null}
            disabled={ratingPending}
            onChange={(score) => {
              if (trackId) onRate?.(trackId, score)
            }}
          />
        </div>
      )}
    </div>
  )
};
