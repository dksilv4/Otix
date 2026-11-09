import type { PlayableMediaItem } from '../types/item'
import type { StreamPlaybackSession } from '@/features/media/types/stream-player'
import type {
  PlayerTrackInfo,
  PlexTrackInfo,
  JellyfinTrackInfo,
  LocalTrackInfo,
} from '@/lib/player/types'

export const plexTrackToPlayableItem = (track: PlexTrackInfo): PlayableMediaItem => ({
  id: `plex:${track.ratingKey || track.id}`,
  source: 'plex',
  mediaType: 'audio',
  subtype: 'track',
  title: track.title,
  subtitle: track.artist,
  albumOrShowTitle: track.albumName,
  artworkUrl: track.albumArt,
  duration: (track.durationMs || 0) / 1000,
  providerData: {
    ...track,
    baseUrl: track.plexBaseUrl,
    token: track.plexToken,
    partKey: track.partKey,
  },
})

export const jellyfinTrackToPlayableItem = (track: JellyfinTrackInfo): PlayableMediaItem => ({
  id: `jellyfin:${track.itemId || track.id}`,
  source: 'jellyfin',
  mediaType: 'audio',
  subtype: 'track',
  title: track.title,
  subtitle: track.artist,
  albumOrShowTitle: track.albumName,
  artworkUrl: track.albumArt,
  duration: (track.durationMs || 0) / 1000,
  providerData: {
    ...track,
    serverUrl: track.serverUrl,
    token: track.token,
    itemId: track.itemId,
  },
})

export const localTrackToPlayableItem = (track: LocalTrackInfo): PlayableMediaItem => ({
  id: track.id || `local-audio-${encodeURIComponent(track.path || track.url)}`,
  source: 'local',
  mediaType: 'audio',
  subtype: 'track',
  title: track.title,
  subtitle: track.artist,
  albumOrShowTitle: track.albumName,
  artworkUrl: track.albumArt,
  duration: (track.durationMs || 0) / 1000,
  providerData: {
    ...track,
    url: track.url,
    path: track.path,
  },
})

export const trackToPlayableItem = (track: any, source: string): PlayableMediaItem => {
  if (source === 'plex') {
    return plexTrackToPlayableItem(track as PlexTrackInfo)
  }
  if (source === 'jellyfin') {
    return jellyfinTrackToPlayableItem(track as JellyfinTrackInfo)
  }
  return localTrackToPlayableItem(track as LocalTrackInfo)
}

export const streamSessionToPlayableItem = (session: StreamPlaybackSession): PlayableMediaItem => ({
  id: `${session.source}:${session.itemId}`,
  source: session.source,
  mediaType: 'video',
  subtype: session.episodeContext ? 'episode' : 'movie',
  title: session.title,
  subtitle: session.subtitle,
  albumOrShowTitle: session.episodeContext?.seriesTitle,
  artworkUrl: undefined,
  backdropUrl: undefined,
  duration: (session.durationMs || 0) / 1000,
  startPosition: (session.startPositionMs || 0) / 1000,
  providerData: { ...session },
  episodeContext: session.episodeContext,
})

export const playableItemToTrack = (item: PlayableMediaItem): PlayerTrackInfo => ({
  id: item.id.replace(/^[^:]+:/, ''),
  uri: item.id,
  title: item.title,
  artist: item.subtitle || 'Unknown Artist',
  artists: item.subtitle ? [{ name: item.subtitle, uri: '' }] : [],
  albumName: item.albumOrShowTitle || 'Unknown Album',
  albumArt: item.artworkUrl || null,
  durationMs: Math.round((item.duration || 0) * 1000),
  source: (item.source as any) || 'none',
})

export const playableItemToPlexTrack = (item: PlayableMediaItem): PlexTrackInfo => ({
  id: item.id.replace(/^plex:/, ''),
  ratingKey: item.id.replace(/^plex:/, ''),
  title: item.title,
  artist: item.subtitle || 'Unknown Artist',
  albumName: item.albumOrShowTitle || 'Unknown Album',
  albumArt: item.artworkUrl || null,
  durationMs: Math.round((item.duration || 0) * 1000),
  plexBaseUrl: item.providerData?.serverUrl || item.providerData?.baseUrl || null,
  plexToken: item.providerData?.token || null,
  partKey: item.providerData?.partKey || null,
})

export const playableItemToJellyfinTrack = (item: PlayableMediaItem): JellyfinTrackInfo => ({
  id: item.id.replace(/^jellyfin:/, ''),
  itemId: item.id.replace(/^jellyfin:/, ''),
  title: item.title,
  artist: item.subtitle || 'Unknown Artist',
  albumName: item.albumOrShowTitle || 'Unknown Album',
  albumArt: item.artworkUrl || null,
  durationMs: Math.round((item.duration || 0) * 1000),
  serverUrl: item.providerData?.serverUrl || null,
  token: item.providerData?.token || null,
})

export const playableItemToLocalTrack = (item: PlayableMediaItem): LocalTrackInfo => ({
  id: item.id,
  url: item.providerData?.url || '',
  title: item.title,
  artist: item.subtitle || 'Local Artist',
  albumName: item.albumOrShowTitle || 'Local Album',
  albumArt: item.artworkUrl || null,
  durationMs: Math.round((item.duration || 0) * 1000),
  path: item.providerData?.path,
})
