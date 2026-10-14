import type { PlexTrackInfo } from './plex-audio-provider'
import type { JellyfinTrackInfo } from './jellyfin-audio-provider'
import type { PlayerTrackInfo } from './types'

export const mapPlexTrack = (track: PlexTrackInfo): PlayerTrackInfo => {
  return {
    id: track.ratingKey,
    title: track.title,
    artist: track.artist,
    artists: track.artist ? [{ name: track.artist, uri: '' }] : [],
    albumName: track.albumName,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    source: 'plex',
  }
}

export const mapJellyfinTrack = (track: JellyfinTrackInfo): PlayerTrackInfo => {
  return {
    id: track.itemId,
    title: track.title,
    artist: track.artist,
    artists: track.artist ? [{ name: track.artist, uri: '' }] : [],
    albumName: track.albumName,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    source: 'jellyfin',
  }
}

export const generateUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (e.g. plain HTTP over remote IP)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      +c ^
      ((typeof crypto !== 'undefined' && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint8Array(1))[0]
        : Math.floor(Math.random() * 256)) &
        (15 >> (+c / 4)))
    ).toString(16),
  )
}

export const PLEX_CLIENT_ID_KEY = 'otix_plex_client_id'

export const getPlexClientId = (): string => {
  let id =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(PLEX_CLIENT_ID_KEY) || localStorage.getItem('plex-client-id')
      : null
  if (!id) {
    id = generateUuid()
    if (typeof localStorage !== 'undefined') localStorage.setItem(PLEX_CLIENT_ID_KEY, id)
  }
  return id
}

export const generateSessionId = (): string => {
  return generateUuid()
}

export const JELLYFIN_CLIENT_ID_KEY = 'jellyfin-audio-client-id'

export const getJellyfinClientId = (): string => {
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem(JELLYFIN_CLIENT_ID_KEY) : null
  if (!id) {
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'otix-jf-aud-' + Date.now().toString(36)
    if (typeof localStorage !== 'undefined') localStorage.setItem(JELLYFIN_CLIENT_ID_KEY, id)
  }
  return id
}
