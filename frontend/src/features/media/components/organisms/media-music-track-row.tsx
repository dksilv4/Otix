import { type TrackOut, formatMs } from '@media'
import { TrackInlineActions } from '@media/components/molecules/media-track-inline-actions'
import { cn } from '@/lib/utils'

export function TrackRow({
  track,
  showDisc,
  isPlaying,
  spotifyLiked,
  savingSpotify,
  rating,
  ratingPending,
  onPlay,
  onToggle,
  onSaveSpotify,
  onRate,
  isReady,
  plexRatingKey,
  isPlexPlaying,
  onPlexPlay,
  playbackPlatform,
}: {
  track: TrackOut
  showDisc: boolean
  isPlaying: boolean
  isReady: boolean
  spotifyLiked: boolean
  savingSpotify: boolean
  rating: { myRating?: number | null; avgRating?: number | null; ratingCount: number }
  ratingPending: boolean
  onPlay: (uris: string[]) => void
  onToggle: () => void
  onSaveSpotify: (spotifyId: string) => void
  onRate: (trackId: string, score: number) => void
  plexRatingKey?: string | null
  isPlexPlaying?: boolean
  onPlexPlay?: () => void
  playbackPlatform?: 'spotify' | 'plex'
}) {
  const feats = track.audioFeatures
  const mini =
    feats && typeof feats === 'object'
    ? (['energy', 'danceability'] as const)
      .map((k) => {
        const v = feats[k]
        return typeof v === 'number' ? `${k.slice(0, 3)} ${Math.round(v * 100)}%` : null
      })
      .filter(Boolean)
      .join(' · ')
    : ''

  const canPlaySpotify = !!track.spotifyId && isReady
  const canPlayPlex = !!plexRatingKey
  const preferPlex = playbackPlatform === 'plex' && canPlayPlex
  const handleRowClick = () => {
    if (preferPlex) return
    if (!canPlaySpotify) return
    if (isPlaying) {
      onToggle()
    } else {
      onPlay([`spotify:track:${track.spotifyId}`])
    }
  }

  const cellBg = isPlaying
    ? 'bg-[#1DB954]/10'
    : isPlexPlaying
      ? 'bg-amber-500/10'
      : 'bg-[var(--dk-surface-glass)] group-hover:bg-[var(--dk-surface-glass-hover)]'

  return (
    <tr
      onClick={handleRowClick}
      className={cn(
        'group transition-colors',
        (canPlaySpotify && !preferPlex) && 'cursor-pointer',
      )}
    >
      <td className={cn('py-2.5 transition-colors w-10 rounded-l-xl pr-2 text-right font-mono text-xs text-muted-foreground', cellBg)}>
        {showDisc ? `${track.discNumber}.${track.trackNumber}` : track.trackNumber}
      </td>
      <td className={cn('py-2.5 transition-colors pr-3', cellBg)}>
        <div className="font-medium leading-snug">{track.title}</div>
        {mini && <div className="mt-0.5 text-[10px] text-muted-foreground">{mini}</div>}
      </td>
      <td className={cn('py-2.5 transition-colors w-20 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell', cellBg)}>
        {formatMs(track.durationMs)}
      </td>
      <td className={cn('py-2.5 transition-colors w-[290px] pr-3 hidden md:table-cell', cellBg)}>
        <TrackInlineActions
          trackId={track.id}
          spotifyId={track.spotifyId}
          spotifyLiked={spotifyLiked}
          savingSpotify={savingSpotify}
          myRating={rating.myRating}
          ratingPending={ratingPending}
          onSaveSpotify={onSaveSpotify}
          onRate={onRate}
          className="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity"
        />
      </td>
      <td className={cn('py-2.5 transition-colors w-10 rounded-r-xl text-center', cellBg)}>
        {preferPlex ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlexPlay?.()
            }}
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors',
              isPlexPlaying
                ? 'bg-amber-500 text-black'
                : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
            )}
          >
            {isPlexPlaying ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
              </svg>
            )}
          </button>
        ) : track.spotifyId ? (
          <div
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors pointer-events-none',
              isPlaying
                ? 'bg-[#1DB954] text-black'
                : 'bg-[#1DB954]/20 text-[#1DB954]',
            )}
          >
            {isPlaying ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
              </svg>
            )}
          </div>
        ) : track.previewUrl ? (
          <audio controls className="h-7 w-[120px] max-w-[28vw] sm:w-32" preload="none">
            <source src={track.previewUrl} type="audio/mpeg" />
          </audio>
        ) : canPlayPlex ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlexPlay?.()
            }}
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors',
              isPlexPlaying
                ? 'bg-amber-500 text-black'
                : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
            )}
          >
            {isPlexPlaying ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
              </svg>
            )}
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}
