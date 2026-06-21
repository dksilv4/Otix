import { useState } from 'react'
import { type TrackOut, formatMs } from '@media'
import type { PlexTrackInfo } from '@/old-features/spotify/plex-audio-provider'
import { TrackInlineActions } from '@media/music/components/molecules/media-track-inline-actions'
import { usePlayer } from '@/old-features/spotify/use-player'
import { useRateTrack } from '@media/queries/media-queries'
import { useSaveSpotifyTrack } from '@/old-features/library/library-queries'
import { useToast } from '@/old-features/dk-ui/molecules/toast'

export interface TrackRowProps {
  track: TrackOut
  showDisc: boolean
  playbackPlatform: 'spotify' | 'plex'
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

export function TrackRow({
  track,
  showDisc,
  playbackPlatform,
  plexConnection,
  allTracks,
  albumTitle,
  albumArt,
  artistName,
}: TrackRowProps) {
  const {
    playSpotifyQueue,
    togglePlay,
    currentTrack,
    spotifyIsReady,
    source,
    playPlexAlbum,
    playPlexTrack,
  } = usePlayer()
  const rateTrack = useRateTrack()
  const saveSpotifyTrack = useSaveSpotifyTrack()
  const { toast } = useToast()

  // Local state
  const [liked, setLiked] = useState(false)
  const [myRating, setMyRating] = useState<number | null>(null)
  const [savingSpotify, setSavingSpotify] = useState(false)
  const [ratingPending, setRatingPending] = useState(false)

  // Derived playback state
  const isPlaying = currentTrack?.id === track.spotifyId && source === 'spotify'
  const isPlexPlaying =
    !!plexConnection?.ratingKey &&
    currentTrack?.id === plexConnection.ratingKey &&
    source === 'plex'
  const canPlaySpotify = !!track.spotifyId && spotifyIsReady
  const canPlayPlex = !!plexConnection?.ratingKey
  const preferPlex = playbackPlatform === 'plex' && canPlayPlex

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

  const handlePlay = () => {
    // Row click is no-op for Plex — use the play button in the last cell instead
    if (preferPlex) return
    if (!canPlaySpotify) return
    if (isPlaying) {
      togglePlay()
      return
    }
    // Build "play from here" Spotify queue
    const trackIndex = allTracks.findIndex((t) => t.id === track.id)
    const uris = allTracks
      .slice(trackIndex >= 0 ? trackIndex : 0)
      .filter((t) => t.spotifyId)
      .map((t) => `spotify:track:${t.spotifyId}` as string)
    playSpotifyQueue(uris)
  }

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

  const handleSaveSpotify = (spotifyId: string) => {
    setSavingSpotify(true)
    saveSpotifyTrack.mutate(spotifyId, {
      onSuccess: () => {
        setLiked(true)
        toast({ title: 'Added to Spotify liked songs', variant: 'success' })
      },
      onError: () => {
        toast({
          title: 'Could not save to Spotify',
          description: 'Check your Spotify connection and try again.',
          variant: 'error',
        })
      },
      onSettled: () => setSavingSpotify(false),
    })
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
  const cellBg = isPlaying
    ? 'bg-[#1DB954]/10'
    : isPlexPlaying
      ? 'bg-amber-500/10'
      : 'bg-[var(--dk-surface-glass)] group-hover:bg-[var(--dk-surface-glass-hover)]'

  // --- Render ---

  return (
    <tr
      onClick={handlePlay}
      className={`group transition-colors ${canPlaySpotify && !preferPlex ? 'cursor-pointer' : ''}`}
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
          spotifyId={track.spotifyId}
          spotifyLiked={liked}
          savingSpotify={savingSpotify}
          myRating={myRating}
          ratingPending={ratingPending}
          onSaveSpotify={handleSaveSpotify}
          onRate={handleRate}
          className="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity"
        />
      </td>
      <td
        className={`py-2.5 transition-colors w-10 rounded-r-xl text-center ${cellBg}`}
      >
        {preferPlex ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePlexPlay()
            }}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors ${isPlexPlaying ? 'bg-amber-500 text-black' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
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
            className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors pointer-events-none ${isPlaying ? 'bg-[#1DB954] text-black' : 'bg-[#1DB954]/20 text-[#1DB954]'}`}
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
          <audio
            controls
            className="h-7 w-[120px] max-w-[28vw] sm:w-32"
            preload="none"
          >
            <source src={track.previewUrl} type="audio/mpeg" />
          </audio>
        ) : canPlayPlex ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePlexPlay()
            }}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors ${isPlexPlaying ? 'bg-amber-500 text-black' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
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
          <span className="text-[10px] text-muted-foreground">&mdash;</span>
        )}
      </td>
    </tr>
  )
}
