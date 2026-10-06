// TODO: Review this file
import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ExternalLink, RefreshCw, Play, Music, Link2 } from "lucide-react"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { registerPlatform } from "./index"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"
import { useYoutubeLibrary, type YoutubeLikedVideo } from "../library-queries"

// ── Skeleton ──

const SkeletonGrid = () => {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white/5 animate-pulse"
          style={{ aspectRatio: "2/3" }}
        />
      ))}
    </MediaGrid>
  )
};

// ── Empty state ──

const YoutubeEmptyState = ({ onScan }: PlatformEmptyStateProps) => {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
        <Play className="h-8 w-8 text-red-500" />
      </div>
      <p className="text-lg font-medium text-white/80">No synced YouTube videos</p>
      <p className="text-sm text-white/40 text-center max-w-md">
        Sync your YouTube liked videos in Settings &rarr; Integrations to see them here.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onScan}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30"
        >
          <RefreshCw className="h-4 w-4" />
          Sync Liked Videos
        </button>
        <button
          onClick={() => navigate({ to: "/settings" })}
          className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/10"
        >
          Open Settings
        </button>
      </div>
    </div>
  )
};

// ── Video card ──

const YoutubeVideoCard = ({ video }: { video: YoutubeLikedVideo }) => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`
  const isMatched = !!video.matchedMediaItemId

  if (isMatched) {
    return (
      <div className="group">
        <MediaCard
          id={video.matchedMediaItemId!}
          mediaType="music"
          title={video.matchedTitle ?? video.title}
          posterUrl={video.thumbnailUrl}
          textlessPosterUrl={null}
          logoUrl={null}
          releaseDate={null}
          isAdult={false}
        />
        <div className="flex items-center gap-1.5 mt-1.5">
          <Music className="h-3 w-3 text-red-400/60 shrink-0" />
          <p className="text-xs text-white/50 truncate">{video.matchedArtist ?? video.channelTitle}</p>
        </div>
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          YouTube
        </a>
      </div>
    )
  }

  // Unmatched — show raw YouTube data
  return (
    <div className="group rounded-xl overflow-hidden bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all">
      <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="block">
        <div className="aspect-video bg-black/40 relative overflow-hidden">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="h-8 w-8 text-white/10" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="h-5 w-5 text-white ml-0.5" />
            </div>
          </div>
        </div>
      </a>
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-medium text-white/80 line-clamp-2 leading-tight">
          {video.title}
        </p>
        <p className="text-[10px] text-white/40 truncate">
          {video.channelTitle}
        </p>
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Watch on YouTube
        </a>
      </div>
    </div>
  )
};

// ── YouTube Content Tab ──

export const YoutubeTabContent = () => {
  const navigate = useNavigate()
  const query = useYoutubeLibrary()
  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  if (query.isLoading) return <SkeletonGrid />

  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-red-400">Failed to load synced videos.</p>
        <button onClick={() => query.refetch()} className="text-sm text-white/50 hover:text-white">
          Retry
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return <YoutubeEmptyState onScan={() => navigate({ to: "/settings" })} isScanning={false} />
  }

  const matched = items.filter(i => i.matchedMediaItemId)
  const unmatched = items.filter(i => !i.matchedMediaItemId)

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Play className="h-5 w-5 text-red-500" />
        <h2 className="text-lg font-semibold text-white">Synced YouTube Videos</h2>
        <span className="text-sm text-white/30">
          {items.length} total &middot; {matched.length} matched
        </span>
      </div>

      {matched.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-white/60">
            <Link2 className="h-3.5 w-3.5 text-green-400/60" />
            Matched to Catalog ({matched.length})
          </h3>
          <MediaGrid>
            {matched.map((item) => (
              <YoutubeVideoCard key={`matched-${item.videoId}`} video={item} />
            ))}
          </MediaGrid>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-white/60">
            <Music className="h-3.5 w-3.5 text-red-400/60" />
            Unmatched Music Videos ({unmatched.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {unmatched.map((item) => (
              <YoutubeVideoCard key={`raw-${item.videoId}`} video={item} />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center py-4">
        {query.isFetchingNextPage && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
        )}
        {query.hasNextPage && !query.isFetchingNextPage && (
          <button onClick={() => query.fetchNextPage()} className="text-sm text-white/40 hover:text-white transition-colors">
            Load more
          </button>
        )}
        {!query.hasNextPage && items.length > 0 && (
          <p className="text-xs text-white/20">All synced videos loaded</p>
        )}
      </div>
    </div>
  )
};

// ── Dashboard section ──

const YoutubeOverviewModule = () => {
  const query = useYoutubeLibrary()
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const matched = items.filter(i => i.matchedMediaItemId).length

  if (items.length === 0) return null

  return (
    <div className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/5">
      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors text-left">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 shrink-0">
          <Play className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">YouTube</p>
          <p className="text-xs text-white/30">{items.length} videos &middot; {matched} matched</p>
        </div>
      </button>
    </div>
  )
};

// ── Register ──

const YoutubeIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
)

export const youtubePlatform: PlatformDefinition = {
  id: "youtube",
  label: "YouTube",
  icon: <YoutubeIcon />,
  requiresConnection: (user) => !!user?.googleId,
  EmptyState: (props) => <YoutubeEmptyState {...props} />,
  OverviewModule: YoutubeOverviewModule,
  Content: YoutubeTabContent,
}

registerPlatform(youtubePlatform)
