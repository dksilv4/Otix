import { useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import type { PersonalizedSection } from '../types'
import type { MediaItemSummary } from '@media/queries/media-queries'

const PREFETCH_MARGIN = '0px 0px 200px 0px'

export function useSectionFetch(section: PersonalizedSection, eager = false) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: PREFETCH_MARGIN })
  const enabled = eager || isInView

  const query = useInfiniteQuery({
    ...discoverQueries.list(section.mediaType ?? 'movie', section.listType, section.genre ?? undefined, section.language ?? undefined, section.isAnime ?? undefined, section.platform ?? undefined),
    enabled,
  })

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap((p) => {
      const pageItems = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(pageItems) ? (pageItems as MediaItemSummary[]) : []
    })
  }, [query.data])

  const showSkeleton = !enabled || query.isLoading
  const isEmpty = enabled && !query.isLoading && items.length === 0

  return { ref, items, showSkeleton, isEmpty, isInView, ...query }
}
