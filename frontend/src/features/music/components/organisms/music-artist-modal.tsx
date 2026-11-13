import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Mic2, Disc3, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { DkDialog } from '@/components/ui/molecules/dialog'
import { apiClient } from '@/lib/api/client'
import { usePlayer } from '@/lib/player/use-player'
import type { PlexArtistDetails } from '../../plex/hooks/use-plex-music'
import type { PlexTrackInfo } from '@/lib/player/types'
import { formatTrackDuration } from '../../utils/music-helpers'

export interface MusicArtistModalProps {
  open: boolean
  onClose: () => void
  ratingKey?: string | null
  serverId?: number | null
  artistName: string
  artistThumb?: string | null
  initialAlbums?: Array<{
    ratingKey?: string
    title: string
    artist: string
    thumbUrl?: string | null
    year?: number | string | null
  }>
  initialTracks?: Array<{
    id: string
    ratingKey?: string
    title: string
    artist: string
    albumName?: string
    trackNumber?: number | null
    durationMs?: number | null
  }>
  onSelectAlbum: (album: {
    ratingKey: string
    title: string
    artist: string
    thumbUrl: string | null
    year: number | null
  }) => void
  onPlayArtist?: () => void
  onPlayTrack?: (track: unknown, index: number) => void
}

export const MusicArtistModal = ({
  open,
  onClose,
  ratingKey,
  serverId,
  artistName,
  artistThumb,
  initialAlbums,
  initialTracks,
  onSelectAlbum,
  onPlayArtist,
  onPlayTrack,
}: MusicArtistModalProps) => {
  const { currentTrack, playPlexAlbum } = usePlayer()
  const [isBioExpanded, setIsBioExpanded] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['plex-music-artist-details', ratingKey, serverId],
    queryFn: async () => {
      if (!ratingKey || !serverId) return null
      const res = await apiClient.get<PlexArtistDetails>(
        `/integrations/plex/music/artist/${ratingKey}`,
        {
          params: { serverId },
        },
      )
      return res.data
    },
    enabled: open && !!ratingKey && !!serverId && !initialTracks,
    staleTime: 1000 * 60 * 5,
  })

  const effectiveName = data?.artist?.name || artistName || 'Unknown Artist'
  const effectiveThumb = data?.artist?.thumbUrl ?? artistThumb ?? null
  const albums = initialAlbums && initialAlbums.length > 0 ? initialAlbums : data?.albums || []
  const tracks = initialTracks && initialTracks.length > 0
    ? initialTracks.map((t) => ({
        ratingKey: t.ratingKey || t.id,
        title: t.title,
        artist: t.artist,
        albumName: t.albumName || '',
        trackNumber: t.trackNumber || 1,
        discNumber: 1,
        durationMs: t.durationMs || 0,
      }))
    : data?.tracks || []
  const summary = data?.artist?.summary || ''

  const handlePlayArtist = async () => {
    if (onPlayArtist) {
      onPlayArtist()
      return
    }
    if (!data?.baseUrl || !data?.token || tracks.length === 0) return
    const plexTracks: PlexTrackInfo[] = tracks.map((t) => ({
      id: t.ratingKey,
      ratingKey: t.ratingKey,
      title: t.title,
      artist: t.artist || effectiveName,
      albumName: t.albumName || '',
      albumArt: effectiveThumb,
      durationMs: t.durationMs || 0,
      plexBaseUrl: data.baseUrl as string,
      plexToken: data.token as string,
    }))
    await playPlexAlbum(plexTracks, 0)
  }

  const handleTrackClick = async (t: typeof tracks[0], idx: number) => {
    if (onPlayTrack) {
      onPlayTrack(t, idx)
      return
    }
    if (!data?.baseUrl || !data?.token || tracks.length === 0) return
    const plexTracks: PlexTrackInfo[] = tracks.map((track) => ({
      id: track.ratingKey,
      ratingKey: track.ratingKey,
      title: track.title,
      artist: track.artist || effectiveName,
      albumName: track.albumName || '',
      albumArt: effectiveThumb,
      durationMs: track.durationMs || 0,
      plexBaseUrl: data.baseUrl as string,
      plexToken: data.token as string,
    }))
    await playPlexAlbum(plexTracks, idx)
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      className="max-w-3xl bg-[var(--dk-surface-overlay)] border border-white/[0.04] p-0 overflow-hidden rounded-3xl"
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Hero Banner */}
        <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 overflow-hidden bg-[var(--dk-surface-raised)]">
          {data?.artist?.artUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-15 blur-sm"
              style={{ backgroundImage: `url(${data.artist.artUrl})` }}
            />
          )}

          <div className="relative z-10 h-32 w-32 sm:h-36 sm:w-36 flex-shrink-0 overflow-hidden rounded-full bg-[var(--dk-surface-glass)] shadow-xl border border-white/[0.04]">
            {effectiveThumb ? (
              <img
                src={effectiveThumb}
                alt={effectiveName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                <Mic2 className="h-16 w-16 stroke-[1.5]" />
              </div>
            )}
          </div>

          <div className="relative z-10 flex flex-col min-w-0 text-center sm:text-left flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Artist
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground truncate mt-0.5">
              {effectiveName}
            </h2>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs text-muted-foreground mt-1">
              <span>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span>
              <span>•</span>
              <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
            </div>

            <div className="mt-4 flex items-center justify-center sm:justify-start gap-3">
              <button
                type="button"
                onClick={() => void handlePlayArtist()}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                <span>Play Artist</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Summary / Bio */}
              {summary && (
                <div className="rounded-2xl bg-[var(--dk-surface-raised)]/60 p-4 border border-white/[0.04]">
                  <p
                    className={`text-xs text-muted-foreground leading-relaxed whitespace-pre-line ${
                      isBioExpanded ? '' : 'line-clamp-3'
                    }`}
                  >
                    {summary}
                  </p>
                  {summary.length > 200 && (
                    <button
                      type="button"
                      onClick={() => setIsBioExpanded(!isBioExpanded)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <span>{isBioExpanded ? 'Show less' : 'Read more'}</span>
                      {isBioExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Albums Shelf */}
              {albums.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Albums</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {albums.map((alb) => (
                      <div
                        key={alb.ratingKey || alb.title}
                        onClick={() =>
                          onSelectAlbum({
                            ratingKey: alb.ratingKey || '',
                            title: alb.title,
                            artist: alb.artist,
                            thumbUrl: alb.thumbUrl ?? null,
                            year: typeof alb.year === 'number' ? alb.year : null,
                          })
                        }
                        className="group flex flex-col gap-2 rounded-2xl p-2.5 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-white/[0.04] transition-colors cursor-pointer"
                      >
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[var(--dk-surface-raised)]">
                          {alb.thumbUrl ? (
                            <img
                              src={alb.thumbUrl}
                              alt={alb.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                              <Disc3 className="h-8 w-8 stroke-[1.5]" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {alb.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {alb.year || 'Album'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tracks List */}
              {tracks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Top Tracks</h3>
                  <div className="divide-y divide-white/[0.04]">
                    {tracks.map((t, idx) => {
                      const isCurrent = currentTrack?.id === t.ratingKey
                      return (
                        <div
                          key={t.ratingKey}
                          onClick={() => void handleTrackClick(t, idx)}
                          className={`group flex items-center justify-between gap-3 py-2 px-3 rounded-xl transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-[var(--dk-surface-glass-hover)] text-primary'
                              : 'hover:bg-[var(--dk-surface-glass)] text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-5 text-center text-xs text-muted-foreground group-hover:hidden">
                              {idx + 1}
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
                              {t.albumName && (
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {t.albumName}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                            {formatTrackDuration(t.durationMs)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
