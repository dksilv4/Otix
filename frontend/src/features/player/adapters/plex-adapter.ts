import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
  PlaybackOptions,
  StreamQualityOption,
  AudioTrack,
  SubtitleTrack,
} from '../types'
import {
  buildPlexHlsUrl,
  buildPlexDirectUrl,
  fetchPlexConnectInfoCached,
  triggerPlexDecision,
  selectPlexAudioStream,
} from '@/features/media/utils/plex-stream'
import { getPlexClientId } from '@/features/media/utils/player'
import { determinePlaybackMethod } from '@/features/media/utils/stream-compatibility'
import { buildQualityOptions, DEFAULT_QUALITY_ID } from '@/features/media/utils/quality'
import { apiClient } from '@/lib/api/client'

export class PlexSourceAdapter implements MediaSourceAdapter {
  readonly id = 'plex'
  readonly name = 'Plex Media Server'

  supports(item: PlayableMediaItem): boolean {
    return item.source === 'plex'
  }

  async resolvePlayback(item: PlayableMediaItem, options?: PlaybackOptions): Promise<ResolvedPlayback> {
    const data = item.providerData || {}
    let baseUrl = String(data.serverUrl || data.baseUrl || '').replace(/\/$/, '')
    let token = String(data.token || data.plexToken || '')
    let ratingKey = String(item.id.replace(/^plex:/, '') || data.ratingKey || data.itemId || '')
    let directPartKey = data.partKey || data.directUrl

    // If connect info is missing or item is a queued episode placeholder, query cached connect info
    const isEpisodePlaceholder = Boolean(
      item.subtype === 'episode' &&
        (data.isQueuedPlaceholder || !directPartKey || ratingKey.includes('-s')),
    )

    if (((!baseUrl || !token) && ratingKey) || isEpisodePlaceholder) {
      const showId = data.showId || (ratingKey.includes('-s') ? ratingKey.split('-s')[0] : ratingKey)
      const connect = await fetchPlexConnectInfoCached(showId, {
        season: item.episodeContext?.seasonNumber ?? data.seasonNumber,
        episode: item.episodeContext?.episodeNumber ?? data.episodeNumber,
        title: item.episodeContext?.seriesTitle || data.showTitle,
      })
      if (connect) {
        baseUrl = (connect.baseUrl || connect.base_url || baseUrl).replace(/\/$/, '')
        token = connect.token || token
        ratingKey = String(connect.ratingKey || connect.rating_key || ratingKey)
        directPartKey = connect.partKey || connect.part_key || connect.directUrl || directPartKey
        if (connect.audioTracks || connect.audio_tracks) {
          data.audioTracks = connect.audioTracks || connect.audio_tracks
        }
        if (connect.subtitles) {
          data.subtitles = connect.subtitles
        }
        if (connect.container) data.container = connect.container
        if (connect.videoCodec || connect.video_codec) data.videoCodec = connect.videoCodec || connect.video_codec
        if (connect.audioCodec || connect.audio_codec) data.audioCodec = connect.audioCodec || connect.audio_codec
        if (connect.baseUrls || connect.base_urls) {
          data.baseUrls = connect.baseUrls || connect.base_urls
        }
      }
    }

    const clientId = data.clientId || getPlexClientId()
    const playSessionId = data.playSessionId || `otix-plex-${Date.now().toString(36)}`
    const baseUrls: string[] = Array.from(
      new Set(
        [baseUrl, ...(Array.isArray(data.baseUrls) ? data.baseUrls : [])].filter(
          (u): u is string => Boolean(u),
        ),
      ),
    )

    // Secure URL preference in HTTPS environments
    if (
      typeof window !== 'undefined' &&
      window.location?.protocol === 'https:' &&
      baseUrl.startsWith('http://')
    ) {
      const secureCandidate = baseUrls.find((u) => u.startsWith('https://'))
      if (secureCandidate) baseUrl = secureCandidate
    }

    // AUDIO PLAYBACK RESOLUTION
    if (item.mediaType === 'audio') {
      const streamUrl = directPartKey
        ? buildPlexDirectUrl(baseUrl, directPartKey, token, playSessionId, clientId)
        : ratingKey
          ? `${baseUrl}/library/parts/${ratingKey}?X-Plex-Token=${encodeURIComponent(token)}`
          : ''

      return {
        engine: 'html5-audio',
        streamUrl,
        directUrl: streamUrl,
        baseUrls,
        headers: token ? { 'X-Plex-Token': token } : undefined,
      }
    }

    // VIDEO PLAYBACK RESOLUTION
    const audioTracks: AudioTrack[] = (data.audioTracks || []).map((a: any) => ({
      id: String(a.id),
      index: Number(a.index),
      label: a.label || 'Audio',
      language: a.language || 'und',
      codec: a.codec || 'aac',
      channels: Number(a.channels) || 2,
      isDefault: Boolean(a.isDefault),
    }))

    const subtitleTracks: SubtitleTrack[] = (data.subtitles || []).map((s: any) => ({
      id: String(s.id),
      index: Number(s.index),
      label: s.label || 'Subtitles',
      language: s.language || 'und',
      url: s.url,
      format: s.format || 'vtt',
      isExternal: Boolean(s.isExternal),
      requiresBurnIn: Boolean(s.requiresBurnIn),
    }))

    const selectedAudioIndex = options?.audioIndex ?? data.selectedAudioIndex ?? audioTracks[0]?.index
    const selectedSubtitleIndex = options?.subtitleIndex ?? data.selectedSubtitleIndex

    const selectedAudioTrack =
      audioTracks.find((a) => a.index === selectedAudioIndex) || audioTracks[0]

    if (baseUrl && token && selectedAudioTrack?.id) {
      void selectPlexAudioStream(baseUrl, directPartKey || ratingKey, selectedAudioTrack.id, token)
    }

    const activeSub =
      selectedSubtitleIndex != null
        ? subtitleTracks.find((s) => s.index === selectedSubtitleIndex)
        : null

    // Determine direct play capability
    const directPlayMethod = determinePlaybackMethod(data.container, data.videoCodec, data.audioCodec)
    const requiresBurnIn = activeSub?.requiresBurnIn ?? false

    // Direct Play only allowed if container/codecs are supported AND subtitles don't require burn-in
    const effectiveQualityId = options?.preferredQuality || data.selectedQuality || DEFAULT_QUALITY_ID
    const isTranscodeQuality =
      effectiveQualityId !== 'auto' &&
      effectiveQualityId !== 'original' &&
      !effectiveQualityId.startsWith('hls-')
    const isFirstAudioTrack = !selectedAudioTrack || audioTracks[0]?.id === selectedAudioTrack.id
    const canDirectPlay =
      !isTranscodeQuality &&
      isFirstAudioTrack &&
      (directPlayMethod === 'direct-play' || directPlayMethod === 'direct-stream') &&
      !requiresBurnIn &&
      Boolean(directPartKey)
    const playbackMethod = canDirectPlay ? 'direct-play' : 'transcode'

    const directUrl = directPartKey
      ? buildPlexDirectUrl(baseUrl, directPartKey, token, playSessionId, clientId)
      : undefined

    const offsetSeconds =
      typeof options?.startPosition === 'number' && options.startPosition > 0
        ? Math.floor(options.startPosition)
        : typeof data.startPositionMs === 'number' && data.startPositionMs > 0
          ? Math.floor(data.startPositionMs / 1000)
          : undefined

    const hlsQualityOpts = {
      maxVideoBitrate: data.maxVideoBitrate,
      videoResolution: data.videoResolution,
      audioStreamID: selectedAudioTrack?.id,
      offsetSeconds,
    }

    const hlsUrl = buildPlexHlsUrl(baseUrl, ratingKey, token, playSessionId, clientId, hlsQualityOpts)

    const availableQualities = buildQualityOptions({
      hasDirectPlay: Boolean(directUrl),
      source: 'plex',
    })

    if (baseUrl && ratingKey && token && !canDirectPlay) {
      void triggerPlexDecision(baseUrl, ratingKey, token, playSessionId, clientId, hlsQualityOpts)
    }

    return {
      engine: canDirectPlay ? 'html5-video' : 'hls',
      playbackMethod,
      directUrl,
      hlsUrl,
      streamUrl: canDirectPlay ? directUrl : hlsUrl,
      audioTracks,
      subtitleTracks,
      availableQualities,
      baseUrls,
      activeAudioIndex: selectedAudioIndex,
      activeSubtitleIndex: selectedSubtitleIndex,
    }
  }

  async reportProgress(report: ProgressReport): Promise<void> {
    const data = report.item.providerData || {}
    const baseUrl = String(data.serverUrl || data.baseUrl || '').replace(/\/$/, '')
    const token = String(data.token || data.plexToken || '')
    const ratingKey = String(report.item.id.replace(/^plex:/, '') || data.ratingKey || data.itemId || '')
    const clientId = data.clientId || getPlexClientId()
    const isSharedServer = Boolean(data.isSharedServer)

    if (!baseUrl || !ratingKey) return

    const positionMs = Math.round(report.positionSeconds * 1000)
    const durationMs = Math.round(report.durationSeconds * 1000)
    const state = report.state === 'stopped' ? 'stopped' : report.state === 'playing' ? 'playing' : 'paused'

    const params = new URLSearchParams({
      ratingKey,
      key: `/library/metadata/${ratingKey}`,
      state,
      time: String(positionMs),
      duration: String(durationMs),
      hasMDE: '1',
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Session-Identifier': report.sessionId,
      'X-Plex-Playback-Session-Id': report.sessionId,
      'X-Plex-Product': 'Otix',
      'X-Plex-Platform': 'Web',
      'X-Plex-Platform-Version': '1.0',
      'X-Plex-Device': 'Otix Universal Player',
      'X-Plex-Device-Name': 'Otix Player',
      'X-Plex-Version': '1.0.0',
    })
    if (token) {
      params.set('X-Plex-Token', token)
    }

    const directTimelineUrl = `${baseUrl}/:/timeline?${params.toString()}`

    // On shared servers, skip direct PMS timeline calls to avoid corrupting friend's watch offset
    if (!isSharedServer) {
      try {
        await fetch(directTimelineUrl, {
          method: 'GET',
          mode: 'no-cors',
          keepalive: state === 'stopped',
        })
      } catch {
        // Direct fetch failed or restricted
      }
    }

    // Keep Otix backend UserPlexItem viewOffset in sync
    if (isSharedServer || state === 'stopped' || state === 'paused' || Math.random() < 0.25) {
      apiClient
        .post('/integrations/plex/timeline', {
          serverUrl: baseUrl,
          token,
          ratingKey,
          state,
          timeMs: positionMs,
          durationMs,
          clientId,
          sessionId: report.sessionId,
          localOnly: true,
        })
        .catch(() => {})
    }
  }

  async failoverServer(currentServerUrl: string, item: PlayableMediaItem): Promise<string | null> {
    const data = item.providerData || {}
    const baseUrls: string[] = Array.isArray(data.baseUrls) ? data.baseUrls : []
    const cleanCurrent = currentServerUrl.replace(/\/$/, '')

    const nextUrl = baseUrls.find((u) => u.replace(/\/$/, '') !== cleanCurrent)
    if (nextUrl) {
      if (item.providerData) {
        item.providerData.serverUrl = nextUrl
      }
      return nextUrl
    }
    return null
  }

  async changeQuality(
    item: PlayableMediaItem,
    quality: StreamQualityOption,
    _currentPosition: number,
  ): Promise<ResolvedPlayback> {
    const isAutoOrOriginal = quality.isAuto || quality.isOriginal
    const maxVideoBitrate = isAutoOrOriginal ? undefined : quality.maxVideoBitrate
    const videoResolution = isAutoOrOriginal ? undefined : quality.videoResolution

    if (item.providerData) {
      item.providerData.selectedQuality = quality.id
      item.providerData.maxVideoBitrate = maxVideoBitrate
      item.providerData.videoResolution = videoResolution
      if (typeof _currentPosition === 'number' && _currentPosition > 0) {
        item.providerData.startPositionMs = Math.round(_currentPosition * 1000)
      }
    }

    const resolved = await this.resolvePlayback(item, {
      preferredQuality: quality.id,
      startPosition: _currentPosition,
      audioIndex: item.providerData?.selectedAudioIndex,
      subtitleIndex: item.providerData?.selectedSubtitleIndex,
    })

    if (item.providerData) {
      item.providerData.playbackMethod = resolved.playbackMethod
      item.providerData.hlsUrl = resolved.hlsUrl
      item.providerData.directUrl = resolved.directUrl
    }

    return resolved
  }

  async changeTracks(
    item: PlayableMediaItem,
    audioIndex?: number,
    subtitleIndex?: number,
    currentPosition?: number,
  ): Promise<ResolvedPlayback> {
    if (item.providerData) {
      if (audioIndex !== undefined) item.providerData.selectedAudioIndex = audioIndex
      if (subtitleIndex !== undefined) item.providerData.selectedSubtitleIndex = subtitleIndex
      if (typeof currentPosition === 'number' && currentPosition > 0) {
        item.providerData.startPositionMs = Math.round(currentPosition * 1000)
      }
      if (audioIndex !== undefined) {
        const currentSessionId = item.providerData.playSessionId || `otix-plex-${Date.now().toString(36)}`
        const baseSessionId = currentSessionId.split('-a-')[0]
        const audioTrack = (item.providerData.audioTracks || []).find((a: any) => a.index === audioIndex)
        if (audioTrack?.id) {
          item.providerData.playSessionId = `${baseSessionId}-a-${audioTrack.id}`
        }
      }
    }

    const resolved = await this.resolvePlayback(item, {
      audioIndex,
      subtitleIndex,
      startPosition: currentPosition,
    })

    if (item.providerData) {
      item.providerData.playbackMethod = resolved.playbackMethod
      item.providerData.hlsUrl = resolved.hlsUrl
      item.providerData.directUrl = resolved.directUrl
      if (typeof currentPosition === 'number' && currentPosition > 0) {
        item.providerData.startPositionMs = Math.round(currentPosition * 1000)
      }
    }

    return resolved
  }

  async getNextItem(item: PlayableMediaItem): Promise<PlayableMediaItem | null> {
    if (!item.episodeContext?.nextItemId) return null

    const nextId = item.episodeContext.nextItemId
    const nextEpisodeNumber = item.episodeContext.episodeNumber + 1

    return {
      id: `plex:${nextId}`,
      source: 'plex',
      mediaType: 'video',
      subtype: 'episode',
      title: item.episodeContext.seriesTitle,
      subtitle: `S${item.episodeContext.seasonNumber}:E${nextEpisodeNumber}`,
      albumOrShowTitle: item.episodeContext.seriesTitle,
      artworkUrl: item.artworkUrl,
      backdropUrl: item.backdropUrl,
      providerData: {
        ...(item.providerData || {}),
        ratingKey: nextId,
        itemId: nextId,
        selectedQuality: DEFAULT_QUALITY_ID,
      },
      episodeContext: {
        ...item.episodeContext,
        episodeNumber: nextEpisodeNumber,
        episodeTitle: `Episode ${nextEpisodeNumber}`,
        nextItemId: undefined,
        prevItemId: item.id.replace(/^plex:/, ''),
      },
    }
  }
}
