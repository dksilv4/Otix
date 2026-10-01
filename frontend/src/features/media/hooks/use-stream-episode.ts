import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { useMediaStreamPlayer } from './use-media-stream-player'

export interface StreamEpisodeParams {
  showId: string
  showTitle?: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
}

export function useStreamEpisode() {
  const { openStream } = useMediaStreamPlayer()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const streamEpisode = useCallback(
    async ({
      showId,
      showTitle,
      seasonNumber,
      episodeNumber,
      episodeTitle,
    }: StreamEpisodeParams) => {
      const epKey = `${showId}-s${seasonNumber}-e${episodeNumber}`
      setLoadingKey(epKey)

      try {
        const { data: info } = await apiClient.get<Record<string, unknown>>(
          `/integrations/plex/connect-info/${showId}?season=${seasonNumber}&episode=${episodeNumber}`,
        )

        const baseUrl = String(info?.baseUrl || info?.base_url || '')
        const token = String(info?.token || '')
        const ratingKey = String(info?.ratingKey || info?.rating_key || '')
        const viewOffset = Number(info?.viewOffset ?? info?.view_offset ?? 0)
        const duration = Number(info?.duration ?? 0)
        const title = String(info?.title || episodeTitle || `Episode ${episodeNumber}`)

        if (!baseUrl || !token || !ratingKey) {
          alert('Could not find stream connection for this episode on your server.')
          return
        }

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
        let partKey: string | undefined

        try {
          const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
            headers: {
              'X-Plex-Token': token,
              Accept: 'application/json',
            },
          })
          if (res.ok) {
            const data = await res.json().catch(() => null)
            const meta = data?.MediaContainer?.Metadata?.[0]
            const media = meta?.Media?.[0]
            const part = media?.Part?.[0]
            partKey = part?.key
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
                url: s.key ? `${baseUrl}${s.key}?X-Plex-Token=${encodeURIComponent(token)}` : undefined,
                format: (s.codec === 'pgs' ? 'pgs' : s.codec === 'ass' ? 'ass' : s.codec === 'srt' ? 'srt' : 'vtt') as
                  | 'pgs'
                  | 'ass'
                  | 'srt'
                  | 'vtt',
                isExternal: Boolean(s.key),
                requiresBurnIn: s.codec === 'pgs' || s.codec === 'ass',
              }))
          }
        } catch {
          // Gracefully continue with direct HLS URL
        }

        const playSessionId = 'otix-plex-' + Date.now().toString(36)
        const hlsUrl = `${baseUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(
          '/library/metadata/' + ratingKey,
        )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&session=${encodeURIComponent(
          playSessionId,
        )}&X-Plex-Client-Identifier=otix-web&X-Plex-Product=Otix&X-Plex-Platform=Web&X-Plex-Token=${encodeURIComponent(
          token,
        )}`
        const directUrl = partKey ? `${baseUrl}${partKey}?X-Plex-Token=${encodeURIComponent(token)}` : undefined

        openStream({
          source: 'plex',
          serverUrl: baseUrl,
          token,
          itemId: ratingKey,
          title: showTitle || 'Show',
          subtitle: `S${seasonNumber}:E${episodeNumber} · ${title}`,
          playSessionId,
          directUrl,
          hlsUrl,
          audioTracks,
          subtitles,
          startPositionMs: viewOffset,
          durationMs: duration,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
          episodeContext: {
            seasonNumber,
            episodeNumber,
            episodeTitle: title,
          },
        })
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
