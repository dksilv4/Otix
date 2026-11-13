import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { useMediaStreamPlayer } from './use-media-stream-player'
import { buildPlexPlaybackSession, type PlexConnectInfoData } from '../utils/plex-stream'
import { buildUpcomingEpisodeQueue } from '../utils/player'
import type { SeasonOut } from '../queries/media-queries'

export interface StreamEpisodeParams {
  showId: string
  showTitle?: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
  seasons?: SeasonOut[]
}

export const useStreamEpisode = () => {
  const { openStream } = useMediaStreamPlayer()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const streamEpisode = useCallback(
    async ({
      showId,
      showTitle,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      seasons,
    }: StreamEpisodeParams) => {
      const epKey = `${showId}-s${seasonNumber}-e${episodeNumber}`
      setLoadingKey(epKey)

      try {
        const { data: info } = await apiClient.get<PlexConnectInfoData>(
          `/integrations/plex/connect-info/${encodeURIComponent(showId)}`,
          {
            params: {
              season: seasonNumber,
              episode: episodeNumber,
              title: showTitle,
            },
          },
        )

        const baseUrl = String(info?.baseUrl || info?.base_url || '')
        const token = String(info?.token || '')
        const ratingKey = String(info?.ratingKey || info?.rating_key || '')
        const title = String(info?.title || episodeTitle || `Episode ${episodeNumber}`)

        if (!baseUrl || !token || !ratingKey) {
          alert('Could not find stream connection for this episode on your server.')
          return
        }

        const session = buildPlexPlaybackSession(info, {
          title: showTitle || 'Show',
          subtitle: `S${seasonNumber}:E${episodeNumber} · ${title}`,
          episodeContext: {
            seriesTitle: showTitle || 'Show',
            seasonNumber,
            episodeNumber,
            episodeTitle: title,
          },
        })

        const queuedItems =
          seasons && seasons.length > 0
            ? buildUpcomingEpisodeQueue({
                showId,
                showTitle,
                currentSeasonNumber: seasonNumber,
                currentEpisodeNumber: episodeNumber,
                seasons,
                sessionTemplate: session,
              })
            : []

        openStream(session, queuedItems)
      } catch (err) {
        console.error('[StreamEpisode] Failed:', err)
        alert('Could not start playback for this episode from your media server.')
      } finally {
        setLoadingKey(null)
      }
    },
    [openStream],
  )

  return { streamEpisode, loadingKey }
}
