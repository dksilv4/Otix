import { memo, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from '@heroicons/react/24/solid'
import { discoverQueries } from '@discover/discover-queries'
import { MediaCarousel } from '@discover/molecules/media-carousel'
import { cn } from '@/lib/utils'

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
    <section ref={ref} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2
            className={cn(
              'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold',
              'bg-[var(--dk-surface-glass)] backdrop-blur-md',
              'shadow-[var(--dk-shadow-glass)]',
              'text-foreground',
            )}
          >
            {title}
            {total != null && (
              <span className="text-xs font-normal text-muted-foreground">
                {total.toLocaleString()}
              </span>
            )}
          </h2>
          {reason && (
            <span className="text-xs text-muted-foreground">{reason}</span>
          )}
        </div>
        {mediaType && (
          <Link
            to="/browse/$type"
            params={{ type: mediaType }}
            search={search}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              'text-muted-foreground hover:text-foreground',
              'bg-[var(--dk-surface-ghost-hover)] hover:bg-[var(--dk-surface-ghost-active)]',
              'transition-colors duration-[var(--dk-duration-fast)]',
            )}
          >
            View all
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        )}
      </div>

      <MediaCarousel items={items} isLoading={showSkeleton} />
    </section>
  )
})
