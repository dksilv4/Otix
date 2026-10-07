import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/providers/auth'
import { useFeature } from '@/features/_config'
import type { PlexSession, PlexSessionsResponse } from '../types'

export function normalizePlexSession(raw: any): PlexSession {
  const sessionId = String(raw.sessionId ?? raw.session_id ?? '')
  const mediaType = String(raw.mediaType ?? raw.media_type ?? '')
  const title = String(raw.title ?? '')
  const grandparentTitle = raw.grandparentTitle ?? raw.grandparent_title ?? null
  const parentTitle = raw.parentTitle ?? raw.parent_title ?? null
  const index = raw.index ?? null
  const thumb = raw.thumb ?? null
  const duration = raw.duration ?? null
  const viewOffset = raw.viewOffset ?? raw.view_offset ?? null
  const state = raw.state ?? 'playing'
  const userName = raw.userName ?? raw.user_name ?? 'Unknown'
  const userThumb = raw.userThumb ?? raw.user_thumb ?? null
  const playerTitle = raw.playerTitle ?? raw.player_title ?? null
  const playerDevice = raw.playerDevice ?? raw.player_device ?? null
  const playerPlatform = raw.playerPlatform ?? raw.player_platform ?? null
  const serverName = raw.serverName ?? raw.server_name ?? ''
  const serverId = raw.serverId ?? raw.server_id ?? ''
  const serverOwned = Boolean(raw.serverOwned ?? raw.server_owned ?? false)
  const ratingKey =
    raw.ratingKey != null
      ? String(raw.ratingKey)
      : raw.rating_key != null
        ? String(raw.rating_key)
        : null
  const grandparentRatingKey =
    raw.grandparentRatingKey != null
      ? String(raw.grandparentRatingKey)
      : raw.grandparent_rating_key != null
        ? String(raw.grandparent_rating_key)
        : null
  const parentRatingKey =
    raw.parentRatingKey != null
      ? String(raw.parentRatingKey)
      : raw.parent_rating_key != null
        ? String(raw.parent_rating_key)
        : null
  const mediaItemId = raw.mediaItemId ?? raw.media_item_id ?? null
  const librarySection = raw.librarySection ?? raw.library_section ?? null
  const year = raw.year ?? null
  const contentRating = raw.contentRating ?? raw.content_rating ?? null
  const summary = raw.summary ?? null
  const videoResolution = raw.videoResolution ?? raw.video_resolution ?? null
  const videoCodec = raw.videoCodec ?? raw.video_codec ?? null
  const audioCodec = raw.audioCodec ?? raw.audio_codec ?? null
  const audioChannels = raw.audioChannels ?? raw.audio_channels ?? null
  const bitrate = raw.bitrate ?? null
  const videoDecision = raw.videoDecision ?? raw.video_decision ?? null
  const audioDecision = raw.audioDecision ?? raw.audio_decision ?? null
  const transcodeReason = raw.transcodeReason ?? raw.transcode_reason ?? null
  const throttled = Boolean(raw.throttled ?? false)

  return {
    // snake_case
    session_id: sessionId,
    media_type: mediaType,
    title,
    grandparent_title: grandparentTitle,
    parent_title: parentTitle,
    index,
    thumb,
    duration,
    view_offset: viewOffset,
    state,
    user_name: userName,
    user_thumb: userThumb,
    player_title: playerTitle,
    player_device: playerDevice,
    player_platform: playerPlatform,
    server_name: serverName,
    server_id: serverId,
    server_owned: serverOwned,
    rating_key: ratingKey,
    grandparent_rating_key: grandparentRatingKey,
    parent_rating_key: parentRatingKey,
    media_item_id: mediaItemId,
    library_section: librarySection,
    year,
    content_rating: contentRating,
    summary,
    video_resolution: videoResolution,
    video_codec: videoCodec,
    audio_codec: audioCodec,
    audio_channels: audioChannels,
    bitrate,
    video_decision: videoDecision,
    audio_decision: audioDecision,
    transcode_reason: transcodeReason,
    throttled,

    // camelCase aliases
    sessionId,
    mediaType,
    grandparentTitle,
    parentTitle,
    viewOffset,
    userName,
    userThumb,
    playerTitle,
    playerDevice,
    playerPlatform,
    serverName,
    serverId,
    serverOwned,
    ratingKey,
    grandparentRatingKey,
    parentRatingKey,
    mediaItemId,
    librarySection,
    contentRating,
    videoResolution,
    videoCodec,
    audioCodec,
    audioChannels,
    videoDecision,
    audioDecision,
    transcodeReason,
  }
}

/** Custom hook to fetch active Plex sessions. */
export function usePlexSessions() {
  const { user: currentUser } = useAuth()
  const plexEnabled = useFeature('integration:plex')
  const hasPlexLinked = Boolean(currentUser?.plexId || (currentUser as any)?.plex_id)

  const query = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse | any>('/integrations/plex/sessions')
      const rawSessions: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.sessions)
          ? data.sessions
          : []

      const isAdmin = Boolean(
        data?.isAdmin ??
          data?.is_admin ??
          rawSessions.some((s: any) => Boolean(s?.serverOwned ?? s?.server_owned))
      )

      const normalized = rawSessions.map(normalizePlexSession)
      // Only keep sessions if the current user is an admin / owner
      const sessions = isAdmin ? normalized : []
      return { sessions, isAdmin }
    },
    refetchInterval: (query) => (query.state.status === 'error' ? false : 15000),
    refetchIntervalInBackground: false,
    staleTime: 10000,
    retry: false,
    enabled: plexEnabled && hasPlexLinked,
    meta: { suppressToast: true },
  })

  const sessions = query.data?.sessions ?? []
  const isAdmin = query.data?.isAdmin ?? false

  return {
    ...query,
    data: sessions,
    sessions,
    isAdmin,
  }
}
