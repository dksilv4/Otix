import { useMemo, useRef, useEffect } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { discoverQueries } from '../queries/discover-queries'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { DiscoverMediaCard } from '../components/molecules/discover-media-card'
import { DiscoverSeasonCard } from '../components/molecules/discover-season-card'
import type { MediaItemSummary, SeasonSummary } from '@media/queries/media-queries'

import { getRailTitle } from '../utils/rail'

export const DiscoverRailPage = () => {
  const params = useParams({ strict: false }) as { mediaType?: string; listType?: string }
  const search = useSearch({ strict: false }) as {
    platform?: string
    genre?: string
    language?: string
    is_anime?: boolean
  }

  const mediaType = params.mediaType ?? 'movie'
  const listType = params.listType ?? 'trending'
  const platform = search?.platform
  const genre = search?.genre
  const language = search?.language
  const isAnime = search?.is_anime

  const title = getRailTitle(mediaType, listType, platform)
  const isSeasonTrending = mediaType === 'season' && listType === 'trending'

  const query = useInfiniteQuery((isSeasonTrending ? discoverQueries.trendingSeasons() : discoverQueries.list(mediaType, listType, genre, language, isAnime, platform)) as any)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = query

  const items = useMemo(() => {
    const pages = data?.pages ?? []
    return pages.flatMap((p) => {
      const pageItems = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(pageItems) ? pageItems : []
    })
  }, [data])

  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '600px 0px 600px 0px' })

  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Helmet>
        <title>{title} — Otix</title>
      </Helmet>

      <div className="flex flex-col gap-4">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full"
            style={{ background: 'var(--dk-surface-ghost-hover)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Discover
          </Link>
        </div>

        <div className="flex items-baseline justify-between border-b border-[var(--dk-separator)] pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Explore the complete continuous feed of {title.toLowerCase()}
            </p>
          </div>
          {items.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {items.length} titles loaded
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <MediaGrid>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </MediaGrid>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-semibold text-muted-foreground">Failed to load feed</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Please try again in a few moments.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-semibold text-muted-foreground">No titles found</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            This collection doesn't have any titles available yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <MediaGrid>
            {isSeasonTrending
              ? (items as SeasonSummary[]).map((season) => (
                  <DiscoverSeasonCard
                    key={`${season.showId}-${season.seasonNumber}`}
                    season={season}
                  />
                ))
              : (items as MediaItemSummary[]).map((item) => (
                  <DiscoverMediaCard key={item.id} item={item} />
                ))}
          </MediaGrid>

          <div ref={sentinelRef} className="h-12 flex items-center justify-center">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Loading more titles...</span>
              </div>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="px-4 py-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                style={{ background: 'var(--dk-surface-ghost-hover)' }}
              >
                Load More
              </button>
            ) : (
              <p className="text-xs text-muted-foreground/50 py-4">
                You've reached the end of the list
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
};
