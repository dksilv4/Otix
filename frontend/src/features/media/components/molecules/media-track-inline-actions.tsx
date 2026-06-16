import { Heart } from 'lucide-react'
import { StarInput } from '@/old-features/review/molecules/star-input'

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
      {canSaveSpotify && (
        <button
          type="button"
          disabled={savingSpotify || spotifyLiked}
          onClick={(event) => {
            event.stopPropagation()
            if (spotifyId) onSaveSpotify?.(spotifyId)
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            spotifyLiked
              ? 'bg-[#1DB954]/15 text-[#1DB954] cursor-default'
              : 'bg-white/[0.035] text-muted-foreground hover:bg-[#1DB954]/14 hover:text-[#1DB954]'
          } ${savingSpotify || spotifyLiked ? 'cursor-default' : ''}`}
          aria-label={spotifyLiked ? 'Saved to Spotify liked songs' : 'Add to Spotify liked songs'}
          title={spotifyLiked ? 'Saved to Spotify liked songs' : 'Add to Spotify liked songs'}
        >
          <Heart className={`h-3.5 w-3.5 ${spotifyLiked ? 'fill-current' : ''}`} />
        </button>
      )}
    </div>
  )
}
