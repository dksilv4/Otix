// TODO: Review this file
import { useState, useMemo } from 'react'
import type { AlbumDetail, TrackOut } from '../media-queries'
import { useRateTrack } from '../media-queries'
import { cn } from '@/lib/utils'
import { Disc3, ExternalLink, Music2, Play } from 'lucide-react'
import { usePlayer } from '@/features/spotify/use-player'
import type { PlexTrackInfo } from '@/features/spotify/plex-audio-provider'
import { TrackInlineActions } from '../molecules/track-inline-actions'
import { useSaveSpotifyTrack, usePlexAlbumTracks, type PlexAlbumTrack } from '@/features/library/library-queries'
import { useToast } from '@/features/dk-ui/molecules/toast'
import './music-section.scss'

interface MusicSectionProps {
 album: AlbumDetail
 mediaItemId: string
 title: string
 posterUrl: string | null
 artistName: string | null
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

function AudioFeatureRow({
 featKey,
 label,
 features,
}: {
 featKey: string
 label: string
 features: Record<string, unknown>
}) {
 const raw = features[featKey]
 if (raw == null || typeof raw !== 'number') return null

 if (featKey === 'tempo') {
 return (
 <div className="dk-media-music-section__audio-feature">
 <div className="dk-media-music-section__audio-feature-label-row">
 <span className="text-muted-foreground">{label}</span>
 <span className="dk-media-music-section__audio-feature-value">{Math.round(raw)} BPM</span>
 </div>
 </div>
 )
 }

 const pct = Math.round(Math.min(1, Math.max(0, raw)) * 100)
 return (
 <div className="dk-media-music-section__audio-feature">
 <div className="dk-media-music-section__audio-feature-label-row">
 <span className="text-muted-foreground">{label}</span>
 <span className="dk-media-music-section__audio-feature-value">{pct}%</span>
 </div>
 <div className="dk-media-music-section__audio-feature-bar-bg">
 <div className="dk-media-music-section__audio-feature-bar-fill" style={{ width: `${pct}%` }} />
 </div>
 </div>
 )
}

function renderAlbumAudioFeatures(features: Record<string, unknown> | null | undefined) {
 if (!features || typeof features !== 'object') return null
 const hasAny = ALBUM_AUDIO_FEATURE_ORDER.some(([k]) => {
 const v = features[k]
 return v != null && typeof v === 'number'
 })
 if (!hasAny) return null
 return (
 <div className="dk-media-music-section__audio-features">
 <h3 className="dk-media-music-section__subheading">
 Audio features
 </h3>
 <div className="dk-media-music-section__audio-feature-grid">
 {ALBUM_AUDIO_FEATURE_ORDER.map(([key, label]) => (
 <AudioFeatureRow key={key} featKey={key} label={label} features={features} />
 ))}
 </div>
 </div>
 )
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
 if (value == null || value === '') return null
 return (
 <div>
 <dt className="dk-media-music-section__meta-label">{label}</dt>
 <dd className="dk-media-music-section__meta-value">{value}</dd>
 </div>
 )
}

function TrackRow({
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
 const cellClass = cn(
 'dk-media-music-section__cell',
 isPlaying ? 'dk-media-music-section__cell--playing-spotify' : isPlexPlaying ? 'dk-media-music-section__cell--playing-plex' : 'dk-media-music-section__cell--idle',
 )

 return (
 <tr
 onClick={handleRowClick}
 className={cn(
 'dk-media-music-section__track-row',
 (canPlaySpotify && !preferPlex) && 'dk-media-music-section__track-row--clickable',
 )}
 >
 <td className={cn(cellClass, 'dk-media-music-section__cell--number')}>
 {showDisc ? `${track.discNumber}.${track.trackNumber}` : track.trackNumber}
 </td>
 <td className={cn(cellClass, 'dk-media-music-section__cell--title')}>
 <div className="dk-media-music-section__track-title">{track.title}</div>
 {mini && <div className="dk-media-music-section__track-features">{mini}</div>}
 </td>
 <td className={cn(cellClass, 'dk-media-music-section__cell--time')}>
 {formatMs(track.durationMs)}
 </td>
 <td className={cn(cellClass, 'dk-media-music-section__cell--actions')}>
 <TrackInlineActions
 trackId={track.id}
 spotifyId={track.spotifyId}
 spotifyLiked={spotifyLiked}
 savingSpotify={savingSpotify}
 myRating={rating.myRating}
 ratingPending={ratingPending}
 onSaveSpotify={onSaveSpotify}
 onRate={onRate}
 className="dk-media-music-section__track-actions"
 />
 </td>
 <td className={cn(cellClass, 'dk-media-music-section__cell--play')}>
 {preferPlex ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 onPlexPlay?.()
 }}
 className={cn(
 'dk-media-music-section__play-btn',
 isPlexPlaying
 ? 'dk-media-music-section__play-btn--plex-active'
 : 'dk-media-music-section__play-btn--plex-inactive',
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
 'dk-media-music-section__play-indicator',
 isPlaying
 ? 'dk-media-music-section__play-indicator--active'
 : 'dk-media-music-section__play-indicator--inactive',
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
 'dk-media-music-section__play-btn',
 isPlexPlaying
 ? 'dk-media-music-section__play-btn--plex-active'
 : 'dk-media-music-section__play-btn--plex-inactive',
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
 <span className="dk-media-music-section__play-empty">—</span>
 )}
 </td>
 </tr>
 )
}

export function MusicSection({ album, mediaItemId, title, posterUrl, artistName, className }: MusicSectionProps) {
 const tracks = album.tracks ?? EMPTY_TRACKS
 const { playSpotifyQueue, currentTrack, spotifyIsReady, togglePlay, playPlexAlbum, playPlexTrack, source, error } = usePlayer()
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

 const saveSpotifyTrack = useSaveSpotifyTrack()
 const rateTrack = useRateTrack()
 const { toast } = useToast()
 const [likedSpotifyIds, setLikedSpotifyIds] = useState<Set<string>>(new Set())
 const [savingSpotifyId, setSavingSpotifyId] = useState<string | null>(null)
 const [ratingTrackId, setRatingTrackId] = useState<string | null>(null)
 const [ratingsByTrack, setRatingsByTrack] = useState<
 Record<string, { myRating?: number | null; avgRating?: number | null; ratingCount: number }>
 >({})

 const handleSaveSpotify = (spotifyId: string) => {
 setSavingSpotifyId(spotifyId)
 saveSpotifyTrack.mutate(spotifyId, {
 onSuccess: () => {
 setLikedSpotifyIds((current) => new Set(current).add(spotifyId))
 toast({ title: 'Added to Spotify liked songs', variant: 'success' })
 },
 onError: () => {
 toast({
 title: 'Could not save to Spotify',
 description: 'Check your Spotify connection and try again.',
 variant: 'error',
 })
 },
 onSettled: () => setSavingSpotifyId(null),
 })
 }

 const handleRateTrack = (trackId: string, score: number) => {
 setRatingTrackId(trackId)
 rateTrack.mutate({ trackId, score }, {
 onSuccess: (result) => {
 setRatingsByTrack((current) => ({
 ...current,
 [trackId]: {
 myRating: result.score,
 avgRating: result.avgRating,
 ratingCount: result.ratingCount,
 },
 }))
 },
 onError: () => {
 toast({ title: 'Could not save track rating', variant: 'error' })
 },
 onSettled: () => setRatingTrackId(null),
 })
 }

 return (
 <section className={cn('dk-media-music-section', className)}>
 <div className="dk-media-music-section__header">
 <Music2 className="h-5 w-5 text-amber-500" aria-hidden />
 <h2 className="dk-media-music-section__heading">Album</h2>
 </div>

 {/* Release metadata */}
 <div className="dk-media-music-section__release-card">
 <h3 className="dk-media-music-section__subheading">
 Release details
 </h3>
 <dl className="dk-media-music-section__meta-grid">
 <MetaItem label="Release type" value={album.releaseType} />
 <MetaItem label="Format" value={album.format} />
 <MetaItem label="Catalog #" value={album.catalogNumber} />
 <MetaItem label="Barcode" value={album.barcode} />
 <div>
 <dt className="dk-media-music-section__meta-label">Tracks</dt>
 <dd className="dk-media-music-section__meta-value--plain">
 {allTracks.length || album.trackCount}
 {album.discCount > 1 ? ` · ${album.discCount} discs` : ''}
 </dd>
 </div>
 <div>
 <dt className="dk-media-music-section__meta-label">Total length</dt>
 <dd className="dk-media-music-section__meta-value--plain">
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
 <dt className="dk-media-music-section__meta-label">Spotify popularity</dt>
 <dd className="dk-media-music-section__meta-value--plain">{album.spotifyPopularity}/100</dd>
 </div>
 )}
 </dl>

 <div className="dk-media-music-section__actions">
 {/* Platform picker — shown when album is on both Spotify and Plex */}
 {hasBothPlatforms && (
 <div className="dk-media-music-section__platform-picker">
 <button
 type="button"
 onClick={() => setPlaybackPlatform('spotify')}
 className={cn(
 'dk-media-music-section__platform-btn',
 playbackPlatform === 'spotify'
 ? 'dk-media-music-section__platform-btn--active-spotify'
 : '',
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
 'dk-media-music-section__platform-btn',
 playbackPlatform === 'plex'
 ? 'dk-media-music-section__platform-btn--active-plex'
 : '',
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
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--spotify-play"
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
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--plex-play"
 >
 <Play className="h-3.5 w-3.5 fill-current" />
 Play on Plex
 </button>
 )}
 {hasPlex && !plexReady && (
 <span className="dk-media-music-section__plex-notice">
 Plex connection unavailable — re-sync in Settings
 </span>
 )}
 {album.spotifyUrl && (
 <a
 href={album.spotifyUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--link-spotify"
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
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--link-musicbrainz"
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
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--link-releasegroup"
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
 className="dk-media-music-section__action-btn dk-media-music-section__action-btn--preview"
 >
 Album preview
 </a>
 )}
 </div>
 </div>

 {error && (
 <div className="dk-media-music-section__error">
 Playback error: {error}
 </div>
 )}

 {renderAlbumAudioFeatures(album.audioFeatures)}

 {/* Track list */}
 <div className="dk-media-music-section__tracklist">
 <h3 className="dk-media-music-section__subheading">
 Tracks ({allTracks.length || album.trackCount})
 </h3>
 {allTracks.length === 0 ? (
 <p className="dk-media-music-section__empty">No track listing synced yet.</p>
 ) : (
 <div className="dk-media-music-section__table-wrapper">
 <table className="dk-media-music-section__table">
 <thead>
 <tr className="dk-media-music-section__thead-row">
 <th className="dk-media-music-section__th dk-media-music-section__th--number">#</th>
 <th className="dk-media-music-section__th dk-media-music-section__th--title">Title</th>
 <th className="dk-media-music-section__th dk-media-music-section__th--time">Time</th>
 <th className="dk-media-music-section__th dk-media-music-section__th--rate">Rate</th>
 <th className="dk-media-music-section__th dk-media-music-section__th--play">Play</th>
 </tr>
 </thead>
 <tbody>
 {(() => {
 // Build a lookup from (disc, track) to PlexAlbumTrack
 const plexByTrack = new Map<string, PlexAlbumTrack>()
 if (plexTracks) {
 for (const pt of plexTracks) {
 plexByTrack.set(`${pt.discNumber}:${pt.trackNumber}`, pt)
 }
 }

 return allTracks.map((t, i) => {
 const subsequentUris = allTracks
 .slice(i)
 .filter((tr) => tr.spotifyId)
 .map((tr) => `spotify:track:${tr.spotifyId}` as string)

 const plexMatch = plexByTrack.get(`${t.discNumber}:${t.trackNumber}`)
 const plexRatingKey = plexMatch?.ratingKey
 const isPlexPlaying = !!plexRatingKey && currentTrack?.id === plexRatingKey && source === 'plex'

 return (
 <TrackRow
 key={t.id}
 track={t}
 showDisc={multiDisc}
 isReady={spotifyIsReady}
 isPlaying={currentTrack?.id === t.spotifyId && source === 'spotify'}
 spotifyLiked={Boolean(t.spotifyId && likedSpotifyIds.has(t.spotifyId))}
 savingSpotify={savingSpotifyId === t.spotifyId}
 rating={ratingsByTrack[t.id] ?? {
 myRating: null,
 avgRating: t.avgRating ?? null,
 ratingCount: t.ratingCount ?? 0,
 }}
 ratingPending={ratingTrackId === t.id}
 onPlay={(uris) => playSpotifyQueue(uris.length > 1 ? uris : subsequentUris)}
 onToggle={togglePlay}
 onSaveSpotify={handleSaveSpotify}
 onRate={handleRateTrack}
 plexRatingKey={plexRatingKey}
 isPlexPlaying={isPlexPlaying}
 playbackPlatform={playbackPlatform}
 onPlexPlay={
 plexRatingKey
 ? () => {
 if (!plexReady) {
 console.warn("Plex connection info not available — try re-syncing Plex in Settings")
 return
 }
 const allPlexInfos: PlexTrackInfo[] = allTracks
 .map((tt) => {
 const pm = plexByTrack.get(`${tt.discNumber}:${tt.trackNumber}`)
 if (!pm) return null
 return plexTrackInfo(pm.ratingKey, tt.title, pm.artist || artistName || "", tt.durationMs || 0)
 })
 .filter(Boolean) as PlexTrackInfo[]

 if (allPlexInfos.length > 0) {
 const startIdx = allPlexInfos.findIndex(p => p.ratingKey === plexRatingKey)
 playPlexAlbum(allPlexInfos, startIdx >= 0 ? startIdx : 0)
 } else {
 playPlexTrack(plexTrackInfo(plexRatingKey, t.title, artistName || "", t.durationMs || 0))
 }
 }
 : undefined
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
 <p className="dk-media-music-section__footnote">
 Spotify ID: <span className="dk-media-music-section__footnote-code">{album.spotifyId}</span>
 {album.musicbrainzId && (
 <>
 {' · '}
 MB Release: <span className="dk-media-music-section__footnote-code">{album.musicbrainzId}</span>
 </>
 )}
 </p>
 )}
 </section>
 )
}
