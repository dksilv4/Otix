import { memo, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from '@heroicons/react/24/solid'
import { discoverQueries } from '@discover/discover-queries'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/molecules/discover-media-card'
import type { MediaItemSummary } from '@media/media-queries'

const IN_VIEW_OPTIONS = { once: true, margin: '0px 0px 200px 0px' } as const

interface MediaSectionProps {
  title: string
  mediaType?: 'movie' | 'show' | 'game' | 'music'
  listType: string
  genre?: string | null
  language?: string | null
  isAnime?: boolean | null
  reason?: string | null
}

export const MediaSection = memo(function MediaSection({ title, mediaType, listType, genre, language, isAnime, reason }: MediaSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, IN_VIEW_OPTIONS)

  const { data, isLoading, isError } = useInfiniteQuery({
    ...discoverQueries.list(
      mediaType || 'movie',
      listType,
      genre ?? undefined,
      language ?? undefined,
      isAnime ?? undefined,
    ),
    enabled: isInView,
  })

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? undefined
  const isEmpty = !isLoading && !isError && items.length === 0 && isInView
  const showSkeleton = isLoading || (isInView && items.length === 0 && !isError)

  const search = useMemo(() =>
    genre || language || isAnime != null
      ? { genre: genre ?? undefined, language: language ?? undefined, isAnime: isAnime != null ? String(isAnime) : undefined }
      : undefined
  , [genre, language, isAnime])

  if (isEmpty) return null

  return (
    <div ref={ref} className="relative">
      <header className="absolute top-0 left-0 right-0 z-[2] px-8 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2
              className="inline-flex flex-col items-start px-4 py-1.5 rounded-full text-sm font-semibold text-foreground backdrop-blur-md"
              style={{
                background: 'var(--dk-surface-glass)',
                boxShadow: 'var(--dk-shadow-glass)',
              }}
            >
              {reason && (
                <span className="text-[11px] font-normal text-muted-foreground leading-none pb-0.5">{reason}</span>
              )}
              <span className="inline-flex items-center gap-2">
                {title}
                {total != null && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {total.toLocaleString()}
                  </span>
                )}
              </span>
            </h2>
          </div>
          {mediaType && (
            <Link
              to="/browse/$type"
              params={{ type: mediaType }}
              search={search}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-active)] transition-colors"
              style={{ background: 'var(--dk-surface-ghost-hover)' }}
            >
              View all
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          )}
        </div>
      </header>
      <Carousel
        className={reason ? 'pt-[76px]' : 'pt-14'}
        isLoading={showSkeleton}
        showArrows
      >
        {items.map((item: MediaItemSummary) => (
          <DiscoverMediaCard key={item.id} item={item} />
        ))}
      </Carousel>
    </div>
  )
})
