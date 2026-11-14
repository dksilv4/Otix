import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useOptionalAuth } from '@/lib/providers/auth'
import type {
  MediaActivityCatalog,
  MediaActivityItem,
} from '../types/media-activity'
import { resolveActivityLookupKeys } from '../utils/media-activity'

export const mediaActivityKeys = {
  all: ['media-activity'] as const,
  catalog: () => [...mediaActivityKeys.all, 'catalog'] as const,
}

export const useMediaActivityCatalog = (options?: { enabled?: boolean }) => {
  const auth = useOptionalAuth()
  const isEnabled = Boolean(auth?.isAuthenticated) && (options?.enabled ?? true)

  return useQuery<MediaActivityCatalog>({
    queryKey: mediaActivityKeys.catalog(),
    queryFn: async () => {
      const { data } = await apiClient.get<MediaActivityCatalog>('/library/nodes/media-activity')
      return (
        data || {
          items: {},
          summary: { totalProcessing: 0, totalRequested: 0, totalAvailable: 0 },
        }
      )
    },
    enabled: isEnabled,
    refetchInterval: (query) => {
      const processing = query.state.data?.summary?.totalProcessing ?? 0
      return processing > 0 ? 4000 : false
    },
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  })
}

export const useMediaActivity = (
  mediaType?: string,
  tmdbId?: string | number | null,
  mediaId?: string | number | null,
  tvdbId?: string | number | null,
  title?: string | null,
  options?: { enabled?: boolean },
): MediaActivityItem | undefined => {
  const isEnabled = options?.enabled ?? true
  const { data } = useMediaActivityCatalog({ enabled: isEnabled })
  const items = data?.items

  return useMemo(() => {
    if (!isEnabled || !items) return undefined
    const keys = resolveActivityLookupKeys(mediaType, tmdbId, mediaId, tvdbId, title)
    for (const key of keys) {
      if (items[key]) {
        return items[key]
      }
    }
    return undefined
  }, [isEnabled, items, mediaType, tmdbId, mediaId, tvdbId, title])
}
