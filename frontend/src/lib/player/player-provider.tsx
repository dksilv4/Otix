import { useCallback, useMemo, useContext, useEffect } from 'react'
import { usePlexPlayer } from './hooks/use-plex-player'
import { useJellyfinPlayer } from './hooks/use-jellyfin-player'
import { useLocalPlayer } from './hooks/use-local-player'
import { useMediaSessionSync } from './hooks/use-media-session-sync'
import type {
  LocalTrackInfo,
  PlayerContextValue,
  PlayerSource,
  PlayerTrackInfo,
  RepeatMode,
  PlexTrackInfo,
  JellyfinTrackInfo,
} from './types'
import { mapPlexTrack, mapJellyfinTrack, mapLocalTrack } from './utils'
import { PlayerContext, playerProgressStore } from './player-context'
import { UniversalPlayerContext } from '@/features/player/core/universal-player-context'
import type { UniversalPlayerContextValue } from '@/features/player/types'
import {
  plexTrackToPlayableItem,
  jellyfinTrackToPlayableItem,
  localTrackToPlayableItem,
  playableItemToTrack,
  playableItemToPlexTrack,
  playableItemToJellyfinTrack,
  playableItemToLocalTrack,
} from '@/features/player/utils/converters'

const UniversalPlayerBridge = ({
  universal,
  children,
}: {
  universal: UniversalPlayerContextValue
  children: React.ReactNode
}) => {
  const source: PlayerSource = useMemo((): PlayerSource => {
    if (!universal.currentItem) return 'none'
    const s = universal.currentItem.source
    if (s === 'local') return 'local'
    if (s === 'plex') return 'plex'
    if (s === 'jellyfin') return 'jellyfin'
    return 'none'
  }, [universal.currentItem])

  const currentTrack: PlayerTrackInfo | null = useMemo(() => {
    if (!universal.currentItem) return null
    return playableItemToTrack(universal.currentItem)
  }, [universal.currentItem])

  // Sync playerProgressStore for high-frequency progress consumers (GlobalMusicBar, etc.)
  useEffect(() => {
    playerProgressStore.setProgress(
      Math.round(universal.position * 1000),
      Math.round(universal.duration * 1000),
    )
  }, [universal.position, universal.duration])

  const playPlexTrack = useCallback(
    async (track: PlexTrackInfo) => {
      await universal.play(plexTrackToPlayableItem(track))
    },
    [universal],
  )

  const playPlexAlbum = useCallback(
    async (tracks: PlexTrackInfo[], startIndex = 0) => {
      const items = tracks.map(plexTrackToPlayableItem)
      const targetList = startIndex > 0 ? items.slice(startIndex) : items
      await universal.play(targetList)
    },
    [universal],
  )

  const playJellyfinTrack = useCallback(
    async (track: JellyfinTrackInfo) => {
      await universal.play(jellyfinTrackToPlayableItem(track))
    },
    [universal],
  )

  const playJellyfinAlbum = useCallback(
    async (tracks: JellyfinTrackInfo[], startIndex = 0) => {
      const items = tracks.map(jellyfinTrackToPlayableItem)
      const targetList = startIndex > 0 ? items.slice(startIndex) : items
      await universal.play(targetList)
    },
    [universal],
  )

  const playLocalTrack = useCallback(
    async (track: LocalTrackInfo) => {
      await universal.play(localTrackToPlayableItem(track))
    },
    [universal],
  )

  const playLocalTracks = useCallback(
    async (tracks: LocalTrackInfo[], startIndex = 0) => {
      const items = tracks.map(localTrackToPlayableItem)
      const targetList = startIndex > 0 ? items.slice(startIndex) : items
      await universal.play(targetList)
    },
    [universal],
  )

  const seek = useCallback(
    async (ms: number) => {
      universal.seek(ms / 1000)
    },
    [universal],
  )

  const plexQueue = useMemo(
    () => universal.queue.filter((i) => i.source === 'plex').map(playableItemToPlexTrack),
    [universal.queue],
  )
  const plexPreviousTracks = useMemo(
    () => universal.history.filter((i) => i.source === 'plex').map(playableItemToPlexTrack),
    [universal.history],
  )
  const jellyfinQueue = useMemo(
    () => universal.queue.filter((i) => i.source === 'jellyfin').map(playableItemToJellyfinTrack),
    [universal.queue],
  )
  const jellyfinPreviousTracks = useMemo(
    () => universal.history.filter((i) => i.source === 'jellyfin').map(playableItemToJellyfinTrack),
    [universal.history],
  )
  const localQueue = useMemo(
    () => universal.queue.filter((i) => i.source === 'local').map(playableItemToLocalTrack),
    [universal.queue],
  )
  const localPreviousTracks = useMemo(
    () => universal.history.filter((i) => i.source === 'local').map(playableItemToLocalTrack),
    [universal.history],
  )

  const value: PlayerContextValue = useMemo(
    () => ({
      source,
      isPlaying: universal.status === 'playing',
      currentTrack,
      position: Math.round(universal.position * 1000),
      duration: Math.round(universal.duration * 1000),
      volume: universal.volume,
      error: universal.error,
      repeatMode: universal.repeatMode,
      isShuffled: universal.isShuffled,
      toggleShuffle: universal.toggleShuffle,
      setRepeatMode: universal.setRepeatMode,
      removeFromQueue: universal.removeFromQueue,
      moveQueueItem: universal.moveQueueItem,
      togglePlay: universal.togglePlay,
      skipNext: universal.skipNext,
      skipPrevious: universal.skipPrevious,
      seek,
      setVolume: universal.setVolume,
      stop: universal.stop,
      playPlexTrack,
      playPlexAlbum,
      skipPlexToIndex: universal.skipToIndex,
      playJellyfinTrack,
      playJellyfinAlbum,
      skipJellyfinToIndex: universal.skipToIndex,
      playLocalTrack,
      playLocalTracks,
      skipLocalToIndex: universal.skipToIndex,
      plexQueue,
      plexPreviousTracks,
      jellyfinQueue,
      jellyfinPreviousTracks,
      localQueue,
      localPreviousTracks,
    }),
    [
      source,
      universal.status,
      currentTrack,
      universal.position,
      universal.duration,
      universal.volume,
      universal.error,
      universal.repeatMode,
      universal.isShuffled,
      universal.toggleShuffle,
      universal.setRepeatMode,
      universal.removeFromQueue,
      universal.moveQueueItem,
      universal.togglePlay,
      universal.skipNext,
      universal.skipPrevious,
      seek,
      universal.setVolume,
      universal.stop,
      playPlexTrack,
      playPlexAlbum,
      universal.skipToIndex,
      playJellyfinTrack,
      playJellyfinAlbum,
      playLocalTrack,
      playLocalTracks,
      plexQueue,
      plexPreviousTracks,
      jellyfinQueue,
      jellyfinPreviousTracks,
      localQueue,
      localPreviousTracks,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

const LegacyPlayerProvider = ({ children }: { children: React.ReactNode }) => {
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

  const seek = useCallback(
    async (ms: number) => {
      if (source === 'local') local.seek(ms)
      else if (source === 'plex') plex.seek(ms)
      else if (source === 'jellyfin') jellyfin.seek(ms)
    },
    [source, local, plex, jellyfin],
  )

  const setVolume = useCallback(
    (vol: number) => {
      local.setVolume(vol)
      plex.setVolume(vol)
      jellyfin.setVolume(vol)
    },
    [local, plex, jellyfin],
  )

  const stop = useCallback(() => {
    if (source === 'local') local.stop()
    else if (source === 'plex') plex.stop()
    else if (source === 'jellyfin') jellyfin.stop()
  }, [source, local, plex, jellyfin])

  const playLocalTrack = useCallback(
    async (track: LocalTrackInfo) => {
      plex.stop()
      jellyfin.stop()
      return local.playTrack(track)
    },
    [local, plex, jellyfin],
  )

  const playLocalTracks = useCallback(
    async (tracks: LocalTrackInfo[], startIndex?: number) => {
      plex.stop()
      jellyfin.stop()
      return local.playTracks(tracks, startIndex)
    },
    [local, plex, jellyfin],
  )

  const playPlexTrack = useCallback(
    async (track: PlexTrackInfo) => {
      local.stop()
      jellyfin.stop()
      return plex.playTrack(track)
    },
    [local, plex, jellyfin],
  )

  const playPlexAlbum = useCallback(
    async (tracks: PlexTrackInfo[], startIndex?: number) => {
      local.stop()
      jellyfin.stop()
      return plex.playAlbum(tracks, startIndex)
    },
    [local, plex, jellyfin],
  )

  const playJellyfinTrack = useCallback(
    async (track: JellyfinTrackInfo) => {
      local.stop()
      plex.stop()
      return jellyfin.playTrack(track)
    },
    [local, plex, jellyfin],
  )

  const playJellyfinAlbum = useCallback(
    async (tracks: JellyfinTrackInfo[], startIndex?: number) => {
      local.stop()
      plex.stop()
      return jellyfin.playAlbum(tracks, startIndex)
    },
    [local, plex, jellyfin],
  )

  const isPlaying =
    source === 'local'
      ? local.isPlaying
      : source === 'plex'
      ? plex.isPlaying
      : source === 'jellyfin'
      ? jellyfin.isPlaying
      : false
  const volume =
    source === 'local'
      ? local.volume
      : source === 'plex'
      ? plex.volume
      : source === 'jellyfin'
      ? jellyfin.volume
      : 0.7
  const error =
    source === 'local'
      ? local.error
      : source === 'plex'
      ? plex.error
      : source === 'jellyfin'
      ? jellyfin.error
      : null

  const repeatMode: RepeatMode = source === 'plex' ? plex.repeatMode : local.repeatMode
  const isShuffled: boolean = source === 'plex' ? plex.isShuffled : local.isShuffled

  const toggleShuffle = useCallback(() => {
    if (source === 'local') local.toggleShuffle()
    else if (source === 'plex') plex.toggleShuffle()
  }, [source, local, plex])

  const setRepeatMode = useCallback(
    (mode: RepeatMode) => {
      if (source === 'local') local.setRepeatMode(mode)
      else if (source === 'plex') plex.setRepeatMode(mode)
    },
    [source, local, plex],
  )

  const removeFromQueue = useCallback(
    (index: number) => {
      if (source === 'local') local.removeFromQueue(index)
      else if (source === 'plex') plex.removeFromQueue(index)
    },
    [source, local, plex],
  )

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (source === 'local') local.moveQueueItem(fromIndex, toIndex)
      else if (source === 'plex') plex.moveQueueItem(fromIndex, toIndex)
    },
    [source, local, plex],
  )

  const position =
    source === 'local'
      ? local.position
      : source === 'plex'
      ? plex.position
      : source === 'jellyfin'
      ? jellyfin.position
      : 0
  const duration =
    (source === 'local'
      ? local.duration
      : source === 'plex'
      ? plex.duration
      : source === 'jellyfin'
      ? jellyfin.duration
      : 0) || (currentTrack?.durationMs ?? 0)

  useMediaSessionSync({
    currentTrack,
    isPlaying,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
  })

  const value: PlayerContextValue = useMemo(
    () => ({
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
    }),
    [
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
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export const PlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const universal = useContext(UniversalPlayerContext)
  if (universal) {
    return <UniversalPlayerBridge universal={universal}>{children}</UniversalPlayerBridge>
  }
  return <LegacyPlayerProvider>{children}</LegacyPlayerProvider>
}
