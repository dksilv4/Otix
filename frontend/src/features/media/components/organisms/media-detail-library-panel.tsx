import { MediaDetailPluginLibraryStatus } from './plugin-detail-actions'
import { useMediaDetailPluginActions } from '../../hooks/use-media-detail-plugin-actions'
import { useRequestMedia } from '../../hooks/use-request-media'

interface MediaDetailLibraryPanelProps {
  mediaType: string
  mediaId: string
  tmdbId?: string | null
}

export const MediaDetailLibraryPanel = ({
  mediaType,
  mediaId,
  tmdbId,
}: MediaDetailLibraryPanelProps) => {
  const pluginActions = useMediaDetailPluginActions(mediaType, mediaId, tmdbId, true)
  const requestMedia = useRequestMedia()
  const libraryWidgets = requestMedia.hidden ? pluginActions.widgets : requestMedia.widgets
  const hasLibraryStatus = requestMedia.hidden
    ? pluginActions.hasLibraryStatus
    : requestMedia.hasLibraryStatus

  if (!hasLibraryStatus) return null

  return (
    <div className="glass-card p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Library Server Status</h3>
      </div>
      <MediaDetailPluginLibraryStatus widgets={libraryWidgets} />
    </div>
  )
};
