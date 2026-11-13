import type {
  StreamPlaybackSession,
  AudioTrack,
  SubtitleTrack,
  EpisodeContext,
  StreamQualityOption,
} from '../types/stream-player'
import { getPlexClientId } from './player'
import { apiClient } from '@/lib/api/client'

export interface PlexConnectInfoData {
  isSharedServer?: boolean
  is_shared_server?: boolean
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
  offsetSeconds?: number
}

export interface PlexHlsQualityOptions {
  maxVideoBitrate?: number
  videoResolution?: string
  audioStreamID?: string | number
  subtitleStreamID?: string | number
  subtitles?: string
  offsetSeconds?: number
}

export const buildPlexHlsUrl = (
  baseUrl: string,
  ratingKey: string,
  token: string,
  playSessionId: string,
  clientId?: string,
  qualityOptions?: PlexHlsQualityOptions,
): string => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cid = clientId || getPlexClientId()
  const subtitlesMode = qualityOptions?.subtitles || (qualityOptions?.subtitleStreamID ? 'sidecar' : 'none')
  let url = `${cleanBase}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(
    '/library/metadata/' + ratingKey,
  )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&subtitles=${encodeURIComponent(
    subtitlesMode,
  )}&session=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Client-Identifier=${encodeURIComponent(
    cid,
  )}&X-Plex-Session-Identifier=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Playback-Session-Id=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Product=Otix&X-Plex-Platform=Chrome&X-Plex-Token=${encodeURIComponent(
    token,
  )}`

  if (qualityOptions?.maxVideoBitrate) {
    url += `&maxVideoBitrate=${qualityOptions.maxVideoBitrate}`
  }
  if (qualityOptions?.videoResolution) {
    url += `&videoResolution=${encodeURIComponent(qualityOptions.videoResolution)}`
  }
  if (qualityOptions?.audioStreamID != null) {
    url += `&audioStreamID=${encodeURIComponent(String(qualityOptions.audioStreamID))}`
  }
  if (qualityOptions?.subtitleStreamID != null) {
    url += `&subtitleStreamID=${encodeURIComponent(String(qualityOptions.subtitleStreamID))}`
  }
  if (qualityOptions?.offsetSeconds != null && qualityOptions.offsetSeconds > 0) {
    url += `&offset=${Math.floor(qualityOptions.offsetSeconds)}&copyts=1`
  }

  return url
}

export const buildPlexDecisionUrl = (
  baseUrl: string,
  ratingKey: string,
  token: string,
  playSessionId: string,
  clientId?: string,
  qualityOptions?: PlexHlsQualityOptions,
): string => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cid = clientId || getPlexClientId()
  const subtitlesMode = qualityOptions?.subtitles || (qualityOptions?.subtitleStreamID ? 'sidecar' : 'none')
  let url = `${cleanBase}/video/:/transcode/universal/decision?path=${encodeURIComponent(
    '/library/metadata/' + ratingKey,
  )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&subtitles=${encodeURIComponent(
    subtitlesMode,
  )}&session=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Client-Identifier=${encodeURIComponent(
    cid,
  )}&X-Plex-Session-Identifier=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Playback-Session-Id=${encodeURIComponent(
    playSessionId,
  )}&X-Plex-Product=Otix&X-Plex-Platform=Chrome&X-Plex-Token=${encodeURIComponent(
    token,
  )}`

  if (qualityOptions?.maxVideoBitrate) {
    url += `&maxVideoBitrate=${qualityOptions.maxVideoBitrate}`
  }
  if (qualityOptions?.videoResolution) {
    url += `&videoResolution=${encodeURIComponent(qualityOptions.videoResolution)}`
  }
  if (qualityOptions?.audioStreamID != null) {
    url += `&audioStreamID=${encodeURIComponent(String(qualityOptions.audioStreamID))}`
  }
  if (qualityOptions?.subtitleStreamID != null) {
    url += `&subtitleStreamID=${encodeURIComponent(String(qualityOptions.subtitleStreamID))}`
  }
  if (qualityOptions?.offsetSeconds != null && qualityOptions.offsetSeconds > 0) {
    url += `&offset=${Math.floor(qualityOptions.offsetSeconds)}&copyts=1`
  }

  return url
}

export const selectPlexAudioStream = async (
  baseUrl: string,
  partIdOrUrl: string,
  audioStreamId: string | number,
  token: string,
): Promise<boolean> => {
  if (!baseUrl || !partIdOrUrl || !audioStreamId || !token) return false
  const cleanBase = baseUrl.replace(/\/$/, '')
  const partIdMatch = String(partIdOrUrl).match(/\/library\/parts\/(\d+)/)
  const partId = partIdMatch ? partIdMatch[1] : partIdOrUrl
  try {
    const res = await fetch(
      `${cleanBase}/library/parts/${partId}?audioStreamID=${encodeURIComponent(String(audioStreamId))}&X-Plex-Token=${encodeURIComponent(token)}`,
      { method: 'PUT' },
    )
    return res.ok
  } catch (err) {
    console.warn('[Plex] Failed to update selected audio stream on PMS:', err)
    return false
  }
}

export const triggerPlexDecision = async (
  baseUrl: string,
  ratingKey: string,
  token: string,
  playSessionId: string,
  clientId?: string,
  qualityOptions?: PlexHlsQualityOptions,
): Promise<boolean> => {
  if (!baseUrl || !ratingKey || !token) return false
  try {
    const decisionUrl = buildPlexDecisionUrl(
      baseUrl,
      ratingKey,
      token,
      playSessionId,
      clientId,
      qualityOptions,
    )
    const res = await fetch(decisionUrl, { method: 'GET' })
    return res.ok
  } catch (err) {
    console.warn('[Plex] Failed to trigger transcode decision:', err)
    return false
  }
}

export const buildPlexDirectUrl = (
  baseUrl: string,
  partKeyOrUrl: string,
  token: string,
  _playSessionId?: string,
  clientId?: string,
): string => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cid = clientId || getPlexClientId()
  if (partKeyOrUrl.startsWith('http://') || partKeyOrUrl.startsWith('https://')) {
    const url = new URL(partKeyOrUrl)
    url.searchParams.set('X-Plex-Token', token)
    if (cid) url.searchParams.set('X-Plex-Client-Identifier', cid)
    url.searchParams.set('X-Plex-Product', 'Otix')
    url.searchParams.set('X-Plex-Platform', 'Chrome')
    url.searchParams.delete('X-Plex-Session-Identifier')
    url.searchParams.delete('X-Plex-Playback-Session-Id')
    return url.toString()
  }
  const cleanPart = partKeyOrUrl.startsWith('/') ? partKeyOrUrl : `/${partKeyOrUrl}`
  const params = new URLSearchParams()
  params.set('X-Plex-Token', token)
  if (cid) params.set('X-Plex-Client-Identifier', cid)
  params.set('X-Plex-Product', 'Otix')
  params.set('X-Plex-Platform', 'Chrome')
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

  const directPartKey = info.partKey || info.part_key
  const directUrl = directPartKey
    ? buildPlexDirectUrl(baseUrl, directPartKey, token, playSessionId, clientId)
    : info.directUrl || info.direct_url
      ? buildPlexDirectUrl(baseUrl, (info.directUrl || info.direct_url)!, token, playSessionId, clientId)
      : undefined

  const viewOffset = Number(info.viewOffset ?? info.view_offset ?? 0)
  const duration = Number(info.duration ?? 0)
  const initialOffsetSeconds =
    options?.offsetSeconds != null && options.offsetSeconds > 0
      ? options.offsetSeconds
      : viewOffset > 0
      ? Math.floor(viewOffset / 1000)
      : undefined
  const initialQualityOpts: PlexHlsQualityOptions | undefined = initialOffsetSeconds
    ? { offsetSeconds: initialOffsetSeconds }
    : undefined

  const hlsUrl = buildPlexHlsUrl(
    baseUrl,
    ratingKey,
    token,
    playSessionId,
    clientId,
    initialQualityOpts,
  )
  if (baseUrl && ratingKey && token && !directUrl) {
    void triggerPlexDecision(
      baseUrl,
      ratingKey,
      token,
      playSessionId,
      clientId,
      initialQualityOpts,
    )
  }

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

  const rawContainer = info.container || ''
  let detectedContainer = rawContainer
  if (!detectedContainer) {
    const rawPath = directPartKey || info.directUrl || info.direct_url || ''
    const match = rawPath.match(/\.([a-z0-9]+)(?:[?#]|$)/i)
    if (match) {
      detectedContainer = match[1].toLowerCase()
    }
  }

  return {
    source: 'plex',
    serverUrl: baseUrl,
    token,
    itemId: ratingKey,
    partKey: directPartKey,
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
    container: detectedContainer || 'mp4',
    videoCodec: info.videoCodec || info.video_codec || 'h264',
    audioCodec: info.audioCodec || info.audio_codec || 'aac',
    episodeContext,
    baseUrls,
    isSharedServer: Boolean(info.isSharedServer ?? info.is_shared_server),
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
    session.maxVideoBitrate || session.videoResolution
      ? {
          maxVideoBitrate: session.maxVideoBitrate,
          videoResolution: session.videoResolution,
        }
      : undefined,
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
    isSharedServer: session.isSharedServer,
  }
}

export const updatePlexSessionQuality = (
  session: StreamPlaybackSession,
  qualityOption: StreamQualityOption,
): StreamPlaybackSession => {
  const isAutoOrOriginal = qualityOption.isAuto || qualityOption.isOriginal
  const maxVideoBitrate = isAutoOrOriginal ? undefined : qualityOption.maxVideoBitrate
  const videoResolution = isAutoOrOriginal ? undefined : qualityOption.videoResolution

  const activeAudioTrack =
    session.selectedAudioIndex != null
      ? session.audioTracks.find((a) => a.index === session.selectedAudioIndex)
      : undefined

  const qualityOpts: PlexHlsQualityOptions = {
    maxVideoBitrate,
    videoResolution,
    audioStreamID: activeAudioTrack?.id,
  }

  const baseSessionId = session.playSessionId.split('-q-')[0]
  const newPlaySessionId = `${baseSessionId}-q-${qualityOption.id}`

  const newHlsUrl = buildPlexHlsUrl(
    session.serverUrl,
    session.itemId,
    session.token,
    newPlaySessionId,
    session.clientId,
    qualityOpts,
  )

  if (session.serverUrl && session.itemId && session.token) {
    void triggerPlexDecision(
      session.serverUrl,
      session.itemId,
      session.token,
      newPlaySessionId,
      session.clientId,
      qualityOpts,
    )
  }

  const isTranscode = !qualityOption.isAuto && !qualityOption.isOriginal
  const isDefaultTrack = !activeAudioTrack || session.audioTracks[0]?.index === activeAudioTrack.index
  return {
    ...session,
    playSessionId: newPlaySessionId,
    selectedQuality: qualityOption.id,
    maxVideoBitrate,
    videoResolution,
    hlsUrl: newHlsUrl,
    playbackMethod: isTranscode || !isDefaultTrack ? 'transcode' : session.directUrl ? 'direct-play' : 'transcode',
  }
}

export const updatePlexSessionAudio = (
  session: StreamPlaybackSession,
  audioTrack: AudioTrack,
  currentPositionSeconds?: number,
): StreamPlaybackSession => {
  const partId = session.partKey || session.itemId
  if (session.serverUrl && partId && session.token && audioTrack.id) {
    void selectPlexAudioStream(session.serverUrl, partId, audioTrack.id, session.token)
  }

  // Derive dedicated playSessionId to avoid PMS worker concurrency deadlocks
  const baseSessionId = session.playSessionId.split('-a-')[0]
  const newPlaySessionId = `${baseSessionId}-a-${audioTrack.id}`

  const isAutoOrOriginal =
    !session.selectedQuality || session.selectedQuality === 'auto' || session.selectedQuality === 'original'

  const offset =
    currentPositionSeconds != null && currentPositionSeconds > 0
      ? currentPositionSeconds
      : session.startPositionMs
        ? session.startPositionMs / 1000
        : undefined

  const qualityOpts: PlexHlsQualityOptions = {
    maxVideoBitrate: isAutoOrOriginal ? undefined : session.maxVideoBitrate,
    videoResolution: isAutoOrOriginal ? undefined : session.videoResolution,
    audioStreamID: audioTrack.id,
    offsetSeconds: offset,
  }

  const newHlsUrl = buildPlexHlsUrl(
    session.serverUrl,
    session.itemId,
    session.token,
    newPlaySessionId,
    session.clientId,
    qualityOpts,
  )

  if (session.serverUrl && session.itemId && session.token) {
    void triggerPlexDecision(
      session.serverUrl,
      session.itemId,
      session.token,
      newPlaySessionId,
      session.clientId,
      qualityOpts,
    )
  }

  const isDefaultTrack = session.audioTracks[0]?.index === audioTrack.index
  const isTranscodeQuality =
    Boolean(session.selectedQuality) &&
    session.selectedQuality !== 'auto' &&
    session.selectedQuality !== 'original' &&
    !session.selectedQuality?.startsWith('hls-')
  const canDirectPlay = isDefaultTrack && Boolean(session.directUrl) && !isTranscodeQuality

  return {
    ...session,
    playSessionId: newPlaySessionId,
    selectedAudioIndex: audioTrack.index,
    hlsUrl: newHlsUrl,
    startPositionMs: offset != null ? Math.round(offset * 1000) : session.startPositionMs,
    playbackMethod: canDirectPlay ? 'direct-play' : 'direct-stream',
  }
}

interface CachedConnectInfo {
  data: PlexConnectInfoData
  timestamp: number
}

const connectInfoCache = new Map<string, CachedConnectInfo>()
const secondaryConnectInfoCache = new Map<string, CachedConnectInfo>()
const connectInfoInFlight = new Map<string, Promise<PlexConnectInfoData | null>>()

const CONNECT_INFO_CACHE_TTL_MS = 300_000

export interface FetchPlexConnectInfoParams {
  season?: number | string
  episode?: number | string
  tmdbId?: number | string
  tvdbId?: number | string
  imdbId?: string
  title?: string
  year?: number | string
  mediaType?: string
}

export const fetchPlexConnectInfoCached = async (
  mediaIdentifier: string | number,
  params?: FetchPlexConnectInfoParams,
): Promise<PlexConnectInfoData | null> => {
  const ident = encodeURIComponent(String(mediaIdentifier).trim())
  if (!ident) return null

  const queryParams: Record<string, string> = {}
  if (params?.season != null) queryParams.season = String(params.season)
  if (params?.episode != null) queryParams.episode = String(params.episode)
  if (params?.tmdbId != null) queryParams.tmdbId = String(params.tmdbId)
  if (params?.tvdbId != null) queryParams.tvdbId = String(params.tvdbId)
  if (params?.imdbId) queryParams.imdbId = params.imdbId
  if (params?.title) queryParams.title = params.title
  if (params?.year != null) queryParams.year = String(params.year)
  if (params?.mediaType) queryParams.mediaType = params.mediaType

  const cacheKey = `${ident}:${JSON.stringify(queryParams)}`
  const itemKey = `${ident}:${params?.season ?? ''}:${params?.episode ?? ''}`
  const now = Date.now()

  const cached = connectInfoCache.get(cacheKey)
  if (cached && now - cached.timestamp < CONNECT_INFO_CACHE_TTL_MS) {
    return cached.data
  }

  const secondaryCached = secondaryConnectInfoCache.get(itemKey)
  if (secondaryCached && now - secondaryCached.timestamp < CONNECT_INFO_CACHE_TTL_MS) {
    return secondaryCached.data
  }

  const existingPromise = connectInfoInFlight.get(cacheKey) || connectInfoInFlight.get(itemKey)
  if (existingPromise) {
    return existingPromise
  }

  const fetchPromise = (async () => {
    try {
      const { data } = await apiClient.get<PlexConnectInfoData>(
        `/integrations/plex/connect-info/${ident}`,
        { params: queryParams },
      )
      if (data && (data.ratingKey || data.rating_key)) {
        const entry: CachedConnectInfo = { data, timestamp: Date.now() }
        connectInfoCache.set(cacheKey, entry)
        secondaryConnectInfoCache.set(itemKey, entry)
        return data
      }
      return null
    } catch {
      return null
    } finally {
      connectInfoInFlight.delete(cacheKey)
      connectInfoInFlight.delete(itemKey)
    }
  })()

  connectInfoInFlight.set(cacheKey, fetchPromise)
  connectInfoInFlight.set(itemKey, fetchPromise)
  return fetchPromise
}

export const clearPlexConnectCache = () => {
  connectInfoCache.clear()
  secondaryConnectInfoCache.clear()
  connectInfoInFlight.clear()
}
