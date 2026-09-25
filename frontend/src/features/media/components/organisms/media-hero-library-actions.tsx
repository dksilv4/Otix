import { useQuery } from '@tanstack/react-query'
import { mediaQueries } from '../../queries/media-queries'
import { useMediaParams } from '../../hooks/use-media-params'
import { MediaDetailPluginButtons } from './plugin-detail-actions'
import { DownloadGameButton } from '@/features/media/game/components/organisms/media-download-game-button'
import { RequestMediaButton } from './media-request-button'
import { useMediaDetailPluginActions } from '@/features/media/hooks/use-media-detail-plugin-actions'
import { useRequestMedia } from '@/features/media/hooks/use-request-media'

export function MediaHeroLibraryActions() {
  const { mediaType, mediaId } = useMediaParams()
  const { data: detail } = useQuery(mediaQueries.detail(mediaType, mediaId))
  const pluginActions = useMediaDetailPluginActions(
    mediaType,
    mediaId,
    detail?.tmdbId,
    Boolean(detail),
  )
  const requestMedia = useRequestMedia()
  const hasPlayWidgets = pluginActions.playWidgets.length > 0

  return (
    <>
      {mediaType === 'game' && <DownloadGameButton />}
      {(mediaType === 'movie' || mediaType === 'show') && <RequestMediaButton state={requestMedia} />}

      {hasPlayWidgets ? (
        <div className="shadow-lg shadow-amber-500/10">
          <MediaDetailPluginButtons
            widgets={[]}
            playWidgets={pluginActions.playWidgets}
            requesting={pluginActions.requesting}
            onRequest={pluginActions.handleRequest}
            onPlay={pluginActions.handlePlay}
            variant="pill"
          />
        </div>
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
