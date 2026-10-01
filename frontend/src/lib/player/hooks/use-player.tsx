import { createContext, useCallback, useContext, useMemo } from 'react'
import { usePlexPlayer, type PlexTrackInfo } from '../plex-audio-provider'
import { useJellyfinPlayer, type JellyfinTrackInfo } from '../jellyfin-audio-provider'
import type { PlayerContextValue, PlayerSource, PlayerTrackInfo } from '../types'

const PlayerContext = createContext<PlayerContextValue | null>(null)

function mapPlexTrack(track: PlexTrackInfo): PlayerTrackInfo {
  return {
    id: track.ratingKey,
    title: track.title,
    artist: track.artist,
    artists: track.artist
      ? [{ name: track.artist, uri: '' }]
      : [],
    albumName: track.albumName,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    source: 'plex',
  }
}

function mapJellyfinTrack(track: JellyfinTrackInfo): PlayerTrackInfo {
  return {
    id: track.itemId,
    title: track.title,
    artist: track.artist,
    artists: track.artist
      ? [{ name: track.artist, uri: '' }]
      : [],
    albumName: track.albumName,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    source: 'jellyfin',
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const plex = usePlexPlayer()
  const jellyfin = useJellyfinPlayer()

  const source: PlayerSource = useMemo(() => {
    if (plex.currentTrack) return 'plex'
    if (jellyfin.currentTrack) return 'jellyfin'
    return 'none'
  }, [plex.currentTrack, jellyfin.currentTrack])

  const currentTrack: PlayerTrackInfo | null = useMemo(() => {
    if (source === 'plex' && plex.currentTrack) return mapPlexTrack(plex.currentTrack)
    if (source === 'jellyfin' && jellyfin.currentTrack) return mapJellyfinTrack(jellyfin.currentTrack)
    return null
  }, [source, plex.currentTrack, jellyfin.currentTrack])

  const togglePlay = useCallback(async () => {
    if (source === 'plex') plex.togglePlay()
    else if (source === 'jellyfin') jellyfin.togglePlay()
  }, [source, plex, jellyfin])

  const skipNext = useCallback(async () => {
    if (source === 'plex') await plex.skipNext()
    else if (source === 'jellyfin') jellyfin.skipNext()
  }, [source, plex, jellyfin])

  const skipPrevious = useCallback(async () => {
    if (source === 'plex') await plex.skipPrevious()
    else if (source === 'jellyfin') jellyfin.skipPrevious()
  }, [source, plex, jellyfin])

  const seek = useCallback(async (ms: number) => {
    if (source === 'plex') plex.seek(ms)
    else if (source === 'jellyfin') jellyfin.seek(ms)
  }, [source, plex, jellyfin])

  const setVolume = useCallback((vol: number) => {
    if (source === 'plex') plex.setVolume(vol)
    else if (source === 'jellyfin') jellyfin.setVolume(vol)
  }, [source, plex, jellyfin])

  const stop = useCallback(() => {
    if (source === 'plex') plex.stop()
    else if (source === 'jellyfin') jellyfin.stop()
  }, [source, plex, jellyfin])

  const playPlexTrack = useCallback(async (track: PlexTrackInfo) => {
    jellyfin.stop()
    return plex.playTrack(track)
  }, [plex, jellyfin])

  const playPlexAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex?: number) => {
    jellyfin.stop()
    return plex.playAlbum(tracks, startIndex)
  }, [plex, jellyfin])

  const playJellyfinTrack = useCallback(async (track: JellyfinTrackInfo) => {
    plex.stop()
    return jellyfin.playTrack(track)
  }, [plex, jellyfin])

  const playJellyfinAlbum = useCallback(async (tracks: JellyfinTrackInfo[], startIndex?: number) => {
    plex.stop()
    return jellyfin.playAlbum(tracks, startIndex)
  }, [plex, jellyfin])

  const isPlaying = source === 'plex' ? plex.isPlaying : source === 'jellyfin' ? jellyfin.isPlaying : false
  const position = source === 'plex' ? plex.position : source === 'jellyfin' ? jellyfin.position : 0
  const duration = source === 'plex' ? plex.duration : source === 'jellyfin' ? jellyfin.duration : 0
  const volume = source === 'plex' ? plex.volume : source === 'jellyfin' ? jellyfin.volume : 0.5
  const error = source === 'plex' ? plex.error : source === 'jellyfin' ? jellyfin.error : null

  const value: PlayerContextValue = {
    source,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    error,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    stop,
    playPlexTrack,
    playPlexAlbum,
    skipPlexToIndex: plex.skipToIndex,
    playJellyfinTrack,
    playJellyfinAlbum,
    skipJellyfinToIndex: jellyfin.skipToIndex,
    plexQueue: plex.queue,
    plexPreviousTracks: plex.previousTracks,
    jellyfinQueue: jellyfin.queue,
    jellyfinPreviousTracks: jellyfin.previousTracks,
  }

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

const defaultContextValue: PlayerContextValue = {
  source: 'none',
  isPlaying: false,
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 0.5,
  error: null,
  togglePlay: async () => {},
  skipNext: async () => {},
  skipPrevious: async () => {},
  seek: async () => {},
  setVolume: () => {},
  stop: () => {},
  playPlexTrack: async () => {},
  playPlexAlbum: async () => {},
  skipPlexToIndex: () => {},
  playJellyfinTrack: async () => {},
  playJellyfinAlbum: async () => {},
  skipJellyfinToIndex: () => {},
  plexQueue: [],
  plexPreviousTracks: [],
  jellyfinQueue: [],
  jellyfinPreviousTracks: [],
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  return ctx ?? defaultContextValue
}
