import { useState, useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { HeartIcon, RefreshCw } from "lucide-react"
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
import { useSpotifyPlayer } from "@/features/spotify/spotify-player-provider"
import { TrackInlineActions } from "@/features/media/molecules/track-inline-actions"
import { useRateTrack } from "@/features/media/media-queries"
import { useToast } from "@/features/dk-ui/molecules/toast"
import { SpotifyIcon } from "@/features/dk-ui/atoms/spotify-icon"
import { registerPlatform } from "./registry"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"

function SkeletonGrid() {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
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
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <SpotifyIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Spotify library empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Sync your Spotify library to see your liked tracks and saved albums here.
      </p>
      <button
        onClick={onScan}
        disabled={isScanning}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          isScanning && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
        {isScanning ? "Syncing..." : "Sync Library"}
      </button>
      {scanResult && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sync started. Track progress in Settings → Integrations.
        </p>
      )}
      {scanError && (
        <p className="mt-2 text-xs text-destructive">
          Sync failed. Please try again.
        </p>
      )}
    </div>
  )
}

// ── Track List ──

function SpotifyTrackList({ tracks }: { tracks: SpotifyTrack[] }) {
  const { playWithQueue, setQueueMetadata, currentTrack, isPlaying, togglePlay } = useSpotifyPlayer()
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

  if (tracks.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No tracks found.</p>
  }

  return (
    <div className="space-y-0.5">
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
              if (t.uri) {
                if (isCurrent) {
                  togglePlay()
                } else {
                  setQueueMetadata(subsequentMeta)
                  playWithQueue(subsequentUris)
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (t.uri) {
                  if (isCurrent) {
                    togglePlay()
                  } else {
                    setQueueMetadata(subsequentMeta)
                    playWithQueue(subsequentUris)
                  }
                }
              }
            }}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer',
              isCurrent ? 'bg-[#1DB954]/10' : 'hover:bg-white/[0.03]',
            )}
          >
            <span className="w-6 text-right text-xs tabular-nums text-muted-foreground/50 shrink-0">
              {i + 1}
            </span>
            {t.albumArt ? (
              <img src={t.albumArt} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded bg-white/[0.04] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{t.name}</p>
              <p className="text-xs text-muted-foreground truncate">{t.artist}</p>
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
              className="pointer-events-none hidden shrink-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 lg:flex"
            />
            <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
              {formatMs(t.durationMs)}
            </span>
            {t.uri && (
              <div
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded-full shrink-0 transition-colors',
                  isCurrent
                    ? 'bg-[#1DB954] text-black'
                    : 'bg-[#1DB954]/15 text-[#1DB954]',
                )}
              >
                {isCurrent && isPlaying ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
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

function SpotifyTabContent() {
  const likedLoadMoreRef = useRef<HTMLDivElement>(null)
  const likedInView = useInView(likedLoadMoreRef, { margin: '0px 0px 800px 0px' })
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as LibrarySearchParams
  const view = parseSpotifyView(search)
  const setSpotifyView = (nextView: SpotifyView) => {
    navigate({
      to: '/library/$tab',
      params: { tab: 'spotify' },
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
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Liked Songs
            </h2>
            {spotifyStatusQuery.data && spotifyStatusQuery.data.trackCount > 0 && (
              <button
                onClick={() => spotifyScan.mutate()}
                disabled={spotifyScan.isPending}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={cn('h-3 w-3', spotifyScan.isPending && 'animate-spin')} />
                Rescan
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSpotifyView({ type: 'liked' })}
            className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 overflow-hidden w-full max-w-[200px]"
          >
            <div className="aspect-square w-full bg-gradient-to-br from-[#1DB954]/30 via-[#1DB954]/10 to-transparent flex items-center justify-center">
              <HeartIcon className="h-12 w-12 text-[#1DB954] drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
            </div>
            <div className="p-3 text-left">
              <p className="text-sm font-semibold truncate">Liked Songs</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{likedTotal} tracks</p>
            </div>
          </button>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Albums
          </h2>
          {albumsQuery.isLoading ? (
            <SkeletonGrid />
          ) : albumsQuery.isError ? (
            <p className="text-muted-foreground">Failed to load albums.</p>
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setSpotifyView({ type: 'overview' })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#1DB954]/20 to-[#1DB954]/5">
            <HeartIcon className="h-5 w-5 text-[#1DB954]" />
          </div>
          <h2 className="text-lg font-bold">Liked Songs</h2>
        </div>
      </div>

      {likedTracksQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
          ))}
        </div>
      ) : likedTracksQuery.isError ? (
        <p className="text-destructive">Failed to load liked tracks.</p>
      ) : (
        <>
          <SpotifyTrackList tracks={likedTracks} />
          <div ref={likedLoadMoreRef} className="flex justify-center py-4">
            {likedTracksQuery.isFetchingNextPage && (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            {likedTracksQuery.hasNextPage && !likedTracksQuery.isFetchingNextPage && (
              <button
                type="button"
                onClick={() => likedTracksQuery.fetchNextPage()}
                className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground"
              >
                Load more
              </button>
            )}
            {!likedTracksQuery.hasNextPage && likedTracks.length > 0 && (
              <p className="text-xs text-muted-foreground">End of list</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Dashboard section ──

function SpotifyDashboardSection() {
  const navigate = useNavigate()
  const likedTracksQuery = useSpotifyLikedTracks()
  const likedTotal = likedTracksQuery.data?.pages[0]?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Spotify
        </h2>
        <button
          onClick={() => navigate({ to: "/library/$tab", params: { tab: "spotify" } })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>
      <button
        type="button"
        onClick={() => navigate({ to: "/library/$tab", params: { tab: "spotify" }, search: { view: "liked" } as never })}
        className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 overflow-hidden w-full max-w-[200px]"
      >
        <div className="aspect-square w-full bg-gradient-to-br from-[#1DB954]/30 via-[#1DB954]/10 to-transparent flex items-center justify-center">
          <HeartIcon className="h-10 w-10 text-[#1DB954] drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
        </div>
        <div className="p-3 text-left">
          <p className="text-sm font-semibold truncate">Liked Songs</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{likedTotal} tracks</p>
        </div>
      </button>
    </div>
  )
}

// ── Register ──

export const spotifyPlatform: PlatformDefinition = {
  id: "spotify",
  label: "Spotify",
  icon: <SpotifyIcon className="h-4 w-4" />,
  requiresConnection: (user) => !!user?.spotifyId,
  EmptyState: (props) => <SpotifyEmptyState {...props} />,
  DashboardSection: SpotifyDashboardSection,
  Content: SpotifyTabContent,
}

registerPlatform(spotifyPlatform)
