import { useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { discoverQueries } from '../queries/discover-queries'
import type { GenreOption } from '@/features/genre/types'

const PREFETCH_MARGIN = '0px 0px 200px 0px'

const TALK_SHOW_GENRE_SLUGS = new Set(['talk', 'talk-show', 'talk-shows'])

/**
 * Click-propensity ranking for entertainment and gaming categories on discovery surfaces.
 * Lower number = higher engagement / click propensity.
 */
const POPULAR_GENRE_PRIORITY: Record<string, number> = {
  action: 1,
  'action-adventure': 2,
  'science-fiction': 3,
  'sci-fi': 3,
  'sci-fi-fantasy': 4,
  comedy: 5,
  thriller: 6,
  horror: 7,
  drama: 8,
  adventure: 9,
  animation: 10,
  crime: 11,
  fantasy: 12,
  romance: 13,
  mystery: 14,
  'role-playing-rpg': 15,
  rpg: 15,
  shooter: 16,
  family: 17,
  documentary: 18,
  kids: 19,
  sports: 20,
  music: 21,
  history: 22,
  war: 23,
  western: 24,
}

export function sortGenresByClickPropensity(genres: GenreOption[]): GenreOption[] {
  return [...genres].sort((a, b) => {
    const slugA = (a.slug || a.name || '').toLowerCase().replace(/&+/g, 'and').replace(/[^a-z0-9]+/g, '-')
    const slugB = (b.slug || b.name || '').toLowerCase().replace(/&+/g, 'and').replace(/[^a-z0-9]+/g, '-')
    const prioA = POPULAR_GENRE_PRIORITY[slugA] ?? 99
    const prioB = POPULAR_GENRE_PRIORITY[slugB] ?? 99
    if (prioA !== prioB) return prioA - prioB
    return (a.name || '').localeCompare(b.name || '')
  })
}

/**
 * Standard fetch hook for the Discover genres rail.
 * Follows the rail framework of useSectionFetch and useSeasonSectionFetch:
 * uses viewport intersection (PREFETCH_MARGIN) to defer loading unless `eager` is set,
 * deduplicates genres by slug, ranks by user click propensity, and limits the carousel
 * to the top 10 most likely to click by default.
 */
export function useGenreSectionFetch(
  mediaType?: string,
  eager = false,
  limit = 10,
) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: PREFETCH_MARGIN })
  const enabled = eager || isInView

  const query = useQuery({
    ...discoverQueries.genres(mediaType),
    enabled,
  })

  const rawGenres = query.data ?? []

  // Deduplicate genres by slug, order by click propensity, and keep top N (default 10)
  const items = useMemo<GenreOption[]>(() => {
    if (!Array.isArray(rawGenres) || rawGenres.length === 0) return []
    const seen = new Set<string>()
    const unique = rawGenres.filter((g) => {
      const slug = g.slug?.toLowerCase()
      if (!slug || seen.has(slug) || TALK_SHOW_GENRE_SLUGS.has(slug)) return false
      seen.add(slug)
      return true
    })
    const sorted = sortGenresByClickPropensity(unique)
    return limit > 0 ? sorted.slice(0, limit) : sorted
  }, [rawGenres, limit])

  const showSkeleton = !enabled || query.isLoading
  const isEmpty = enabled && query.isSuccess && items.length === 0

  return { ref, items, showSkeleton, isEmpty, isInView, ...query }
}
