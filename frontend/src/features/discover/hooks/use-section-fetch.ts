import { useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import type { PersonalizedSection } from '../types'

export function useSectionFetch(section: PersonalizedSection) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '0px 0px 200px 0px' })

  const query = useInfiniteQuery({
    ...discoverQueries.list(section.mediaType ?? 'movie', section.listType, section.genre ?? undefined, section.language ?? undefined, section.isAnime ?? undefined),
    enabled: isInView,
  })

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    // Guard against a page payload lacking an array `items` (e.g. a DRF
    // `results` envelope) which would otherwise inject an [undefined] item.
    return pages.flatMap((p) => (Array.isArray(p?.items) ? p.items : []))
  }, [query.data])

  const showSkeleton = !isInView || query.isLoading
  const isEmpty = isInView && !query.isLoading && items.length === 0

  return { ref, items, showSkeleton, isEmpty, isInView, ...query }
}
