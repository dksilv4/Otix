import { useState, useCallback, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useHasSession } from '@/lib/providers/auth'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useMediaStreamPlayer } from './use-media-stream-player'
import type { StreamPlaybackSession } from '../types/stream-player'
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
  mediaTitle?: string | null,
) {
  // Radarr/other source services need the real TMDB id, not the internal ULID.
  const requestId = tmdbId || mediaId
  const hasSession = useHasSession()
  const { data: servers = [] } = useGameServers({ enabled: enabled && hasSession })
  const activeServer = servers.find((s) => s.isOnline || s.isActive) || servers[0]

  const streamPlayer = useMediaStreamPlayer()
  const [widgets, setWidgets] = useState<RequestWidget[]>([])
  const [playWidgets, setPlayWidgets] = useState<PlayWidget[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null)

  const loadSlots = useCallback(async () => {
    // Games must never query video media plugins or backend Plex servers
    if (mediaType === 'game') {
      setWidgets([])
      setPlayWidgets([])
      setLoading(false)
      return
    }

    const api = getPluginApi()
    const requestWidgets: RequestWidget[] = []
    const playList: PlayWidget[] = []

    if (api?.getSlotData) {
      try {
        const data = (await api.getSlotData('media/detail/actions', { mediaId: requestId, mediaType })) as Array<{
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
      } catch (err) {
        console.error('Failed to load plugin slots:', err)
      }
    }

    // Check connected Otix game server for Radarr/Sonarr if no request widgets
    if (requestWidgets.length === 0 && activeServer) {
      try {
        const numId = Number(requestId)
        if (mediaType === 'movie') {
          const { data } = await apiClient.get<Array<{
            id: number
            title: string
            tmdb_id?: number
            tmdbId?: number
            has_file?: boolean
            hasFile?: boolean
            monitored?: boolean
          }>>(`/library/servers/${activeServer.id}/radarr/movies`)
          const movies = data || []
          const existing = movies.find(m => (m.tmdb_id || m.tmdbId) === numId)
          const status: RequestInstance['status'] = existing
            ? (existing.has_file || existing.hasFile ? 'downloaded' : 'requested')
            : 'not_exists'

          requestWidgets.push({
            pluginId: 'server-radarr',
            label: `${activeServer.name} (Radarr)`,
            props: {
              label: 'Radarr',
              mediaType: 'movie',
              mediaId: requestId,
              instances: [
                {
                  id: String(activeServer.id),
                  name: `${activeServer.name} Radarr`,
                  status,
                },
              ],
            },
          })
        } else if (mediaType === 'show') {
          const { data } = await apiClient.get<Array<{
            id: number
            title: string
            tvdb_id?: number
            tvdbId?: number
            tmdb_id?: number
            tmdbId?: number
            statistics?: {
              episodeFileCount?: number
              totalEpisodeCount?: number
              episodeCount?: number
            }
            monitored?: boolean
          }>>(`/library/servers/${activeServer.id}/sonarr/series`)
          const seriesList = data || []
          const existing = seriesList.find(
            s => (s.tvdb_id || s.tvdbId) === numId || (s.tmdb_id || s.tmdbId) === numId,
          )
          let status: RequestInstance['status'] = 'not_exists'
          if (existing) {
            const stats = existing.statistics || {}
            const files = stats.episodeFileCount ?? 0
            const total = stats.totalEpisodeCount ?? stats.episodeCount ?? 0
            if (files > 0) {
              status = total > 0 && files < total ? 'partially_available' : 'downloaded'
            } else {
              status = 'requested'
            }
          }

          requestWidgets.push({
            pluginId: 'server-sonarr',
            label: `${activeServer.name} (Sonarr)`,
            props: {
              label: 'Sonarr',
              mediaType: 'show',
              mediaId: requestId,
              instances: [
                {
                  id: String(activeServer.id),
                  name: `${activeServer.name} Sonarr`,
                  status,
                },
              ],
            },
          })
        }
      } catch (err) {
        console.warn('Failed to query server arr media status:', err)
      }
    }

    // Check backend Plex connect-info if no play widgets found yet
    if (playList.length === 0) {
      const candidates = Array.from(
        new Set([mediaId, requestId, tmdbId, mediaTitle].filter((c): c is string => Boolean(c))),
      )
      for (const targetId of candidates) {
        try {
          const { data: plexInfo } = await apiClient.get<Record<string, unknown>>(
            `/integrations/plex/connect-info/${encodeURIComponent(targetId)}`,
          )
          const ratingKey = String(plexInfo?.ratingKey || plexInfo?.rating_key || '')
          const baseUrl = String(plexInfo?.baseUrl || plexInfo?.base_url || '')
          const token = String(plexInfo?.token || '')
          const provider = String(plexInfo?.provider || 'plex')
          const providerLabel = String(plexInfo?.providerLabel || plexInfo?.provider_label || 'Plex')
          const serverName = String(plexInfo?.serverName || plexInfo?.server_name || 'Plex')
          const title = String(plexInfo?.title || '')
          const mediaTypeVal = (plexInfo?.mediaType || plexInfo?.media_type || mediaType) as 'movie' | 'show' | 'episode'
          const seasonNumber = plexInfo?.seasonNumber != null ? Number(plexInfo.seasonNumber) : (plexInfo?.season_number != null ? Number(plexInfo.season_number) : undefined)
          const episodeNumber = plexInfo?.episodeNumber != null ? Number(plexInfo.episodeNumber) : (plexInfo?.episode_number != null ? Number(plexInfo.episode_number) : undefined)
          const episodeTitle = plexInfo?.episodeTitle ? String(plexInfo.episodeTitle) : (plexInfo?.episode_title ? String(plexInfo.episode_title) : undefined)
          const viewOffset = Number(plexInfo?.viewOffset ?? plexInfo?.view_offset ?? 0)
          const duration = Number(plexInfo?.duration ?? 0)
          const progressPercent = Number(plexInfo?.progressPercent ?? plexInfo?.progress_percent ?? 0)
          const viewed = Boolean(plexInfo?.viewed)

          if (ratingKey && baseUrl && token) {
            playList.push({
              pluginId: 'backend-plex',
              label: providerLabel,
              props: {
                label: providerLabel,
                mediaType: mediaType as 'movie' | 'show',
                mediaId,
                instances: [
                  {
                    id: `${provider}|${ratingKey}`,
                    serverId: String(plexInfo?.serverId || plexInfo?.server_id || 'default'),
                    name: serverName,
                    ratingKey,
                    baseUrl,
                    token,
                    provider,
                    providerLabel,
                    serverName,
                    mediaType: mediaTypeVal,
                    seasonNumber,
                    episodeNumber,
                    episodeTitle,
                    viewOffset,
                    duration,
                    progressPercent,
                    viewed,
                    title: title || 'Stream',
                  },
                ],
              },
            })
            break
          }
        } catch {
          // Continue to next candidate
        }
      }
    }

    setWidgets(requestWidgets)
    setPlayWidgets(playList)
    setLoading(false)
  }, [requestId, mediaType, mediaId, tmdbId, mediaTitle, activeServer])

  useEffect(() => {
    if (!enabled) return
    Promise.resolve().then(() => {
      loadSlots()
    })
  }, [loadSlots, enabled])

  const handleRequest = async (pluginId: string, instanceId: string) => {
    setRequesting(instanceId)

    // Handle server-based Radarr/Sonarr requests
    if (pluginId === 'server-radarr' || pluginId === 'server-sonarr') {
      const serverId = Number(instanceId) || activeServer?.id
      if (!serverId) {
        alert('No server selected')
        setRequesting(null)
        return
      }

      try {
        if (pluginId === 'server-radarr') {
          await apiClient.post(`/library/servers/${serverId}/radarr/movies`, {
            title: requestId,
            tmdb_id: Number(requestId),
            monitored: true,
            search_for_movie: true,
          })
        } else {
          await apiClient.post(`/library/servers/${serverId}/sonarr/series`, {
            title: requestId,
            tmdb_id: Number(requestId),
            monitored: true,
            search_for_missing_episodes: true,
          })
        }
        await loadSlots()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to send request to server')
      } finally {
        setRequesting(null)
      }
      return
    }

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
    if (pluginId === 'backend-plex') {
      try {
        let baseUrl = instance.baseUrl || ''
        let token = instance.token || ''
        let ratingKey = instance.ratingKey || ''

        if (!baseUrl || !token || !ratingKey) {
          const candidates = [mediaId, requestId].filter(Boolean)
          for (const targetId of candidates) {
            try {
              const { data: plexInfo } = await apiClient.get<Record<string, unknown>>(
                `/integrations/plex/connect-info/${targetId}`,
              )
              baseUrl = String(plexInfo?.baseUrl || plexInfo?.base_url || '')
              token = String(plexInfo?.token || '')
              ratingKey = String(plexInfo?.ratingKey || plexInfo?.rating_key || '')
              if (baseUrl && token && ratingKey) break
            } catch {
              // Try next candidate
            }
          }
        }

        if (!baseUrl || !token || !ratingKey) {
          alert('Could not find Plex streaming connection details.')
          return
        }

        let meta: Record<string, any> | undefined
        let media: Record<string, any> | undefined
        let part: Record<string, any> | undefined
        let audioTracks: Array<{
          id: string
          index: number
          label: string
          language: string
          codec: string
          channels: number
        }> = []
        let subtitles: Array<{
          id: string
          index: number
          label: string
          language: string
          url?: string
          format: 'pgs' | 'ass' | 'srt' | 'vtt'
          isExternal: boolean
          requiresBurnIn: boolean
        }> = []

        try {
          const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
            headers: {
              'X-Plex-Token': token,
              Accept: 'application/json',
            },
          })
          if (res.ok) {
            const data = await res.json().catch(() => null)
            meta = data?.MediaContainer?.Metadata?.[0]
            media = meta?.Media?.[0]
            part = media?.Part?.[0]
            const streams = (part?.Stream || []) as Array<{
              id: number
              streamType: number
              codec: string
              index: number
              language?: string
              languageCode?: string
              displayTitle?: string
              title?: string
              channels?: number
              key?: string
            }>

            audioTracks = streams
              .filter((s) => s.streamType === 2)
              .map((s) => ({
                id: String(s.id),
                index: Number(s.index),
                label: s.displayTitle || s.title || s.language || 'Audio',
                language: s.languageCode || s.language || 'und',
                codec: s.codec,
                channels: Number(s.channels) || 2,
              }))

            subtitles = streams
              .filter((s) => s.streamType === 3)
              .map((s) => ({
                id: String(s.id),
                index: Number(s.index),
                label: s.displayTitle || s.title || s.language || 'Subtitles',
                language: s.languageCode || s.language || 'und',
                url: s.key
                  ? `${baseUrl}${s.key}?X-Plex-Token=${encodeURIComponent(token)}`
                  : undefined,
                format: (s.codec === 'pgs' ? 'pgs' : s.codec === 'ass' ? 'ass' : s.codec === 'srt' ? 'srt' : 'vtt') as
                  | 'pgs'
                  | 'ass'
                  | 'srt'
                  | 'vtt',
                isExternal: Boolean(s.key),
                requiresBurnIn: s.codec === 'pgs' || s.codec === 'ass',
              }))
          }
        } catch (fetchErr) {
          console.warn('[Plex] Direct metadata query skipped; proceeding with stream URLs:', fetchErr)
        }

        const playSessionId = 'otix-plex-' + Date.now().toString(36)
        const hlsUrl = `${baseUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(
          '/library/metadata/' + ratingKey,
        )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&session=${encodeURIComponent(
          playSessionId,
        )}&X-Plex-Client-Identifier=otix-web&X-Plex-Product=Otix&X-Plex-Platform=Web&X-Plex-Token=${encodeURIComponent(
          token,
        )}`
        const directUrl = part?.key
          ? `${baseUrl}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`
          : undefined

        streamPlayer.openStream({
          source: 'plex',
          serverUrl: baseUrl,
          token,
          itemId: ratingKey,
          title: meta?.title || instance.title || 'Movie',
          subtitle: meta?.year ? String(meta.year) : undefined,
          playSessionId,
          directUrl,
          hlsUrl,
          audioTracks,
          subtitles,
          startPositionMs: Number(meta?.viewOffset) || instance.viewOffset || 0,
          durationMs: Number(meta?.duration) || instance.duration || 0,
          container: media?.container || 'mp4',
          videoCodec: media?.videoCodec || 'h264',
          audioCodec: media?.audioCodec || 'aac',
          episodeContext:
            instance.seasonNumber != null && instance.episodeNumber != null
              ? {
                  seasonNumber: instance.seasonNumber,
                  episodeNumber: instance.episodeNumber,
                  episodeTitle: instance.episodeTitle || instance.title || 'Episode',
                }
              : undefined,
        })
        return
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to start stream')
        return
      }
    }

    const api = getPluginApi()
    try {
      // 1. Attempt in-app media streaming first
      const streamRes = (await api?.callData(pluginId, 'play.stream', {
        serverId: instance.serverId,
        ratingKey: instance.ratingKey,
        itemId: instance.itemId || instance.ratingKey,
      })) as {
        success?: boolean
        session?: StreamPlaybackSession
        error?: string
      } | null

      if (streamRes?.success && streamRes.session) {
        streamPlayer.openStream(streamRes.session)
        return
      }

      // 2. Fallback to external player if streaming is unsupported or fails
      const res = (await api?.callData(pluginId, 'play.open', {
        serverId: instance.serverId,
        ratingKey: instance.ratingKey,
        itemId: instance.itemId || instance.ratingKey,
      })) as {
        success?: boolean
        url?: string
        error?: string
      } | null
      if (!res?.success || !res?.url) {
        alert(res?.error || streamRes?.error || 'Failed to open media player')
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
      alert(err instanceof Error ? err.message : 'Failed to open media')
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
    refreshPlayWidgets: loadSlots,
  }
}
