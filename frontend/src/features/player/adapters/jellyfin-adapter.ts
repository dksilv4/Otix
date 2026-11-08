import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
  PlaybackOptions,
} from '../types'
import { getJellyfinClientId } from '@/lib/player/utils'
import { buildQualityOptions } from '@/features/media/utils/quality'

export class JellyfinSourceAdapter implements MediaSourceAdapter {
  readonly id = 'jellyfin'
  readonly name = 'Jellyfin Media Server'

  supports(item: PlayableMediaItem): boolean {
    return item.source === 'jellyfin'
  }

  async resolvePlayback(item: PlayableMediaItem, options?: PlaybackOptions): Promise<ResolvedPlayback> {
    const data = item.providerData || {}
    const baseUrl = String(data.serverUrl || '').replace(/\/$/, '')
    const token = String(data.token || '')
    const itemId = String(item.id.replace(/^jellyfin:/, '') || data.itemId || '')
    const playSessionId = data.playSessionId || `otix-jellyfin-${Date.now().toString(36)}`

    // AUDIO PLAYBACK
    if (item.mediaType === 'audio') {
      const streamUrl = `${baseUrl}/Audio/${itemId}/stream?api_key=${encodeURIComponent(
        token,
      )}&PlaySessionId=${encodeURIComponent(playSessionId)}`

      return {
        engine: 'html5-audio',
        streamUrl,
        directUrl: streamUrl,
        headers: {
          'X-Emby-Token': token,
        },
      }
    }

    // VIDEO PLAYBACK
    const directUrl = `${baseUrl}/Videos/${itemId}/stream?api_key=${encodeURIComponent(
      token,
    )}&Static=true&PlaySessionId=${encodeURIComponent(playSessionId)}`

    const hlsUrl = `${baseUrl}/Videos/${itemId}/master.m3u8?api_key=${encodeURIComponent(
      token,
    )}&PlaySessionId=${encodeURIComponent(playSessionId)}`

    const availableQualities = buildQualityOptions({
      hasDirectPlay: true,
      source: 'jellyfin',
    })

    const isDirect = options?.preferredQuality === 'original' || !options?.preferredQuality

    return {
      engine: isDirect ? 'html5-video' : 'hls',
      playbackMethod: isDirect ? 'direct-play' : 'transcode',
      directUrl,
      hlsUrl,
      streamUrl: isDirect ? directUrl : hlsUrl,
      availableQualities,
    }
  }

  async reportProgress(report: ProgressReport): Promise<void> {
    const data = report.item.providerData || {}
    const baseUrl = String(data.serverUrl || '').replace(/\/$/, '')
    const token = String(data.token || '')
    const itemId = String(report.item.id.replace(/^jellyfin:/, '') || data.itemId || '')
    const clientId = data.clientId || getJellyfinClientId()

    if (!baseUrl || !token || !itemId) return

    const endpoint = report.state === 'stopped' ? '/Sessions/Playing/Stopped' : '/Sessions/Playing/Progress'
    const positionTicks = Math.round(report.positionSeconds * 10_000_000)
    const authHeader = `MediaBrowser Client="Otix", Device="Desktop", DeviceId="${clientId}", Version="1.0.0", Token="${token}"`

    try {
      await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'X-Emby-Token': token,
        },
        body: JSON.stringify({
          ItemId: itemId,
          PlaySessionId: report.sessionId,
          PositionTicks: positionTicks,
          IsPaused: report.state === 'paused',
        }),
      })
    } catch {
      // Ignore network errors on reporting
    }
  }
}
