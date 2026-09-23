import { useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import type { SeasonSummary } from '@media/queries/media-queries'

const PREFETCH_MARGIN = '0px 0px 200px 0px'

/**
 * Fetch for the dedicated New Seasons rail, whose items are a show's latest
 * Season (SeasonSummary) rather than the show MediaItemSummary.
 */
export function useSeasonSectionFetch(eager = false) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: PREFETCH_MARGIN })
  const enabled = eager || isInView

  const query = useInfiniteQuery({
    ...discoverQueries.trendingSeasons(),
    enabled,
  })

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap((p) => {
      const pageItems = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(pageItems) ? (pageItems as SeasonSummary[]) : []
    })
  }, [query.data])

  const showSkeleton = !enabled || query.isLoading
  const isEmpty = enabled && query.isSuccess && items.length === 0

  return { ref, items, showSkeleton, isEmpty, isInView, ...query }
}
