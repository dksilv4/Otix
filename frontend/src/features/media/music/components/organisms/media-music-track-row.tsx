import { useState } from 'react'
import { type TrackOut, formatMs } from '@media'
import type { PlexTrackInfo } from '@/lib/player/plex-audio-provider'
import { TrackInlineActions } from '@media/music/components/molecules/media-track-inline-actions'
import { usePlayer } from '@/lib/player/use-player'
import { useRateTrack } from '@media/queries/media-queries'
import { useToast } from '@ui/molecules/toast'

export interface TrackRowProps {
  track: TrackOut
  showDisc: boolean
  /** Plex connection info — if null, Plex playback is unavailable */
  plexConnection?: {
    ratingKey: string
    baseUrl: string | null
    token: string | null
    artist: string
  } | null
  /** All tracks in the album (needed for "play from here" queue) */
  allTracks: TrackOut[]
  /** Album-level metadata for Plex track info */
  albumTitle: string
  albumArt: string | null
  artistName: string | null
}

export const TrackRow = ({
  track,
  showDisc,
  plexConnection,
  allTracks,
  albumTitle,
  albumArt,
  artistName,
}: TrackRowProps) => {
  const {
    currentTrack,
    source,
    playPlexAlbum,
    playPlexTrack,
  } = usePlayer()
  const rateTrack = useRateTrack()
  const { toast } = useToast()

  // Local state
  const [myRating, setMyRating] = useState<number | null>(null)
  const [ratingPending, setRatingPending] = useState(false)

  // Derived playback state
  const isPlexPlaying =
    !!plexConnection?.ratingKey &&
    currentTrack?.id === plexConnection.ratingKey &&
    source === 'plex'
  const canPlayPlex = !!plexConnection?.ratingKey

  // Audio features mini string
  const feats = track.audioFeatures
  const mini =
    feats && typeof feats === 'object'
      ? (['energy', 'danceability'] as const)
          .map((k) => {
            const v = feats[k]
            return typeof v === 'number'
              ? `${k.slice(0, 3)} ${Math.round(v * 100)}%`
              : null
          })
          .filter(Boolean)
          .join(' · ')
      : ''

  // --- Handlers ---

  const handlePlexPlay = () => {
    if (!canPlayPlex) return
    if (!plexConnection?.baseUrl || !plexConnection?.token) {
      console.warn(
        'Plex connection info not available — try re-syncing Plex in Settings',
      )
      return
    }

    // Build PlexTrackInfo queue from allTracks.
    // For the current track use plexConnection.ratingKey;
    // for Plex-only tracks (id: "plex-{ratingKey}") extract the rating key.
    const plexInfoList: PlexTrackInfo[] = []
    let startIndex = -1

    for (const t of allTracks) {
      let rk: string | null = null

      if (t.id === track.id && plexConnection.ratingKey) {
        rk = plexConnection.ratingKey
      } else if (t.id.startsWith('plex-')) {
        rk = t.id.slice(5)
      }

      if (rk) {
        if (t.id === track.id) {
          startIndex = plexInfoList.length
        }
        plexInfoList.push({
          id: rk,
          ratingKey: rk,
          title: t.title,
          artist: plexConnection.artist || artistName || '',
          albumName: albumTitle,
          albumArt,
          durationMs: t.durationMs || 0,
          plexBaseUrl: plexConnection.baseUrl,
          plexToken: plexConnection.token,
        })
      }
    }

    if (plexInfoList.length > 0 && startIndex >= 0) {
      playPlexAlbum(plexInfoList, startIndex)
    } else if (plexInfoList.length === 1) {
      playPlexTrack(plexInfoList[0])
    } else {
      // Fallback — play just this track
      playPlexTrack({
        id: plexConnection.ratingKey,
        ratingKey: plexConnection.ratingKey,
        title: track.title,
        artist: plexConnection.artist || artistName || '',
        albumName: albumTitle,
        albumArt,
        durationMs: track.durationMs || 0,
        plexBaseUrl: plexConnection.baseUrl,
        plexToken: plexConnection.token,
      })
    }
  }

  const handleRate = (trackId: string, score: number) => {
    setRatingPending(true)
    rateTrack.mutate(
      { trackId, score },
      {
        onSuccess: (result) => {
          setMyRating(result.score)
        },
        onError: () => {
          toast({ title: 'Could not save track rating', variant: 'error' })
        },
        onSettled: () => setRatingPending(false),
      },
    )
  }

  // Cell background color
  const cellBg = isPlexPlaying
    ? 'bg-primary/10'
    : 'bg-[var(--dk-surface-glass)] group-hover:bg-[var(--dk-surface-glass-hover)]'

  // --- Render ---

  const playButton = canPlayPlex ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        handlePlexPlay()
      }}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors ${isPlexPlaying ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary hover:bg-primary/25'}`}
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
  ) : track.previewUrl ? (
    <audio
      controls
      className="h-7 w-[120px] max-w-[28vw] sm:w-32"
      preload="none"
    >
      <source src={track.previewUrl} type="audio/mpeg" />
    </audio>
  ) : (
    <span className="text-[10px] text-muted-foreground">&mdash;</span>
  )

  return (
    <tr
      data-context-type="track"
      data-track-id={track.id}
      data-track-title={track.title}
      data-track-artist={artistName || undefined}
      data-track-album={albumTitle || undefined}
      className="group transition-colors"
    >
      <td
        className={`py-2.5 transition-colors w-10 rounded-l-xl pr-2 text-right font-mono text-xs text-muted-foreground ${cellBg}`}
      >
        {showDisc
          ? `${track.discNumber}.${track.trackNumber}`
          : track.trackNumber}
      </td>
      <td className={`py-2.5 transition-colors pr-3 ${cellBg}`}>
        <div className="font-medium leading-snug">{track.title}</div>
        {mini && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{mini}</div>
        )}
      </td>
      <td
        className={`py-2.5 transition-colors w-20 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell ${cellBg}`}
      >
        {formatMs(track.durationMs)}
      </td>
      <td
        className={`py-2.5 transition-colors w-[290px] pr-3 hidden md:table-cell ${cellBg}`}
      >
        <TrackInlineActions
          trackId={track.id}
          myRating={myRating}
          ratingPending={ratingPending}
          onRate={handleRate}
          className="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity"
        />
      </td>
      <td
        className={`py-2.5 transition-colors w-10 rounded-r-xl text-center ${cellBg}`}
      >
        {playButton}
      </td>
    </tr>
  )
};
