// TODO: Review this file
import { useState, useRef, useMemo, useEffect } from "react"
import { useInView, motion, AnimatePresence } from "framer-motion"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { HeartIcon, ListPlus, RefreshCw, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import {
 useLibraryTab,
 useSpotifyLibraryScan,
 useSpotifyStatus,
 useSpotifyLikedTracks,
 useSaveSpotifyTrack,
 type SpotifyTrack,
} from "../library-queries"
import { usePlayer } from '@/features/spotify/use-player'
import { TrackInlineActions } from "@/features/media/molecules/media-track-inline-actions"
import { useRateTrack } from "@/features/media/media-queries"
import { useToast } from "@/features/dk-ui/molecules/toast"
import { SpotifyIcon } from "@/features/dk-ui/atoms/spotify-icon"
import { registerPlatform } from "./index"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"
import "./spotify.scss"

function SkeletonGrid() {
 return (
 <MediaGrid>
 {Array.from({ length: 12 }).map((_, i) => (
 <div
 key={i}
 className="dk-library-spotify__skeleton"
 />
 ))}
 </MediaGrid>
 )
}

function formatMs(ms: number | null | undefined): string {
 if (ms == null || ms <= 0) return '—'
 const totalSec = Math.round(ms / 1000)
 const m = Math.floor(totalSec / 60)
 const s = totalSec % 60
 return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Empty state ──

function SpotifyEmptyState({ onScan, isScanning, scanResult, scanError }: PlatformEmptyStateProps) {
 return (
 <div className="dk-library-spotify__center-col">
 <div className="dk-library-spotify__empty-icon">
 <SpotifyIcon className="dk-library-spotify__icon--xl" />
 </div>
 <p className="dk-library-spotify__empty-title">Spotify library empty</p>
 <p className="dk-library-spotify__empty-desc">
 Sync your Spotify library to see your liked tracks and saved albums here.
 </p>
 <button
 onClick={onScan}
 disabled={isScanning}
 className={cn(
 "dk-library-spotify__btn-primary",
 isScanning && "dk-library-spotify__btn-primary--disabled",
 )}
 >
 <RefreshCw className={cn("dk-library-spotify__icon", isScanning && "dk-library-spotify__icon--spinning")} />
 {isScanning ? "Syncing..." : "Sync Library"}
 </button>
 {scanResult && (
 <p className="dk-library-spotify__result-text">
 Sync started. Track progress in Settings → Integrations.
 </p>
 )}
 {scanError && (
 <p className="dk-library-spotify__error-text">
 Sync failed. Please try again.
 </p>
 )}
 </div>
 )
}

// ── Track List ──

function SpotifyTrackList({ tracks }: { tracks: SpotifyTrack[] }) {
 const navigate = useNavigate()
 const { playSpotifyQueue, setSpotifyQueueMetadata, currentTrack, isPlaying, spotifyIsReady, togglePlay, addToQueue } = usePlayer()
 const saveSpotifyTrack = useSaveSpotifyTrack()
 const rateTrack = useRateTrack()
 const { toast } = useToast()
 const [likedSpotifyIds, setLikedSpotifyIds] = useState<Set<string>>(new Set())
 const [savingSpotifyId, setSavingSpotifyId] = useState<string | null>(null)
 const [ratingTrackId, setRatingTrackId] = useState<string | null>(null)
 const [queueSpotifyId, setQueueSpotifyId] = useState<string | null>(null)
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

 const handleAddToQueue = async (track: SpotifyTrack) => {
 if (!track.uri) return
 setQueueSpotifyId(track.id)
 try {
 await addToQueue(track.uri)
 toast({ title: `"${track.name}" added to queue`, variant: 'success' })
 } catch {
 toast({ title: 'Could not add to queue', variant: 'error' })
 } finally {
 setQueueSpotifyId(null)
 }
 }

 if (tracks.length === 0) {
 return <p className="dk-library-spotify__empty-text">No tracks found.</p>
 }

 return (
 <div className="dk-library-spotify__track-list">
 {tracks.map((t, i) => {
 const isCurrent = currentTrack?.id === t.id
 const subsequentUris = tracks
 .slice(i)
 .filter((tr) => tr.uri)
 .map((tr) => tr.uri as string)
 const subsequentMeta = subsequentUris.map((uri, j) => {
 const src = tracks[i + j]
 return {
 uri,
 id: src.id,
 name: src.name,
 artist: src.artist,
 albumArt: src.albumArt,
 }
 })
 return (
 <div
 key={`${t.id}-${i}`}
 role="button"
 tabIndex={0}
 onClick={() => {
 if (t.uri && spotifyIsReady) {
 if (isCurrent) {
 togglePlay()
 } else {
 setSpotifyQueueMetadata(subsequentMeta)
 playSpotifyQueue(subsequentUris)
 }
 }
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault()
 if (t.uri && spotifyIsReady) {
 if (isCurrent) {
 togglePlay()
 } else {
 setSpotifyQueueMetadata(subsequentMeta)
 playSpotifyQueue(subsequentUris)
 }
 }
 }
 }}
 className={cn(
 "dk-library-spotify__track-row",
 isCurrent && "dk-library-spotify__track-row--current",
 )}
 >
 <span className="dk-library-spotify__track-num">
 {i + 1}
 </span>
 {t.albumArt ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 if (t.otixAlbumId) navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'music', mediaId: t.otixAlbumId } })
 }}
 className={cn("dk-library-spotify__album-art-btn", t.otixAlbumId && "dk-library-spotify__album-art-btn--clickable")}
 title={t.otixAlbumId ? `View album: ${t.albumName}` : t.albumName}
 >
 <img src={t.albumArt} alt={t.albumName || ''} className="dk-library-spotify__album-art-img" />
 </button>
 ) : (
 <div className="dk-library-spotify__album-art-placeholder" />
 )}
 <div className="dk-library-spotify__track-info">
 <p className="dk-library-spotify__track-name">{t.name}</p>
 {t.otixArtistId ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 navigate({ to: '/person/$personId', params: { personId: t.otixArtistId! } })
 }}
 className="dk-library-spotify__track-artist-btn"
 >
 {t.artist}
 </button>
 ) : (
 <p className="dk-library-spotify__track-artist">{t.artist}</p>
 )}
 </div>
 <TrackInlineActions
 trackId={t.otixTrackId}
 spotifyId={t.id}
 spotifyLiked={Boolean(t.spotifyLiked || likedSpotifyIds.has(t.id))}
 savingSpotify={savingSpotifyId === t.id}
 myRating={t.otixTrackId ? ratingsByTrack[t.otixTrackId]?.myRating ?? null : null}
 ratingPending={ratingTrackId === t.otixTrackId}
 onSaveSpotify={handleSaveSpotify}
 onRate={handleRateTrack}
 className="dk-library-spotify__track-actions"
 />
 {t.uri && (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 handleAddToQueue(t)
 }}
 disabled={queueSpotifyId === t.id}
 className={cn(
 "dk-library-spotify__queue-btn",
 queueSpotifyId === t.id && "dk-library-spotify__queue-btn--pulse",
 )}
 title="Add to queue"
 aria-label="Add to queue"
 >
 <ListPlus className="dk-library-spotify__play-icon" />
 </button>
 )}
 <span className="dk-library-spotify__track-duration">
 {formatMs(t.durationMs)}
 </span>
 {t.uri && (
 <div
 className={cn(
 "dk-library-spotify__play-indicator",
 isCurrent && "dk-library-spotify__play-indicator--active",
 )}
 >
 {isCurrent && isPlaying ? (
 <svg className="dk-library-spotify__play-icon" viewBox="0 0 24 24" fill="currentColor">
 <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
 </svg>
 ) : (
 <svg className="dk-library-spotify__play-icon" viewBox="0 0 24 24" fill="currentColor">
 <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
 </svg>
 )}
 </div>
 )}
 </div>
 )
 })}
 </div>
 )
}

// ── View types ──

type SpotifyView = { type: 'overview' } | { type: 'liked' }

type LibrarySearchParams = { view?: string }

function parseSpotifyView(search: LibrarySearchParams): SpotifyView {
 if (search.view === 'liked') return { type: 'liked' }
 return { type: 'overview' }
}

function spotifySearchForView(view: SpotifyView) {
 if (view.type === 'liked') return { view: 'liked' }
 return {}
}

// ── Main content ──

export function SpotifyTabContent() {
 const likedLoadMoreRef = useRef<HTMLDivElement>(null)
 const likedInView = useInView(likedLoadMoreRef, { margin: '0px 0px 800px 0px' })
 const navigate = useNavigate()
 const search = useSearch({ strict: false }) as LibrarySearchParams
 const view = parseSpotifyView(search)
 const setSpotifyView = (nextView: SpotifyView) => {
 navigate({
 to: '/library/spotify',
 search: spotifySearchForView(nextView) as never,
 })
 }

 const albumsQuery = useLibraryTab('spotify')
 const likedTracksQuery = useSpotifyLikedTracks()
 const spotifyStatusQuery = useSpotifyStatus()
 const spotifyScan = useSpotifyLibraryScan()

 const likedTracks = useMemo(
 () => likedTracksQuery.data?.pages.flatMap((p) => p.tracks) ?? [],
 [likedTracksQuery.data],
 )
 const likedTotal = likedTracksQuery.data?.pages[0]?.total ?? 0

 // Auto-scan
 useEffect(() => {
 const status = spotifyStatusQuery.data
 if (status && status.trackCount === 0 && !spotifyScan.isPending && !spotifyScan.data) {
 spotifyScan.mutate()
 }
 }, [spotifyStatusQuery.data, spotifyScan.isPending, spotifyScan.data, spotifyScan.mutate])

 // Infinite scroll for liked tracks
 useEffect(() => {
 if (likedInView && likedTracksQuery.hasNextPage && !likedTracksQuery.isFetchingNextPage && !likedTracksQuery.isLoading) {
 likedTracksQuery.fetchNextPage()
 }
 }, [likedInView, likedTracksQuery.hasNextPage, likedTracksQuery.isFetchingNextPage, likedTracksQuery.isLoading, likedTracksQuery.fetchNextPage])

 // Overview view
 if (view.type === 'overview') {
 const albums = albumsQuery.data?.pages.flatMap((p) => p.items) ?? []

 return (
 <div className="dk-library-spotify__overview">
 <div className="dk-library-spotify__section">
 <div className="dk-library-spotify__section-header">
 <h2 className="dk-library-spotify__section-title">
 Liked Songs
 </h2>
 {spotifyStatusQuery.data && spotifyStatusQuery.data.trackCount > 0 && (
 <button
 onClick={() => spotifyScan.mutate()}
 disabled={spotifyScan.isPending}
 className="dk-library-spotify__btn-ghost"
 >
 <RefreshCw className={cn("dk-library-spotify__icon--sm", spotifyScan.isPending && "dk-library-spotify__icon--spinning")} />
 Rescan
 </button>
 )}
 </div>

 <button
 type="button"
 onClick={() => setSpotifyView({ type: 'liked' })}
 className="dk-library-spotify__liked-card"
 >
 <div className="dk-library-spotify__liked-card-bg">
 <HeartIcon className="dk-library-spotify__liked-card-icon" />
 </div>
 <div className="dk-library-spotify__liked-card-info">
 <p className="dk-library-spotify__liked-card-title">Liked Songs</p>
 <p className="dk-library-spotify__liked-card-subtitle">{likedTotal} tracks</p>
 </div>
 </button>
 </div>

 <div className="dk-library-spotify__section">
 <h2 className="dk-library-spotify__section-title">
 Albums
 </h2>
 {albumsQuery.isLoading ? (
 <SkeletonGrid />
 ) : albumsQuery.isError ? (
 <p className="dk-library-spotify__muted-text">Failed to load albums.</p>
 ) : albums.length === 0 ? (
 <SpotifyEmptyState onScan={() => spotifyScan.mutate()} isScanning={spotifyScan.isPending} />
 ) : (
 <MediaGrid>
 {albums.map((item) => (
 <MediaCard
 key={item.id}
 id={item.id}
 mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
 title={item.title}
 posterUrl={item.posterUrl}
 textlessPosterUrl={item.textlessPosterUrl}
 logoUrl={item.logoUrl}
 releaseDate={item.releaseDate}
 isAdult={item.isAdult}
 artistName={item.albumArtistName}
 />
 ))}
 </MediaGrid>
 )}
 </div>
 </div>
 )
 }

 // Liked tracks detail view
 return (
 <div className="dk-library-spotify__liked-detail">
 <div className="dk-library-spotify__liked-header">
 <button
 type="button"
 onClick={() => setSpotifyView({ type: 'overview' })}
 className="dk-library-spotify__btn-text"
 >
 <svg className="dk-library-spotify__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
 <path d="M15 18l-6-6 6-6" />
 </svg>
 Back
 </button>
 <div className="dk-library-spotify__liked-header-icon">
 <HeartIcon className="dk-library-spotify__liked-header-heart" />
 </div>
 <h2 className="dk-library-spotify__liked-header-title">Liked Songs</h2>
 </div>

 {likedTracksQuery.isLoading ? (
 <div className="dk-library-spotify__skeleton-list">
 {Array.from({ length: 8 }).map((_, i) => (
 <div key={i} className="dk-library-spotify__skeleton-row" />
 ))}
 </div>
 ) : likedTracksQuery.isError ? (
 <p className="dk-library-spotify__detail-error">Failed to load liked tracks.</p>
 ) : (
 <>
 <SpotifyTrackList tracks={likedTracks} />
 <div ref={likedLoadMoreRef} className="dk-library-spotify__more-wrap">
 {likedTracksQuery.isFetchingNextPage && (
 <div className="dk-library-spotify__spinner--sm" />
 )}
 {likedTracksQuery.hasNextPage && !likedTracksQuery.isFetchingNextPage && (
 <button
 type="button"
 onClick={() => likedTracksQuery.fetchNextPage()}
 className="dk-library-spotify__load-more-btn"
 >
 Load more
 </button>
 )}
 {!likedTracksQuery.hasNextPage && likedTracks.length > 0 && (
 <p className="dk-library-spotify__end-text">End of list</p>
 )}
 </div>
 </>
 )}
 </div>
 )
}

// ── Dashboard section ──

function SpotifyOverviewModule({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void } = {}) {
 const navigate = useNavigate()
 const { data, isLoading } = useLibraryTab("spotify")
 const { data: status } = useSpotifyStatus()
 const likedTracksQuery = useSpotifyLikedTracks()
 const likedTotal = likedTracksQuery.data?.pages[0]?.total ?? 0

 const allItems = useMemo(
  () => data?.pages.flatMap((page) => page.items) ?? [],
  [data]
 )
 const albumCount = data?.pages[0]?.items.length ?? 0

 if (isLoading || allItems.length === 0) return null

 return (
 <div className="dk-library-spotify__section">
  {/* Hero area - clickable to toggle */}
  <div className="dk-library-spotify__hero" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(); } }}>
   <div className="dk-library-spotify__hero-bg" />
   <div className="dk-library-spotify__hero-content">
    <div className="dk-library-spotify__hero-top">
     <div className="flex items-center gap-2">
      <SpotifyIcon className="dk-library-spotify__hero-brand-icon" />
      <span className="dk-library-spotify__hero-brand-label">Spotify</span>
     </div>
     <div className="flex items-center gap-2">
      <button
       onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/spotify" }); }}
       className="dk-library-spotify__hero-link"
      >
       View all
      </button>
      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.5)" }} />
     </div>
    </div>
    <h2 className="dk-library-spotify__hero-title">Music Library</h2>
    <p className="dk-library-spotify__hero-stats">
     <span className="dk-library-spotify__hero-stat">{likedTotal} liked tracks</span>
     <span className="dk-library-spotify__hero-dot">&middot;</span>
     <span className="dk-library-spotify__hero-stat">{albumCount} albums</span>
     <span className="dk-library-spotify__hero-dot">&middot;</span>
     <span className="dk-library-spotify__hero-stat">{status?.trackCount?.toLocaleString() ?? '-'} total tracks</span>
    </p>
   </div>
  </div>

  <AnimatePresence initial={false}>
  {expanded && (
  <motion.div
   initial={{ height: 0, opacity: 0 }}
   animate={{ height: "auto", opacity: 1 }}
   exit={{ height: 0, opacity: 0 }}
   transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
   className="overflow-hidden"
   style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
  >
  {/* Quick links row */}
  <div className="dk-library-spotify__quick-links">
   <button
    type="button"
    onClick={() => navigate({ to: "/library/spotify", search: { view: "liked" } })}
    className="dk-library-spotify__quick-link dk-library-spotify__quick-link--liked"
   >
    <HeartIcon className="dk-library-spotify__quick-link-icon" />
    <div className="dk-library-spotify__quick-link-text">
     <span className="dk-library-spotify__quick-link-title">Liked Songs</span>
     <span className="dk-library-spotify__quick-link-sub">{likedTotal} tracks</span>
    </div>
   </button>
   <button
    type="button"
    onClick={() => navigate({ to: "/library/spotify" })}
    className="dk-library-spotify__quick-link dk-library-spotify__quick-link--library"
   >
    <SpotifyIcon className="dk-library-spotify__quick-link-icon" />
    <div className="dk-library-spotify__quick-link-text">
     <span className="dk-library-spotify__quick-link-title">Your Library</span>
     <span className="dk-library-spotify__quick-link-sub">{albumCount} albums</span>
    </div>
   </button>
  </div>
  </motion.div>
  )}
  </AnimatePresence>
 </div>
 )
}
// ── Register ──

export const spotifyPlatform: PlatformDefinition = {
 id: "spotify",
 label: "Spotify",
 icon: <SpotifyIcon className="dk-library-spotify__icon" />,
 requiresConnection: (user) => !!user?.spotifyId,
 EmptyState: (props) => <SpotifyEmptyState {...props} />,
 OverviewModule: SpotifyOverviewModule,
 Content: SpotifyTabContent,
}

registerPlatform(spotifyPlatform)
