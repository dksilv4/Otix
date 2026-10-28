import type { MediaItemSummary } from '@media/queries/media-queries'

const TITLE_MAP: Record<string, string> = {
  'movie-trending': 'Trending Movies',
  'show-trending': 'Trending Shows',
  'season-trending': 'New Seasons',
  'movie-popular': 'Popular Movies',
  'show-popular': 'Popular Shows',
  'game-popular': 'Popular Games',
  'game-top_rated': 'Top Rated Games',
  'game-newly_released': 'New Releases',
  'game-now_playing': 'Now Playing Games',
  'game-upcoming': 'Upcoming Games',
  'movie-top_rated': 'Top Rated Movies',
  'show-top_rated': 'Top Rated Shows',
  'movie-upcoming': 'Upcoming Movies',
  'movie-now_playing': 'Now Playing Movies',
}

const PLATFORM_MAP: Record<string, string> = {
  windows: 'Best on PC',
  'playstation-5': 'Best on PlayStation 5',
  'xbox-series-x-s': 'Best on Xbox Series',
  'nintendo-switch': 'Best on Nintendo Switch',
}

export const getRailTitle = (mediaType: string, listType: string, platform?: string | null): string => {
  if (platform && PLATFORM_MAP[platform]) {
    return PLATFORM_MAP[platform]
  }
  const key = `${mediaType}-${listType}`
  if (TITLE_MAP[key]) {
    return TITLE_MAP[key]
  }
  const formatWord = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return `${formatWord(listType)} ${formatWord(mediaType)}s`
}

export const isMediaItemStreamable = (
  item: MediaItemSummary,
  streamableIds: Set<string>,
): boolean => {
  if (!item || !streamableIds.size) return false
  if (item.id && streamableIds.has(String(item.id))) return true
  if (item.slug && streamableIds.has(String(item.slug))) return true
  if (item.tmdbId && streamableIds.has(String(item.tmdbId))) return true
  return false
}

export const filterStreamableItems = (
  items: MediaItemSummary[],
  streamableIds: Set<string>,
): MediaItemSummary[] => {
  if (!Array.isArray(items) || !streamableIds.size) return []
  return items.filter((item) => isMediaItemStreamable(item, streamableIds))
}
