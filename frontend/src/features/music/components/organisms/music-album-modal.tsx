import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Disc3, Loader2 } from 'lucide-react'
import { DkDialog } from '@/components/ui/molecules/dialog'
import { apiClient } from '@/lib/api/client'
import { usePlayer } from '@/lib/player/use-player'
import type { PlexAlbumTracksResponse } from '../../plex/hooks/use-plex-music'
import type { PlexTrackInfo } from '@/lib/player/types'
import { formatTrackDuration, formatTotalAlbumDuration } from '../../utils/music-helpers'

export interface AlbumTrackItem {
  id: string
  ratingKey?: string
  title: string
  artist: string
  trackNumber: number | null
  discNumber?: number
  durationMs: number | null
}

export interface MusicAlbumModalProps {
  open: boolean
  onClose: () => void
  albumTitle: string
  albumArtist?: string | null
  coverArtUrl?: string | null
  year?: number | string | null
  ratingKey?: string | null
  serverId?: number | null
  initialTracks?: AlbumTrackItem[]
  onPlayAlbum?: () => void
  onPlayTrack?: (track: AlbumTrackItem, index: number) => void
}

export const MusicAlbumModal = ({
  open,
  onClose,
  albumTitle,
  albumArtist,
  coverArtUrl,
  year,
  ratingKey,
  serverId,
  initialTracks,
  onPlayAlbum,
  onPlayTrack,
}: MusicAlbumModalProps) => {
  const { currentTrack, isPlaying, playPlexAlbum } = usePlayer()

  const { data: plexData, isLoading: isLoadingPlex } = useQuery({
    queryKey: ['plex-music-album-tracks', ratingKey, serverId],
    queryFn: async () => {
      if (!ratingKey || !serverId) return null
      const { data } = await apiClient.get<PlexAlbumTracksResponse>(
        `/integrations/plex/music/album/${ratingKey}`,
        {
          params: { serverId },
        },
      )
      return data
    },
    enabled: open && !!ratingKey && !!serverId && !initialTracks,
    staleTime: 1000 * 60 * 5,
  })

  const tracks: AlbumTrackItem[] = useMemo(() => {
    if (initialTracks && initialTracks.length > 0) {
      return initialTracks
    }
    if (plexData?.tracks) {
      return plexData.tracks.map((t) => ({
        id: t.ratingKey,
        ratingKey: t.ratingKey,
        title: t.title,
        artist: t.artist || albumArtist || '',
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        durationMs: t.durationMs,
      }))
    }
    return []
  }, [initialTracks, plexData, albumArtist])

  const effectiveCover = coverArtUrl ?? plexData?.albumThumbUrl ?? null

  const handlePlayAll = async () => {
    if (onPlayAlbum) {
      onPlayAlbum()
      return
    }
    if (plexData?.baseUrl && plexData?.token && tracks.length > 0) {
      const plexTracks: PlexTrackInfo[] = tracks.map((t) => ({
        id: t.id,
        ratingKey: t.ratingKey || t.id,
        title: t.title,
        artist: t.artist,
        albumName: albumTitle,
        albumArt: effectiveCover,
        durationMs: t.durationMs || 0,
        plexBaseUrl: plexData.baseUrl as string,
        plexToken: plexData.token as string,
      }))
      await playPlexAlbum(plexTracks, 0)
    }
  }

  const handleTrackClick = async (track: AlbumTrackItem, idx: number) => {
    if (onPlayTrack) {
      onPlayTrack(track, idx)
      return
    }
    if (plexData?.baseUrl && plexData?.token && tracks.length > 0) {
      const plexTracks: PlexTrackInfo[] = tracks.map((t) => ({
        id: t.id,
        ratingKey: t.ratingKey || t.id,
        title: t.title,
        artist: t.artist,
        albumName: albumTitle,
        albumArt: effectiveCover,
        durationMs: t.durationMs || 0,
        plexBaseUrl: plexData.baseUrl as string,
        plexToken: plexData.token as string,
      }))
      await playPlexAlbum(plexTracks, idx)
    }
  }

  const totalDurationStr = formatTotalAlbumDuration(tracks)

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      className="max-w-2xl bg-[var(--dk-surface-overlay)] border border-white/[0.04] p-0 overflow-hidden rounded-3xl"
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Header Header/Hero */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 bg-[var(--dk-surface-raised)]">
          <div className="relative h-32 w-32 sm:h-36 sm:w-36 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--dk-surface-glass)] shadow-lg border border-white/[0.04]">
            {effectiveCover ? (
              <img
                src={effectiveCover}
                alt={albumTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                <Disc3 className="h-16 w-16 stroke-[1.5]" />
              </div>
            )}
          </div>

          <div className="flex flex-col min-w-0 text-center sm:text-left flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Album
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate mt-0.5">
              {albumTitle}
            </h2>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs text-muted-foreground mt-1">
              {albumArtist && <span className="font-medium text-foreground">{albumArtist}</span>}
              {year && (
                <>
                  <span>•</span>
                  <span>{year}</span>
                </>
              )}
              {tracks.length > 0 && (
                <>
                  <span>•</span>
                  <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                </>
              )}
              {totalDurationStr && (
                <>
                  <span>•</span>
                  <span>{totalDurationStr}</span>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center sm:justify-start gap-3">
              <button
                type="button"
                onClick={() => void handlePlayAll()}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                <span>Play Album</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tracklist Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-white/[0.04]">
          {isLoadingPlex ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : tracks.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
              No tracks found for this album
            </div>
          ) : (
            tracks.map((t, idx) => {
              const isCurrent = currentTrack?.id === t.id
              return (
                <div
                  key={t.id || idx}
                  onClick={() => void handleTrackClick(t, idx)}
                  className={`group flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[var(--dk-surface-glass-hover)] text-primary'
                      : 'hover:bg-[var(--dk-surface-glass)] text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-xs text-muted-foreground group-hover:hidden">
                      {t.trackNumber || idx + 1}
                    </span>
                    <button
                      type="button"
                      className="hidden h-5 w-5 items-center justify-center text-primary group-hover:flex"
                      aria-label={`Play ${t.title}`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>

                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs font-medium truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                        {t.title}
                      </span>
                      {t.artist && t.artist !== albumArtist && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {t.artist}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isCurrent && isPlaying && (
                      <span className="flex gap-0.5 items-end h-3">
                        <span className="w-0.5 bg-primary animate-pulse h-full" />
                        <span className="w-0.5 bg-primary animate-pulse h-2/3" />
                        <span className="w-0.5 bg-primary animate-pulse h-4/5" />
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatTrackDuration(t.durationMs)}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DkDialog>
  )
}
