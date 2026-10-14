import type {
  StreamPlaybackSession,
  AudioTrack,
  SubtitleTrack,
  EpisodeContext,
} from '../types/stream-player'
import { getPlexClientId } from './player'

export interface PlexConnectInfoData {
  baseUrl?: string
  base_url?: string
  token?: string
  ratingKey?: string
  rating_key?: string
  serverId?: string
  server_id?: string
  serverName?: string
  server_name?: string
  provider?: string
  providerLabel?: string
  provider_label?: string
  title?: string
  mediaType?: 'movie' | 'show' | 'episode'
  media_type?: 'movie' | 'show' | 'episode'
  seasonNumber?: number
  season_number?: number
  episodeNumber?: number
  episode_number?: number
  episodeTitle?: string
  episode_title?: string
  viewOffset?: number
  view_offset?: number
  duration?: number
  progressPercent?: number
  progress_percent?: number
  viewed?: boolean
  baseUrls?: string[]
  base_urls?: string[]
  directUrl?: string
  direct_url?: string
  hlsUrl?: string
  hls_url?: string
  container?: string
  videoCodec?: string
  video_codec?: string
  audioCodec?: string
  audio_codec?: string
  audioTracks?: AudioTrack[]
  audio_tracks?: AudioTrack[]
  subtitles?: SubtitleTrack[]
  partKey?: string
  part_key?: string
  year?: number
}

export interface BuildPlexPlaybackOptions {
  title?: string
  subtitle?: string
  episodeContext?: EpisodeContext
  customSessionId?: string
  clientId?: string
}

export const buildPlexHlsUrl = (
  baseUrl: string,
  ratingKey: string,
  token: string,
  playSessionId: string,
  clientId?: string,
): string => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cid = clientId || getPlexClientId()
  return `${cleanBase}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(
    '/library/metadata/' + ratingKey,
  )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&session=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Client-Identifier=${encodeURIComponent(
    cid,
  )}&X-Plex-Session-Identifier=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Playback-Session-Id=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Product=Otix&X-Plex-Platform=Web&X-Plex-Token=${encodeURIComponent(
    token,
  )}`
}

export const buildPlexDirectUrl = (
  baseUrl: string,
  partKeyOrUrl: string,
  token: string,
  playSessionId?: string,
  clientId?: string,
): string => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cid = clientId || getPlexClientId()
  const sid = playSessionId || ''
  if (partKeyOrUrl.startsWith('http://') || partKeyOrUrl.startsWith('https://')) {
    const url = new URL(partKeyOrUrl)
    url.searchParams.set('X-Plex-Token', token)
    if (cid) url.searchParams.set('X-Plex-Client-Identifier', cid)
    if (sid) {
      url.searchParams.set('X-Plex-Session-Identifier', sid)
      url.searchParams.set('X-Plex-Playback-Session-Id', sid)
    }
    url.searchParams.set('X-Plex-Product', 'Otix')
    url.searchParams.set('X-Plex-Platform', 'Web')
    return url.toString()
  }
  const cleanPart = partKeyOrUrl.startsWith('/') ? partKeyOrUrl : `/${partKeyOrUrl}`
  const params = new URLSearchParams()
  params.set('X-Plex-Token', token)
  if (cid) params.set('X-Plex-Client-Identifier', cid)
  if (sid) {
    params.set('X-Plex-Session-Identifier', sid)
    params.set('X-Plex-Playback-Session-Id', sid)
  }
  params.set('X-Plex-Product', 'Otix')
  params.set('X-Plex-Platform', 'Web')
  return `${cleanBase}${cleanPart}?${params.toString()}`
}

export const buildPlexPlaybackSession = (
  info: PlexConnectInfoData,
  options?: BuildPlexPlaybackOptions,
): StreamPlaybackSession => {
  const initialBaseUrl = (info.baseUrl || info.base_url || '').replace(/\/$/, '')
  const token = info.token || ''
  const ratingKey = String(info.ratingKey || info.rating_key || '')
  const playSessionId = options?.customSessionId || 'otix-plex-' + Date.now().toString(36)
  const clientId = options?.clientId || getPlexClientId()

  const rawBaseUrls = info.baseUrls || info.base_urls || []
  const baseUrls = Array.from(
    new Set([initialBaseUrl, ...rawBaseUrls].filter((u): u is string => Boolean(u))),
  )

  let baseUrl = initialBaseUrl
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    baseUrl.startsWith('http://')
  ) {
    const secureUrl = baseUrls.find((u) => u.startsWith('https://'))
    if (secureUrl) {
      baseUrl = secureUrl
    }
  }

  const hlsUrl = buildPlexHlsUrl(baseUrl, ratingKey, token, playSessionId, clientId)

  const directPartKey = info.partKey || info.part_key
  const directUrl = directPartKey
    ? buildPlexDirectUrl(baseUrl, directPartKey, token, playSessionId, clientId)
    : info.directUrl || info.direct_url
      ? buildPlexDirectUrl(baseUrl, (info.directUrl || info.direct_url)!, token, playSessionId, clientId)
      : undefined

  const audioTracks: AudioTrack[] = (info.audioTracks || info.audio_tracks || []).map((a) => ({
    id: String(a.id),
    index: Number(a.index),
    label: a.label || 'Audio',
    language: a.language || 'und',
    codec: a.codec || 'aac',
    channels: Number(a.channels) || 2,
    isDefault: a.isDefault,
  }))

  const subtitles: SubtitleTrack[] = (info.subtitles || []).map((s) => ({
    id: String(s.id),
    index: Number(s.index),
    label: s.label || 'Subtitles',
    language: s.language || 'und',
    url: s.url,
    format: s.format || 'vtt',
    isExternal: Boolean(s.isExternal),
    requiresBurnIn: Boolean(s.requiresBurnIn),
  }))

  const seasonNum = info.seasonNumber ?? info.season_number
  const episodeNum = info.episodeNumber ?? info.episode_number
  const episodeTitle = info.episodeTitle || info.episode_title

  const episodeContext: EpisodeContext | undefined =
    options?.episodeContext ||
    (seasonNum != null && episodeNum != null
      ? {
          seriesTitle: info.serverName || info.server_name || 'Show',
          seasonNumber: seasonNum,
          episodeNumber: episodeNum,
          episodeTitle: episodeTitle || `Episode ${episodeNum}`,
        }
      : undefined)

  const viewOffset = Number(info.viewOffset ?? info.view_offset ?? 0)
  const duration = Number(info.duration ?? 0)

  return {
    source: 'plex',
    serverUrl: baseUrl,
    token,
    itemId: ratingKey,
    title: options?.title || info.title || (episodeContext ? episodeContext.seriesTitle : 'Movie'),
    subtitle:
      options?.subtitle ||
      (episodeContext
        ? `S${episodeContext.seasonNumber}:E${episodeContext.episodeNumber} · ${episodeContext.episodeTitle}`
        : info.year
          ? String(info.year)
          : undefined),
    playSessionId,
    clientId,
    directUrl,
    hlsUrl,
    audioTracks,
    subtitles,
    startPositionMs: viewOffset,
    durationMs: duration,
    container: info.container || 'mp4',
    videoCodec: info.videoCodec || info.video_codec || 'h264',
    audioCodec: info.audioCodec || info.audio_codec || 'aac',
    episodeContext,
    baseUrls,
  }
}

export const switchPlexSessionServer = (
  session: StreamPlaybackSession,
  newServerUrl: string,
): StreamPlaybackSession => {
  const oldBase = session.serverUrl.replace(/\/$/, '')
  const newBase = newServerUrl.replace(/\/$/, '')

  if (oldBase === newBase) return session

  const newHlsUrl = buildPlexHlsUrl(
    newBase,
    session.itemId,
    session.token,
    session.playSessionId,
    session.clientId,
  )

  const newDirectUrl = session.directUrl
    ? session.directUrl.startsWith(oldBase)
      ? session.directUrl.replace(oldBase, newBase)
      : session.directUrl
    : undefined

  const newSubtitles = session.subtitles.map((sub) => {
    if (sub.url && sub.url.startsWith(oldBase)) {
      return { ...sub, url: sub.url.replace(oldBase, newBase) }
    }
    return sub
  })

  return {
    ...session,
    serverUrl: newBase,
    hlsUrl: newHlsUrl,
    directUrl: newDirectUrl,
    subtitles: newSubtitles,
  }
}
