import { useCallback, useMemo } from 'react'
import { usePlexPlayer, type PlexTrackInfo } from './hooks/use-plex-player'
import { useJellyfinPlayer, type JellyfinTrackInfo } from './hooks/use-jellyfin-player'
import { useLocalPlayer } from './hooks/use-local-player'
import { useMediaSessionSync } from './hooks/use-media-session-sync'
import type { LocalTrackInfo, PlayerContextValue, PlayerSource, PlayerTrackInfo, RepeatMode } from './types'
import { mapPlexTrack, mapJellyfinTrack, mapLocalTrack } from './utils'
import { PlayerContext } from './player-context'

export const PlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const local = useLocalPlayer()
  const plex = usePlexPlayer()
  const jellyfin = useJellyfinPlayer()

  const source: PlayerSource = useMemo(() => {
    if (local.currentTrack) return 'local'
    if (plex.currentTrack) return 'plex'
    if (jellyfin.currentTrack) return 'jellyfin'
    return 'none'
  }, [local.currentTrack, plex.currentTrack, jellyfin.currentTrack])

  const currentTrack: PlayerTrackInfo | null = useMemo(() => {
    if (source === 'local' && local.currentTrack) return mapLocalTrack(local.currentTrack)
    if (source === 'plex' && plex.currentTrack) return mapPlexTrack(plex.currentTrack)
    if (source === 'jellyfin' && jellyfin.currentTrack) return mapJellyfinTrack(jellyfin.currentTrack)
    return null
  }, [source, local.currentTrack, plex.currentTrack, jellyfin.currentTrack])

  const togglePlay = useCallback(async () => {
    if (source === 'local') local.togglePlay()
    else if (source === 'plex') plex.togglePlay()
    else if (source === 'jellyfin') jellyfin.togglePlay()
  }, [source, local, plex, jellyfin])

  const skipNext = useCallback(async () => {
    if (source === 'local') await local.skipNext()
    else if (source === 'plex') await plex.skipNext()
    else if (source === 'jellyfin') jellyfin.skipNext()
  }, [source, local, plex, jellyfin])

  const skipPrevious = useCallback(async () => {
    if (source === 'local') await local.skipPrevious()
    else if (source === 'plex') await plex.skipPrevious()
    else if (source === 'jellyfin') jellyfin.skipPrevious()
  }, [source, local, plex, jellyfin])

  const seek = useCallback(async (ms: number) => {
    if (source === 'local') local.seek(ms)
    else if (source === 'plex') plex.seek(ms)
    else if (source === 'jellyfin') jellyfin.seek(ms)
  }, [source, local, plex, jellyfin])

  const setVolume = useCallback((vol: number) => {
    local.setVolume(vol)
    plex.setVolume(vol)
    jellyfin.setVolume(vol)
  }, [local, plex, jellyfin])

  const stop = useCallback(() => {
    if (source === 'local') local.stop()
    else if (source === 'plex') plex.stop()
    else if (source === 'jellyfin') jellyfin.stop()
  }, [source, local, plex, jellyfin])

  const playLocalTrack = useCallback(async (track: LocalTrackInfo) => {
    plex.stop()
    jellyfin.stop()
    return local.playTrack(track)
  }, [local, plex, jellyfin])

  const playLocalTracks = useCallback(async (tracks: LocalTrackInfo[], startIndex?: number) => {
    plex.stop()
    jellyfin.stop()
    return local.playTracks(tracks, startIndex)
  }, [local, plex, jellyfin])

  const playPlexTrack = useCallback(async (track: PlexTrackInfo) => {
    local.stop()
    jellyfin.stop()
    return plex.playTrack(track)
  }, [local, plex, jellyfin])

  const playPlexAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex?: number) => {
    local.stop()
    jellyfin.stop()
    return plex.playAlbum(tracks, startIndex)
  }, [local, plex, jellyfin])

  const playJellyfinTrack = useCallback(async (track: JellyfinTrackInfo) => {
    local.stop()
    plex.stop()
    return jellyfin.playTrack(track)
  }, [local, plex, jellyfin])

  const playJellyfinAlbum = useCallback(async (tracks: JellyfinTrackInfo[], startIndex?: number) => {
    local.stop()
    plex.stop()
    return jellyfin.playAlbum(tracks, startIndex)
  }, [local, plex, jellyfin])

  const isPlaying =
    source === 'local' ? local.isPlaying : source === 'plex' ? plex.isPlaying : source === 'jellyfin' ? jellyfin.isPlaying : false
  const volume =
    source === 'local' ? local.volume : source === 'plex' ? plex.volume : source === 'jellyfin' ? jellyfin.volume : 0.7
  const error =
    source === 'local' ? local.error : source === 'plex' ? plex.error : source === 'jellyfin' ? jellyfin.error : null

  // Polymorphic repeat & shuffle
  const repeatMode: RepeatMode = source === 'plex' ? plex.repeatMode : local.repeatMode
  const isShuffled: boolean = source === 'plex' ? plex.isShuffled : local.isShuffled

  const toggleShuffle = useCallback(() => {
    if (source === 'local') local.toggleShuffle()
    else if (source === 'plex') plex.toggleShuffle()
  }, [source, local, plex])

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    if (source === 'local') local.setRepeatMode(mode)
    else if (source === 'plex') plex.setRepeatMode(mode)
  }, [source, local, plex])

  const removeFromQueue = useCallback((index: number) => {
    if (source === 'local') local.removeFromQueue(index)
    else if (source === 'plex') plex.removeFromQueue(index)
  }, [source, local, plex])

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    if (source === 'local') local.moveQueueItem(fromIndex, toIndex)
    else if (source === 'plex') plex.moveQueueItem(fromIndex, toIndex)
  }, [source, local, plex])

  // Backward-compatible position & duration: reads source state (updated on seek/load, decoupled from 4Hz timeupdate)
  const position = source === 'local' ? local.position : source === 'plex' ? plex.position : source === 'jellyfin' ? jellyfin.position : 0
  const duration = (source === 'local' ? local.duration : source === 'plex' ? plex.duration : source === 'jellyfin' ? jellyfin.duration : 0) || (currentTrack?.durationMs ?? 0)

  useMediaSessionSync({
    currentTrack,
    isPlaying,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
  })

  const value: PlayerContextValue = useMemo(() => ({
    source,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    error,
    repeatMode,
    isShuffled,
    toggleShuffle,
    setRepeatMode,
    removeFromQueue,
    moveQueueItem,
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
    playLocalTrack,
    playLocalTracks,
    skipLocalToIndex: local.skipToIndex,
    plexQueue: plex.queue,
    plexPreviousTracks: plex.previousTracks,
    jellyfinQueue: jellyfin.queue,
    jellyfinPreviousTracks: jellyfin.previousTracks,
    localQueue: local.queue,
    localPreviousTracks: local.previousTracks,
  }), [
    source,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    error,
    repeatMode,
    isShuffled,
    toggleShuffle,
    setRepeatMode,
    removeFromQueue,
    moveQueueItem,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    stop,
    playPlexTrack,
    playPlexAlbum,
    plex.skipToIndex,
    playJellyfinTrack,
    playJellyfinAlbum,
    jellyfin.skipToIndex,
    playLocalTrack,
    playLocalTracks,
    local.skipToIndex,
    plex.queue,
    plex.previousTracks,
    jellyfin.queue,
    jellyfin.previousTracks,
    local.queue,
    local.previousTracks,
  ])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}
