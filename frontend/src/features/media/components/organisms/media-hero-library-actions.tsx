import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries } from '../../queries/media-queries'
import { useMediaParams } from '../../hooks/use-media-params'
import { MediaDetailPluginButtons } from './plugin-detail-actions'
import { MediaPlaySplitButton } from '../molecules/media-play-split-button'
import { RequestGameButton } from '@/features/media/game/components/organisms/media-download-game-button'
import { GameEditionSelector } from '@/features/media/game/components/atoms/game-edition-selector'
import { useGameEditions } from '@/features/media/game/hooks/use-game-editions'
import { RequestMediaButton } from './media-request-button'
import { useMediaDetailPluginActions } from '@/features/media/hooks/use-media-detail-plugin-actions'
import { useRequestMedia } from '@/features/media/hooks/use-request-media'
import {
  buildPlexPlaybackSession,
  fetchPlexConnectInfoCached,
} from '@/features/media/utils/plex-stream'
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
  const gameEditions = useGameEditions()
  const hasPlayWidgets = pluginActions.playWidgets.length > 0
  const unfulfilledArrTargets = requestMedia.instances.filter(
    (item) => item.status !== 'downloaded' && item.status !== 'partially_available',
  )

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

      // 2. Direct attempt: resolve Plex connect-info via cached lookup with full metadata
      const releaseYear = (detail as { releaseDate?: string })?.releaseDate
        ? new Date((detail as { releaseDate: string }).releaseDate).getFullYear()
        : undefined
      const plexInfo = await fetchPlexConnectInfoCached(effectiveMediaId, {
        tmdbId: detail?.tmdbId ?? undefined,
        tvdbId: (detail as { tvdbId?: string | number })?.tvdbId,
        title: detail?.title,
        year: releaseYear && !isNaN(releaseYear) ? releaseYear : undefined,
        mediaType,
      })

      if (plexInfo) {
        const ratingKey = String(plexInfo.ratingKey || plexInfo.rating_key || '')
        const baseUrl = String(plexInfo.baseUrl || plexInfo.base_url || '')
        const token = String(plexInfo.token || '')
        if (ratingKey && baseUrl && token) {
          const streamSession = buildPlexPlaybackSession(plexInfo, {
            title: detail?.title || plexInfo.title || 'Stream',
          })
          await pluginActions.handlePlay('backend-plex', {
            id: `plex|${ratingKey}`,
            serverId: String(plexInfo.serverId || plexInfo.server_id || 'default'),
            name: String(plexInfo.serverName || plexInfo.server_name || 'Plex'),
            ratingKey,
            baseUrl,
            token,
            provider: 'plex',
            providerLabel: 'Plex',
            serverName: String(plexInfo.serverName || plexInfo.server_name || 'Plex'),
            mediaType: mediaType as 'movie' | 'show',
            title: detail?.title || 'Stream',
            streamSession,
          })
          return
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
      {mediaType === 'game' && (
        <div className="flex flex-wrap items-center gap-2">
          {gameEditions.hasEditions && (
            <GameEditionSelector
              editions={gameEditions.editions}
              selectedEditionId={gameEditions.selectedEditionId}
              onSelectEdition={gameEditions.selectEdition}
              baseGameTitle={detail?.title || 'Game'}
              baseReleaseDate={(detail as { releaseDate?: string })?.releaseDate}
            />
          )}
          <RequestGameButton />
        </div>
      )}

      {/* Movies / Shows Request & Library actions */}
      {(mediaType === 'movie' || mediaType === 'show') && (
        <RequestMediaButton
          state={requestMedia}
          hideIfAvailable={hasPlayWidgets && !requestMedia.queueItem}
          onWatch={handleWatchAvailable}
        />
      )}

      {hasPlayWidgets ? (
        <MediaPlaySplitButton
          playWidget={pluginActions.playWidgets[0]}
          otherPlayWidgets={pluginActions.playWidgets.slice(1)}
          alternativeArrInstances={unfulfilledArrTargets}
          onPlay={pluginActions.handlePlay}
          onRequestAlternative={(instanceId) => requestMedia.handleRequest(instanceId)}
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
}
