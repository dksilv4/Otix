// TODO: Review this file
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StarInput } from '@/features/review/molecules/star-input'
import './track-inline-actions.scss'

interface TrackInlineActionsProps {
  spotifyId?: string | null
  spotifyLiked?: boolean
  savingSpotify?: boolean
  trackId?: string | null
  myRating?: number | null
  ratingPending?: boolean
  onSaveSpotify?: (spotifyId: string) => void
  onRate?: (trackId: string, score: number) => void
  className?: string
}

export function TrackInlineActions({
  spotifyId,
  spotifyLiked = false,
  savingSpotify = false,
  trackId,
  ratingPending = false,
  myRating,
  onSaveSpotify,
  onRate,
  className,
}: TrackInlineActionsProps) {
  const canSaveSpotify = Boolean(spotifyId && onSaveSpotify)
  const canRate = Boolean(trackId && onRate)

  if (!canSaveSpotify && !canRate) return null

  return (
    <div className={cn('dk-media-track-inline-actions', className)}>
      {canRate && (
        <div className="dk-media-track-inline-actions__rating" onClick={(event) => event.stopPropagation()}>
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
      {canSaveSpotify && (
        <button
          type="button"
          disabled={savingSpotify || spotifyLiked}
          onClick={(event) => {
            event.stopPropagation()
            if (spotifyId) onSaveSpotify?.(spotifyId)
          }}
          className={cn(
            'dk-media-track-inline-actions__spotify-btn',
            spotifyLiked
              ? 'dk-media-track-inline-actions__spotify-btn--liked'
              : 'dk-media-track-inline-actions__spotify-btn--unliked',
            (savingSpotify || spotifyLiked) && 'dk-media-track-inline-actions__spotify-btn--disabled',
          )}
          aria-label={spotifyLiked ? 'Saved to Spotify liked songs' : 'Add to Spotify liked songs'}
          title={spotifyLiked ? 'Saved to Spotify liked songs' : 'Add to Spotify liked songs'}
        >
          <Heart className={cn('h-3.5 w-3.5', spotifyLiked && 'fill-current')} />
        </button>
      )}
    </div>
  )
}
