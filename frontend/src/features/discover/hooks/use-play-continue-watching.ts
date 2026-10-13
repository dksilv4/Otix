import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { useMediaStreamPlayer } from '@/features/media/hooks/use-media-stream-player'
import {
  buildPlexPlaybackSession,
  type PlexConnectInfoData,
} from '@/features/media/utils/plex-stream'
import type { DiscoverContinueWatchingItem } from '../types'

export const usePlayContinueWatching = () => {
  const { openStream } = useMediaStreamPlayer()
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null)

  const playItem = useCallback(
    async (item: DiscoverContinueWatchingItem) => {
      setLoadingItemId(item.id)
      try {
        const ident = String(item.mediaItemId || item.ratingKey)
        const params: Record<string, unknown> = {}
        if (item.seasonNumber != null && item.episodeNumber != null) {
          params.season = item.seasonNumber
          params.episode = item.episodeNumber
        }
        if (item.title) {
          params.title = item.showTitle || item.title
        }

        const { data: info } = await apiClient.get<PlexConnectInfoData>(
          `/integrations/plex/connect-info/${encodeURIComponent(ident)}`,
          { params },
        )

        const baseUrl = String(info?.baseUrl || info?.base_url || item.serverUrl || '')
        const token = String(info?.token || '')
        const ratingKey = String(info?.ratingKey || info?.rating_key || item.ratingKey)

        if (!baseUrl || !token || !ratingKey) {
          return
        }

        const session = buildPlexPlaybackSession(info, {
          title: item.showTitle || item.title,
          subtitle: item.subtitle || undefined,
          episodeContext:
            item.mediaType === 'show' && item.seasonNumber != null && item.episodeNumber != null
              ? {
                  seriesTitle: item.showTitle || item.title,
                  seasonNumber: item.seasonNumber,
                  episodeNumber: item.episodeNumber,
                  episodeTitle: item.episodeTitle || `Episode ${item.episodeNumber}`,
                }
              : undefined,
        })

        if (item.viewOffset && (!session.startPositionMs || session.startPositionMs === 0)) {
          session.startPositionMs = item.viewOffset
        }

        openStream(session)
      } catch (err) {
        console.error('[ContinueWatching] Playback failed:', err)
      } finally {
        setLoadingItemId(null)
      }
    },
    [openStream],
  )

  return { playItem, loadingItemId }
}
