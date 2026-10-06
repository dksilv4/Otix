import type { MediaItemSummary } from '@media/queries/media-queries'

export const yearOf = (item: MediaItemSummary | null): string | null => {
  if (!item?.releaseDate) return null
  return item.releaseDate.slice(0, 4)
}
