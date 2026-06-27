import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AlbumDetail, TrackOut } from '../../../queries/media-queries'
import { mediaQueries } from '../../../queries/media-queries'
import { useMediaParams } from '../../../hooks/use-media-params'
import { cn } from '@/lib/utils'
import { Disc3, ExternalLink, Music2, Play } from 'lucide-react'
import { usePlayer } from '@/lib/player/use-player'
import type { PlexTrackInfo } from '@/lib/player/plex-audio-provider'
import { AudioFeatureRow } from './media-music-audio-feature-row'
import { MetaItem } from './media-music-meta-item'
import { TrackRow } from './media-music-track-row'
import { usePlexAlbumTracks, type PlexAlbumTrack } from '@/old-features/library/library-queries'

interface MusicSectionProps {
 className?: string
}

const EMPTY_TRACKS: TrackOut[] = []

function formatMs(ms: number | null | undefined): string {
 if (ms == null || ms <= 0) return '—'
 const totalSec = Math.round(ms / 1000)
 const m = Math.floor(totalSec / 60)
 const s = totalSec % 60
 return `${m}:${s.toString().padStart(2, '0')}`
}

/** Spotify-style audio feature keys we show when present on album or tracks */
const ALBUM_AUDIO_FEATURE_ORDER = [
 ['tempo', 'Tempo'],
 ['energy', 'Energy'],
 ['danceability', 'Dance'],
 ['valence', 'Valence'],
 ['acousticness', 'Acoustic'],
 ['instrumentalness', 'Instrumental'],
 ['liveness', 'Live'],
 ['speechiness', 'Speech'],
] as const

function renderAlbumAudioFeatures(features: Record<string, unknown> | null | undefined) {
 if (!features || typeof features !== 'object') return null
 const hasAny = ALBUM_AUDIO_FEATURE_ORDER.some(([k]) => {
 const v = features[k]
 return v != null && typeof v === 'number'
 })
 if (!hasAny) return null
 return (
 <div className="space-y-3">
 <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
 Audio features
 </h3>
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {ALBUM_AUDIO_FEATURE_ORDER.map(([key, label]) => (
 <AudioFeatureRow key={key} featKey={key} label={label} features={features} />
 ))}
 </div>
 </div>
 )
}

export function MusicSection({ className }: MusicSectionProps = {}) {
	const { mediaId } = useMediaParams()

	const { data } = useQuery(mediaQueries.detail('music', mediaId))
	const album = data?.album as AlbumDetail | undefined
	if (!album) return null

	const mediaItemId = mediaId
	const { title, posterUrl } = data ?? {}
	// Artist name from first music-relevant credit, or fallback to empty
	const artistName = data?.credits?.find(c => ['artist', 'musician', 'composer', 'main'].includes(c.role))?.person?.name ?? null

	const tracks = album.tracks ?? EMPTY_TRACKS
	const { playSpotifyQueue, spotifyIsReady, playPlexAlbum, error } = usePlayer()
	const { data: plexData } = usePlexAlbumTracks(mediaItemId)
 const plexTracks = plexData?.tracks

 // Merge Plex-only tracks into the display list so the player queue doesn't
 // include tracks the user can't see. Without this, "Play on Plex" queues all
 // Plex tracks but only DB-synced tracks appear in the table.
 const allTracks = useMemo(() => {
 if (!plexTracks || plexTracks.length === 0) return tracks
 const existingKeys = new Set(tracks.map((t) => `${t.discNumber}:${t.trackNumber}`))
 const extra: TrackOut[] = []
 for (const pt of plexTracks) {
 if (!existingKeys.has(`${pt.discNumber}:${pt.trackNumber}`)) {
 extra.push({
 id: `plex-${pt.ratingKey}`,
 trackNumber: pt.trackNumber,
 discNumber: pt.discNumber,
 title: pt.title,
 durationMs: pt.durationMs,
 previewUrl: null,
 spotifyId: null,
 musicbrainzRecordingId: null,
 audioFeatures: null,
 avgRating: null,
 ratingCount: 0,
 } satisfies TrackOut)
 }
 }
 if (extra.length === 0) return tracks
 return [...tracks, ...extra].sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber)
 }, [tracks, plexTracks])

 const multiDisc = allTracks.some((t) => t.discNumber > 1)

 // Platform picker: when both Spotify and Plex are available, let the user choose.
 // Default to Spotify when both are present, Plex if only Plex is available.
 const hasSpotify = !!(album.spotifyId && spotifyIsReady)
 const hasPlex = !!(plexTracks && plexTracks.length > 0 && plexData)
 const hasBothPlatforms = hasSpotify && hasPlex
 const [playbackPlatform, setPlaybackPlatform] = useState<'spotify' | 'plex'>(
 hasSpotify ? 'spotify' : 'plex',
 )

 // Plex credentials for client-side stream URL resolution
 const plexBaseUrl = plexData?.baseUrl
 const plexToken = plexData?.token
 const plexReady = !!plexBaseUrl && !!plexToken
 // Album art comes from Fanart/MusicBrainz (posterUrl) — never from Plex.

 // Helper: build a PlexTrackInfo for a single track (just credentials, no pre-built URL).
 // The provider resolves the Part key from Plex metadata at play time.
 const plexTrackInfo = (ratingKey: string, trackTitle: string, artist: string, durMs: number): PlexTrackInfo => ({
 id: ratingKey,
 ratingKey,
 title: trackTitle,
 artist,
 albumName: title || "",
 albumArt: posterUrl,
 durationMs: durMs || 0,
 plexBaseUrl: plexBaseUrl ?? null,
 plexToken: plexToken ?? null,
 })


 return (
 <section className={cn('space-y-8', className)}>
 <div className="flex items-center gap-2">
 <Music2 className="h-5 w-5 text-amber-500" aria-hidden />
 <h2 className="text-lg font-semibold">Album</h2>
 </div>

 {/* Release metadata */}
 <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-sm)' }}>
 <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
 Release details
 </h3>
 <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
 <MetaItem label="Release type" value={album.releaseType} />
 <MetaItem label="Format" value={album.format} />
 <MetaItem label="Catalog #" value={album.catalogNumber} />
 <MetaItem label="Barcode" value={album.barcode} />
 <div>
 <dt className="text-xs text-muted-foreground">Tracks</dt>
 <dd className="text-sm font-medium">
 {allTracks.length || album.trackCount}
 {album.discCount > 1 ? ` · ${album.discCount} discs` : ''}
 </dd>
 </div>
 <div>
 <dt className="text-xs text-muted-foreground">Total length</dt>
 <dd className="text-sm font-medium">
 {formatMs(
 album.durationMs ??
 (allTracks.length > 0
 ? allTracks.reduce((sum, t) => sum + (t.durationMs || 0), 0)
 : null),
 )}
 </dd>
 </div>
 {album.spotifyPopularity != null && (
 <div>
 <dt className="text-xs text-muted-foreground">Spotify popularity</dt>
 <dd className="text-sm font-medium">{album.spotifyPopularity}/100</dd>
 </div>
 )}
 </dl>

 <div className="mt-4 flex flex-wrap items-center gap-2">
 {/* Platform picker — shown when album is on both Spotify and Plex */}
 {hasBothPlatforms && (
 <div className="flex items-center rounded-lg p-0.5 mr-1" style={{ backgroundColor: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}>
 <button
 type="button"
 onClick={() => setPlaybackPlatform('spotify')}
 className={cn(
 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all text-muted-foreground hover:text-foreground',
 playbackPlatform === 'spotify' && 'bg-[#1DB954] text-black shadow-sm',
 )}
 >
 <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
 <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
 </svg>
 Spotify
 </button>
 <button
 type="button"
 onClick={() => setPlaybackPlatform('plex')}
 className={cn(
 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all text-muted-foreground hover:text-foreground',
 playbackPlatform === 'plex' && 'bg-amber-500 text-black shadow-sm',
 )}
 >
 <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
 <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.54 4.92.42-3.73 3.23L16.23 18z" />
 </svg>
 Plex
 </button>
 </div>
 )}
 {/* Spotify Play Album */}
 {hasSpotify && (!hasBothPlatforms || playbackPlatform === 'spotify') && (
 <button
 type="button"
 onClick={() => {
 const uris = allTracks.filter(t => t.spotifyId).map(t => `spotify:track:${t.spotifyId}` as string)
 if (uris.length > 0) playSpotifyQueue(uris)
 }}
 className="inline-flex items-center gap-1.5 rounded-lg bg-[#1DB954] px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#1DB954]/90"
 >
 <Play className="h-3.5 w-3.5 fill-current" />
 Play Album
 </button>
 )}
 {/* Plex Play Album */}
 {hasPlex && (!hasBothPlatforms || playbackPlatform === 'plex') && (
 <button
 type="button"
 onClick={() => {
 if (!plexReady) {
 console.warn("Plex connection info not available — try re-syncing Plex in Settings")
 return
 }
 const info: PlexTrackInfo[] = plexTracks.map(pt =>
 plexTrackInfo(pt.ratingKey, pt.title, pt.artist || artistName || "", pt.durationMs || 0),
 )
 if (info.length > 0) playPlexAlbum(info)
 }}
 className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
 >
 <Play className="h-3.5 w-3.5 fill-current" />
 Play on Plex
 </button>
 )}
 {hasPlex && !plexReady && (
 <span className="text-[11px] text-amber-500/60">
 Plex connection unavailable — re-sync in Settings
 </span>
 )}
 {album.spotifyUrl && (
 <a
 href={album.spotifyUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 rounded-lg bg-[#1DB954]/20 px-3 py-1.5 text-xs font-medium text-[#1DB954] transition-colors hover:bg-[#1DB954]/30"
 >
 <ExternalLink className="h-3.5 w-3.5" />
 Spotify
 </a>
 )}
 {album.musicbrainzId && (
 <a
 href={`https://musicbrainz.org/release/${album.musicbrainzId}`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-500/30"
 >
 <ExternalLink className="h-3.5 w-3.5" />
 MusicBrainz
 </a>
 )}
 {album.musicbrainzReleaseGroupId && (
 <a
 href={`https://musicbrainz.org/release-group/${album.musicbrainzReleaseGroupId}`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300/90 transition-colors hover:bg-orange-500/25"
 >
 <Disc3 className="h-3.5 w-3.5" />
 Release group
 </a>
 )}
 {album.previewUrl && !album.spotifyUrl && (
 <a
 href={album.previewUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:underline"
 >
 Album preview
 </a>
 )}
 </div>
 </div>

 {error && (
 <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-400">
 Playback error: {error}
 </div>
 )}

 {renderAlbumAudioFeatures(album.audioFeatures)}

 {/* Track list */}
 <div className="space-y-3">
 <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
 Tracks ({allTracks.length || album.trackCount})
 </h3>
 {allTracks.length === 0 ? (
 <p className="text-sm text-muted-foreground">No track listing synced yet.</p>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full min-w-[320px] border-separate border-spacing-y-1 text-left text-sm">
 <thead>
 <tr className="text-xs uppercase tracking-wider text-muted-foreground">
 <th className="w-10 pb-1.5 pr-2 text-right font-medium">#</th>
 <th className="pb-1.5 pr-3 font-medium">Title</th>
 <th className="w-20 pb-1.5 pr-3 text-right font-medium hidden sm:table-cell">Time</th>
 <th className="w-[290px] pb-1.5 pr-3 text-right font-medium hidden md:table-cell">Rate</th>
 <th className="w-10 pb-1.5 text-center font-medium">Play</th>
 </tr>
 </thead>
 <tbody>
 {(() => {
 const plexByTrack = new Map<string, PlexAlbumTrack>()
 if (plexTracks) {
 for (const pt of plexTracks) {
 plexByTrack.set(`${pt.discNumber}:${pt.trackNumber}`, pt)
 }
 }

 return allTracks.map((t) => {
 const plexMatch = plexByTrack.get(`${t.discNumber}:${t.trackNumber}`)

 return (
 <TrackRow
 key={t.id}
 track={t}
 showDisc={multiDisc}
 playbackPlatform={playbackPlatform}
 allTracks={allTracks}
 albumTitle={title || ""}
 albumArt={posterUrl}
 artistName={artistName}
 plexConnection={
 plexMatch
 ? {
 ratingKey: plexMatch.ratingKey,
 baseUrl: plexBaseUrl ?? null,
 token: plexToken ?? null,
 artist: plexMatch.artist || "",
 }
 : null
 }
 />
 )
 })
 })()}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {album.spotifyId && (
 <p className="text-[11px] text-muted-foreground">
 Spotify ID: <span className="font-mono">{album.spotifyId}</span>
 {album.musicbrainzId && (
 <>
 {' · '}
 MB Release: <span className="font-mono">{album.musicbrainzId}</span>
 </>
 )}
 </p>
 )}
 </section>
 )
}
