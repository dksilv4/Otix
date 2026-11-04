import type { MediaItemSummary } from '@media/queries/media-queries'

export type HeroTab = 'movie' | 'show' | 'game'

export interface HeroTabItem {
  id: HeroTab
  label: string
  ariaLabel?: string
}

export const HERO_TABS: readonly HeroTab[] = ['movie', 'show', 'game'] as const

export const HERO_TAB_ITEMS: readonly HeroTabItem[] = [
  { id: 'movie', label: 'Movies' },
  { id: 'show', label: 'Shows', ariaLabel: 'TV Shows' },
  { id: 'game', label: 'Games' },
] as const

export const getNextHeroTab = (currentTab: HeroTab): HeroTab => {
  const currentIndex = HERO_TABS.indexOf(currentTab)
  const nextIndex = (currentIndex + 1) % HERO_TABS.length
  return HERO_TABS[nextIndex] ?? 'movie'
}

/**
 * Filters items so only recent (within the last ~2 years or future upcoming releases)
 * and viral/trending media are shown in the Hero carousel, filtering out legacy catalog.
 */
export const filterRecentTrendingMedia = (
  items: MediaItemSummary[] | undefined | null,
  minYearDelta = 2,
): MediaItemSummary[] => {
  if (!items || !Array.isArray(items)) return []
  const currentYear = new Date().getFullYear()
  const cutoffYear = currentYear - minYearDelta

  return items.filter((item) => {
    if (!item.releaseDate) return true
    const year = parseInt(item.releaseDate.slice(0, 4), 10)
    if (isNaN(year)) return true
    return year >= cutoffYear
  })
}
