import type { QueryClient } from '@tanstack/react-query'
import { mediaQueries, type MediaItemDetail } from '../queries/media-queries'

export interface MediaPreviewData {
  title?: string | null
  logoUrl?: string | null
  logoColorGuess?: string | null
  backdropUrl?: string | null
  posterUrl?: string | null
  releaseDate?: string | null
}

/**
 * Attempt to extract preview metadata (logo, title, backdrop, poster) from:
 * 1. An explicit detail query cache.
 * 2. Navigation history state (`window.history.state?.usr?.preview`).
 * 3. Any cached query in queryClient (discover feeds, search, library, launcher, etc.)
 */
export function findMediaPreview(
  queryClient: QueryClient,
  mediaType: string,
  mediaId: string,
): MediaPreviewData | null {
  if (!mediaId) return null

  // 1. Direct detail query cache
  try {
    const cachedDetail = queryClient.getQueryData<MediaItemDetail>(
      mediaQueries.detail(mediaType, mediaId).queryKey,
    )
    if (cachedDetail && (cachedDetail.logoUrl || cachedDetail.title || cachedDetail.backdropUrl)) {
      return {
        title: cachedDetail.title,
        logoUrl: cachedDetail.logoUrl,
        logoColorGuess: cachedDetail.logoColorGuess,
        backdropUrl: cachedDetail.backdropUrl,
        posterUrl: cachedDetail.posterUrl,
        releaseDate: cachedDetail.releaseDate,
      }
    }
  } catch {
    /* ignore query cache read errors */
  }

  // 2. Navigation state (if passed via TanStack Router state: { preview: ... })
  if (typeof window !== 'undefined') {
    try {
      const navState = (window.history.state?.usr as Record<string, unknown> | undefined)?.preview as
        | MediaPreviewData
        | undefined
      if (navState && (navState.logoUrl || navState.title || navState.backdropUrl)) {
        return navState
      }
    } catch {
      /* ignore history state errors */
    }
  }

  // 3. Search query cache across all cached queries (discover, search, library, etc.)
  try {
    const targetId = String(mediaId).toLowerCase()
    const queries = queryClient.getQueryCache().getAll()

    for (const q of queries) {
      const data = q.state.data as any
      if (!data) continue

      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.pages)
            ? data.pages.flatMap((p: any) => p?.items || p || [])
            : [data]

      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        const itemId = item.id != null ? String(item.id).toLowerCase() : ''
        const itemSlug = typeof item.slug === 'string' ? item.slug.toLowerCase() : ''

        if (itemId === targetId || itemSlug === targetId) {
          if (item.logoUrl || item.title || item.backdropUrl || item.posterUrl) {
            return {
              title: item.title ?? null,
              logoUrl: item.logoUrl ?? null,
              logoColorGuess: item.logoColorGuess ?? null,
              backdropUrl: item.backdropUrl ?? item.textlessPosterUrl ?? null,
              posterUrl: item.posterUrl ?? null,
              releaseDate: item.releaseDate ?? null,
            }
          }
        }
      }
    }
  } catch {
    /* ignore query iteration errors */
  }

  return null
}
