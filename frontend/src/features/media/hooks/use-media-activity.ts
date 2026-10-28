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

export const useMediaActivityCatalog = () => {
  const auth = useOptionalAuth()
  const isEnabled = Boolean(auth?.isAuthenticated)

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
      return processing > 0 ? 4000 : 45000
    },
    staleTime: 3000,
  })
}

export const useMediaActivity = (
  mediaType?: string,
  tmdbId?: string | number | null,
  mediaId?: string | number | null,
): MediaActivityItem | undefined => {
  const { data } = useMediaActivityCatalog()
  const items = data?.items

  return useMemo(() => {
    if (!items) return undefined
    const keys = resolveActivityLookupKeys(mediaType, tmdbId, mediaId)
    for (const key of keys) {
      if (items[key]) {
        return items[key]
      }
    }
    return undefined
  }, [items, mediaType, tmdbId, mediaId])
}
