import { createContext, useCallback, useContext, useMemo } from 'react'
import { usePlexPlayer, type PlexTrackInfo } from '../plex-audio-provider'
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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const plex = usePlexPlayer()

  const source: PlayerSource = useMemo(() => {
    if (plex.currentTrack) return 'plex'
    return 'none'
  }, [plex.currentTrack])

  const currentTrack: PlayerTrackInfo | null = useMemo(() => {
    if (source === 'plex' && plex.currentTrack) return mapPlexTrack(plex.currentTrack)
    return null
  }, [source, plex.currentTrack])

  const togglePlay = useCallback(async () => {
    if (source === 'plex') plex.togglePlay()
  }, [source, plex.togglePlay])

  const skipNext = useCallback(async () => {
    if (source === 'plex') await plex.skipNext()
  }, [source, plex.skipNext])

  const skipPrevious = useCallback(async () => {
    if (source === 'plex') await plex.skipPrevious()
  }, [source, plex.skipPrevious])

  const seek = useCallback(async (ms: number) => {
    if (source === 'plex') plex.seek(ms)
  }, [source, plex.seek])

  const setVolume = useCallback((vol: number) => {
    if (source === 'plex') plex.setVolume(vol)
  }, [source, plex.setVolume])

  const stop = useCallback(() => {
    if (source === 'plex') plex.stop()
  }, [source, plex.stop])

  const playPlexTrack = useCallback(async (track: PlexTrackInfo) => {
    return plex.playTrack(track)
  }, [plex.playTrack])

  const playPlexAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex?: number) => {
    return plex.playAlbum(tracks, startIndex)
  }, [plex.playAlbum])

  const value: PlayerContextValue = {
    source,
    isPlaying: source === 'plex' ? plex.isPlaying : false,
    currentTrack,
    position: source === 'plex' ? plex.position : 0,
    duration: source === 'plex' ? plex.duration : 0,
    volume: source === 'plex' ? plex.volume : 0.5,
    error: source === 'plex' ? plex.error : null,
    togglePlay, skipNext, skipPrevious, seek, setVolume, stop,
    playPlexTrack, playPlexAlbum, skipPlexToIndex: plex.skipToIndex,
    plexQueue: plex.queue, plexPreviousTracks: plex.previousTracks,
  }

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

const defaultContextValue: PlayerContextValue = {
  source: 'none', isPlaying: false, currentTrack: null, position: 0, duration: 0, volume: 0.5, error: null,
  togglePlay: async () => {}, skipNext: async () => {}, skipPrevious: async () => {}, seek: async () => {}, setVolume: () => {}, stop: () => {},
  playPlexTrack: async () => {}, playPlexAlbum: async () => {}, skipPlexToIndex: () => {},
  plexQueue: [], plexPreviousTracks: [],
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  return ctx ?? defaultContextValue
}
