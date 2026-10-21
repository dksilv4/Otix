import { useState, useCallback } from 'react'
import { useMediaStreamPlayer } from './use-media-stream-player'
import { buildPlexPlaybackSession, fetchPlexConnectInfoCached } from '../utils/plex-stream'
import { getPluginAPI } from '@/features/plugins/api'
import { showToast } from '@ui/molecules/toast'
import type { StreamPlaybackSession } from '../types/stream-player'
import type { PlayWidget } from '../components/organisms/plugin-detail-actions'

export interface QuickStreamOptions {
  mediaId: string
  tmdbId?: string | number | null
  mediaType: string
  title: string
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
}

export const useQuickStream = () => {
  const { openStream } = useMediaStreamPlayer()
  const [isStartingStream, setIsStartingStream] = useState(false)
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null)

  const quickStream = useCallback(
    async ({
      mediaId,
      tmdbId,
      mediaType,
      title,
      seasonNumber,
      episodeNumber,
      episodeTitle,
    }: QuickStreamOptions): Promise<boolean> => {
      setIsStartingStream(true)
      setActiveMediaId(mediaId)

      try {
        const effectiveId = tmdbId ? String(tmdbId) : mediaId

        // 1. Try desktop plugins first (Jellyfin / Plex)
        const api = getPluginAPI()
        if (api?.getSlotData && api?.callData) {
          try {
            const data = (await api.getSlotData('media/detail/actions', {
              mediaId: effectiveId,
              mediaType,
            })) as Array<{
              pluginId: string
              label: string
              data?: { widgets?: Array<{ type: string; props?: Record<string, unknown> }> }
            }>

            for (const entry of data || []) {
              for (const widget of entry.data?.widgets || []) {
                if (widget.type === 'play-button') {
                  const pw = widget as unknown as PlayWidget
                  const instances = pw.props?.instances || []
                  if (instances.length > 0) {
                    const inst = instances[0]
                    const streamRes = (await api.callData(entry.pluginId, 'play.stream', {
                      serverId: inst.serverId,
                      ratingKey: inst.ratingKey,
                      itemId: inst.itemId || inst.ratingKey,
                    })) as { success?: boolean; session?: StreamPlaybackSession; error?: string } | null

                    if (streamRes?.success && streamRes.session) {
                      openStream(streamRes.session)
                      return true
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.warn('[useQuickStream] Plugin resolution failed, falling back to backend:', err)
          }
        }

        // 2. Try backend Plex connect-info
        const plexInfo = await fetchPlexConnectInfoCached(mediaId, {
          tmdbId: tmdbId ? String(tmdbId) : undefined,
          title,
          mediaType,
          season: seasonNumber,
          episode: episodeNumber,
        })

        if (plexInfo) {
          const baseUrl = String(plexInfo.baseUrl || plexInfo.base_url || '')
          const token = String(plexInfo.token || '')
          const ratingKey = String(plexInfo.ratingKey || plexInfo.rating_key || '')

          if (baseUrl && token && ratingKey) {
            const session = buildPlexPlaybackSession(plexInfo, {
              title,
              subtitle:
                seasonNumber != null && episodeNumber != null
                  ? `S${seasonNumber}:E${episodeNumber} · ${episodeTitle || plexInfo.episodeTitle || 'Episode'}`
                  : undefined,
              episodeContext:
                seasonNumber != null && episodeNumber != null
                  ? {
                      seriesTitle: title,
                      seasonNumber,
                      episodeNumber,
                      episodeTitle: episodeTitle || plexInfo.episodeTitle || `Episode ${episodeNumber}`,
                    }
                  : undefined,
            })

            openStream(session)
            return true
          }
        }

        // 3. If stream connection could not be resolved
        showToast({
          title: 'Stream Unavailable',
          description: `Could not resolve a direct stream connection for "${title}". Make sure your media server is online.`,
          variant: 'warning',
        })
        return false
      } catch (err) {
        console.error('[useQuickStream] Playback error:', err)
        showToast({
          title: 'Stream Error',
          description: `An error occurred while starting stream for "${title}".`,
          variant: 'destructive',
        })
        return false
      } finally {
        setIsStartingStream(false)
        setActiveMediaId(null)
      }
    },
    [openStream],
  )

  return { quickStream, isStartingStream, activeMediaId }
}
