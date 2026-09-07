import { useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'

/**
 * Fetch for the dedicated New Seasons rail, whose items are a show's latest
 * Season (SeasonSummary) rather than the show MediaItemSummary. Mounts only
 * once the rail scrolls into view, mirroring useSectionFetch.
 */
export function useSeasonSectionFetch() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '0px 0px 200px 0px' })

  const query = useInfiniteQuery({
    ...discoverQueries.trendingSeasons(),
    enabled: isInView,
  })

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap((p) => (Array.isArray(p?.items) ? p.items : []))
  }, [query.data])

  const showSkeleton = !isInView || query.isLoading
  const isEmpty = isInView && !query.isLoading && items.length === 0

  return { ref, items, showSkeleton, isEmpty, isInView, ...query }
}
