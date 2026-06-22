// TODO: Review this file
import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import { useSpotifyPlayer } from './spotify-player-provider'
import { usePlexPlayer, type PlexTrackInfo } from './plex-audio-provider'
import type { PlayerContextValue, PlayerSource, PlayerTrackInfo } from './types'

const PlayerContext = createContext<PlayerContextValue | null>(null)

function mapSpotifyTrack(track: {
  id: string
  uri: string
  name: string
  artist: string
  artists: Array<{ name: string; uri: string }>
  albumName: string
  albumArt: string | null
  durationMs: number
}): PlayerTrackInfo {
  return {
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artist,
    artists: track.artists,
    albumName: track.albumName,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    source: 'spotify',
  }
}

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
  const spotify = useSpotifyPlayer()
  const plex = usePlexPlayer()
  const lastActivatedRef = useRef<PlayerSource>('none')

  const source: PlayerSource = useMemo(() => {
    if (lastActivatedRef.current === 'plex') {
      if (plex.currentTrack) return 'plex'
      if (spotify.isReady && spotify.isPlaying && spotify.currentTrack) return 'spotify'
    }
    if (spotify.isReady && spotify.isPlaying && spotify.currentTrack) return 'spotify'
    if (plex.isPlaying && plex.currentTrack) return 'plex'
    if (lastActivatedRef.current === 'spotify' && spotify.isReady && spotify.currentTrack) return 'spotify'
    if (lastActivatedRef.current === 'plex' && plex.currentTrack) return 'plex'
    return 'none'
  }, [spotify.isPlaying, spotify.currentTrack, spotify.isReady, plex.isPlaying, plex.currentTrack])

  const currentTrack: PlayerTrackInfo | null = useMemo(() => {
    if (source === 'spotify' && spotify.currentTrack) return mapSpotifyTrack(spotify.currentTrack)
    if (source === 'plex' && plex.currentTrack) return mapPlexTrack(plex.currentTrack)
    return null
  }, [source, spotify.currentTrack, plex.currentTrack])

  const togglePlay = useCallback(async () => {
    if (source === 'spotify') await spotify.togglePlay()
    else if (source === 'plex') plex.togglePlay()
  }, [source, spotify.togglePlay, plex.togglePlay])

  const skipNext = useCallback(async () => {
    if (source === 'spotify') await spotify.skipNext()
    else if (source === 'plex') await plex.skipNext()
  }, [source, spotify.skipNext, plex.skipNext])

  const skipPrevious = useCallback(async () => {
    if (source === 'spotify') await spotify.skipPrevious()
    else if (source === 'plex') await plex.skipPrevious()
  }, [source, spotify.skipPrevious, plex.skipPrevious])

  const seek = useCallback(async (ms: number) => {
    if (source === 'spotify') await spotify.seek(ms)
    else if (source === 'plex') plex.seek(ms)
  }, [source, spotify.seek, plex.seek])

  const setVolume = useCallback((vol: number) => {
    if (source === 'spotify') spotify.setVolume(vol)
    else if (source === 'plex') plex.setVolume(vol)
  }, [source, spotify.setVolume, plex.setVolume])

  const stop = useCallback(() => {
    lastActivatedRef.current = 'none'
    if (source === 'spotify') spotify.togglePlay()
    else if (source === 'plex') plex.stop()
  }, [source, spotify.togglePlay, plex.stop])

  const playSpotify = useCallback(async (spotifyUri: string) => {
    lastActivatedRef.current = 'spotify'
    return spotify.play(spotifyUri)
  }, [spotify.play])

  const playSpotifyQueue = useCallback(async (uris: string[]) => {
    lastActivatedRef.current = 'spotify'
    return spotify.playWithQueue(uris)
  }, [spotify.playWithQueue])

  const playPlexTrack = useCallback(async (track: PlexTrackInfo) => {
    lastActivatedRef.current = 'plex'
    return plex.playTrack(track)
  }, [plex.playTrack])

  const playPlexAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex?: number) => {
    lastActivatedRef.current = 'plex'
    return plex.playAlbum(tracks, startIndex)
  }, [plex.playAlbum])

  const value: PlayerContextValue = {
    source,
    isPlaying: source === 'spotify' ? spotify.isPlaying : source === 'plex' ? plex.isPlaying : false,
    currentTrack,
    position: source === 'spotify' ? spotify.position : source === 'plex' ? plex.position : 0,
    duration: source === 'spotify' ? spotify.duration : source === 'plex' ? plex.duration : 0,
    volume: source === 'spotify' ? spotify.volume : source === 'plex' ? plex.volume : 0.5,
    error: source === 'spotify' ? spotify.error : source === 'plex' ? plex.error : null,
    togglePlay, skipNext, skipPrevious, seek, setVolume, stop,
    dismissError: spotify.dismissError,
    playSpotify, playSpotifyQueue, addToQueue: spotify.addToQueue, setSpotifyQueueMetadata: spotify.setQueueMetadata,
    playPlexTrack, playPlexAlbum, skipPlexToIndex: plex.skipToIndex,
    spotifyNextTracks: spotify.nextTracks, spotifyPreviousTracks: spotify.previousTracks,
    spotifyIsReady: spotify.isReady, spotifyAvailableDevices: spotify.availableDevices, spotifySelectDevice: spotify.selectDevice,
    plexQueue: plex.queue, plexPreviousTracks: plex.previousTracks,
  }

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

const defaultContextValue: PlayerContextValue = {
  source: 'none', isPlaying: false, currentTrack: null, position: 0, duration: 0, volume: 0.5, error: null,
  togglePlay: async () => {}, skipNext: async () => {}, skipPrevious: async () => {}, seek: async () => {}, setVolume: () => {}, stop: () => {}, dismissError: () => {},
  playSpotify: async () => {}, playSpotifyQueue: async () => {}, addToQueue: async () => {}, setSpotifyQueueMetadata: () => {},
  playPlexTrack: async () => {}, playPlexAlbum: async () => {}, skipPlexToIndex: () => {},
  spotifyNextTracks: [], spotifyPreviousTracks: [], spotifyIsReady: false, spotifyAvailableDevices: [], spotifySelectDevice: async () => {},
  plexQueue: [], plexPreviousTracks: [],
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  return ctx ?? defaultContextValue
}
