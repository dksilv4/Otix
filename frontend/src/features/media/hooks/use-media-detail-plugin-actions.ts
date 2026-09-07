import { useState, useCallback, useEffect } from 'react'
import type {
  RequestInstance,
  RequestWidget,
  PlayInstance,
  PlayWidget,
} from '../components/organisms/plugin-detail-actions'

interface PluginApi {
  getSlotData: (location: string, context?: Record<string, unknown>) => Promise<unknown>
  callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
}

function getPluginApi(): PluginApi | undefined {
  return (window as Window & { desktopAPI?: { plugin?: PluginApi } }).desktopAPI?.plugin
}

// Fetches the request/play widgets from the `media/detail/actions` slot and
// exposes the shared state + handlers. Used once per detail surface; both the
// inline action buttons and the library-status section read from the same
// fetch. `enabled` defers the fetch until the detail (and thus the real TMDB
// id) is available, so the plugins aren't asked to resolve an internal ULID.
export function useMediaDetailPluginActions(
  mediaType: string,
  mediaId: string,
  tmdbId?: string | null,
  enabled = true,
) {
  // Radarr/other source services need the real TMDB id, not the internal ULID.
  const requestId = tmdbId || mediaId
  const [widgets, setWidgets] = useState<RequestWidget[]>([])
  const [playWidgets, setPlayWidgets] = useState<PlayWidget[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null)

  const loadSlots = useCallback(async () => {
    const api = getPluginApi()
    if (!api?.getSlotData) {
      setLoading(false)
      return
    }
    try {
      const data = await api.getSlotData('media/detail/actions', { mediaId: requestId, mediaType }) as Array<{
        pluginId: string
        label: string
        data?: {
          widgets?: Array<{
            type: string
            props: {
              label?: string
              mediaType: string
              mediaId: string
              instances: RequestInstance[] | PlayInstance[]
            }
          }>
        }
      }>
      const requestWidgets: RequestWidget[] = []
      const playList: PlayWidget[] = []
      if (data) {
        for (const entry of data) {
          for (const widget of entry.data?.widgets || []) {
            if (widget.type === 'request-button') {
              requestWidgets.push({
                pluginId: entry.pluginId,
                label: entry.label,
                props: widget.props as RequestWidget['props'],
              })
            } else if (widget.type === 'play-button') {
              playList.push({
                pluginId: entry.pluginId,
                label: entry.label,
                props: widget.props as PlayWidget['props'],
              })
            }
          }
        }
      }
      setWidgets(requestWidgets)
      setPlayWidgets(playList)
    } catch (err) {
      console.error('Failed to load plugin slots:', err)
    } finally {
      setLoading(false)
    }
  }, [requestId, mediaType])

  useEffect(() => {
    if (!enabled) return
    Promise.resolve().then(() => {
      loadSlots()
    })
  }, [loadSlots, enabled])

  const handleRequest = async (pluginId: string, instanceId: string) => {
    setRequesting(instanceId)
    const api = getPluginApi()
    if (!api?.callData) {
      setRequesting(null)
      return
    }

    try {
      const method = mediaType === 'movie' ? 'request-movie' : 'request-series'
      const res = await api.callData(pluginId, method, { instanceId, tmdbId: requestId }) as {
        success?: boolean
        error?: string
        message?: string
      } | null
      if (res?.success) {
        await loadSlots()
      } else {
        alert(res?.error || 'Failed to request')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to request')
    } finally {
      setRequesting(null)
    }
  }

  const handlePlay = async (pluginId: string, instance: PlayInstance) => {
    const api = getPluginApi()
    try {
      const res = await api?.callData(pluginId, 'play.open', { serverId: instance.serverId, ratingKey: instance.ratingKey }) as {
        success?: boolean
        url?: string
        error?: string
      } | null
      if (!res?.success || !res?.url) {
        alert(res?.error || 'Failed to open Plex')
        return
      }
      const desktopAPI = (
        window as Window & { desktopAPI?: { openExternal?: (url: string) => Promise<void> } }
      ).desktopAPI
      if (desktopAPI?.openExternal) {
        await desktopAPI.openExternal(res.url)
      } else {
        window.open(res.url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open Plex')
    }
  }

  const hasLibraryStatus = widgets.some(w =>
    (w.props.instances || []).some(i => i.status === 'requested' || i.status === 'downloaded' || i.status === 'error'))

  return {
    widgets,
    playWidgets,
    loading,
    requesting,
    handleRequest,
    handlePlay,
    hasLibraryStatus,
  }
}
