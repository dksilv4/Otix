import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries } from '../../queries/media-queries'
import { useMediaParams } from '../../hooks/use-media-params'
import { MediaDetailPluginButtons } from './plugin-detail-actions'
import { DownloadGameButton } from '@/features/media/game/components/organisms/media-download-game-button'
import { RequestMediaButton } from './media-request-button'
import { useMediaDetailPluginActions } from '@/features/media/hooks/use-media-detail-plugin-actions'
import { useRequestMedia } from '@/features/media/hooks/use-request-media'
import { apiClient } from '@/lib/api/client'
import { showToast } from '@ui/molecules/toast'

export const MediaHeroLibraryActions = () => {
  const { mediaType, mediaId } = useMediaParams()
  const { data: detail } = useQuery(mediaQueries.detail(mediaType, mediaId))
  const effectiveMediaId = detail?.id ? String(detail.id) : mediaId
  const pluginActions = useMediaDetailPluginActions(
    mediaType,
    effectiveMediaId,
    detail?.tmdbId,
    Boolean(detail) && mediaType !== 'game',
    detail?.title,
  )
  const requestMedia = useRequestMedia()
  const hasPlayWidgets = pluginActions.playWidgets.length > 0

  const handleWatchAvailable = useCallback(async () => {
    try {
      // 1. Try refreshing play widgets from desktop plugins / backend
      await pluginActions.refreshPlayWidgets()
      if (pluginActions.playWidgets.length > 0) {
        const first = pluginActions.playWidgets[0]
        if (first.props.instances.length > 0) {
          await pluginActions.handlePlay(first.pluginId, first.props.instances[0])
          return
        }
      }

      // 2. Direct attempt: probe backend Plex connect-info for any candidate
      const rawCandidates = [
        effectiveMediaId,
        detail?.tmdbId,
        (detail as { tvdbId?: string | number })?.tvdbId,
        detail?.slug,
        detail?.title,
      ]
      const candidates = Array.from(
        new Set(
          rawCandidates
            .filter((c): c is string | number => Boolean(c))
            .map((c) => String(c)),
        ),
      )
      for (const cand of candidates) {
        try {
          const { data: plexInfo } = await apiClient.get<Record<string, unknown>>(
            `/integrations/plex/connect-info/${encodeURIComponent(String(cand))}`,
          )
          const ratingKey = String(plexInfo?.ratingKey || plexInfo?.rating_key || '')
          const baseUrl = String(plexInfo?.baseUrl || plexInfo?.base_url || '')
          const token = String(plexInfo?.token || '')
          if (ratingKey && baseUrl && token) {
            await pluginActions.handlePlay('backend-plex', {
              id: `plex|${ratingKey}`,
              serverId: String(plexInfo?.serverId || plexInfo?.server_id || 'default'),
              name: String(plexInfo?.serverName || plexInfo?.server_name || 'Plex'),
              ratingKey,
              baseUrl,
              token,
              provider: 'plex',
              providerLabel: 'Plex',
              serverName: String(plexInfo?.serverName || plexInfo?.server_name || 'Plex'),
              mediaType: mediaType as 'movie' | 'show',
              title: detail?.title || 'Stream',
            })
            return
          }
        } catch {
          // Probe next candidate
        }
      }

      // 3. Fallback notification if media server is still updating
      showToast({
        title: 'Library Sync in Progress',
        description: `${detail?.title || 'Title'} is in your library. Media server (Plex/Jellyfin) is finishing indexing.`,
      })
    } catch (err) {
      console.error('Failed to resolve stream for available media:', err)
    }
  }, [pluginActions, effectiveMediaId, detail, mediaType])

  return (
    <>
      {mediaType === 'game' && <DownloadGameButton />}

      {/* Movies / Shows Request & Library actions */}
      {(mediaType === 'movie' || mediaType === 'show') && (
        <RequestMediaButton
          state={requestMedia}
          hideIfAvailable={hasPlayWidgets}
          onWatch={handleWatchAvailable}
        />
      )}

      {hasPlayWidgets ? (
        <MediaDetailPluginButtons
          widgets={[]}
          playWidgets={pluginActions.playWidgets}
          requesting={pluginActions.requesting}
          onRequest={pluginActions.handleRequest}
          onPlay={pluginActions.handlePlay}
          variant="pill"
        />
      ) : null}

      {requestMedia.hidden && pluginActions.widgets.length > 0 && (
        <MediaDetailPluginButtons
          widgets={pluginActions.widgets}
          playWidgets={[]}
          requesting={pluginActions.requesting}
          onRequest={pluginActions.handleRequest}
          onPlay={pluginActions.handlePlay}
          variant="pill"
        />
      )}
    </>
  )
};
