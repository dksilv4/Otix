import { createContext, useEffect, useState, useMemo, useCallback } from 'react'
import type { UniversalPlayerContextValue, UniversalPlayerState } from '../types'
import { universalPlayerEngine } from './universal-player-engine'

export const UniversalPlayerContext = createContext<UniversalPlayerContextValue | null>(null)

export const UniversalPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const [engineState, setEngineState] = useState<UniversalPlayerState>(() =>
    universalPlayerEngine.getState(),
  )

  useEffect(() => {
    return universalPlayerEngine.subscribe((next) => {
      setEngineState({ ...next })
    })
  }, [])

  const play = useCallback(
    (item?: any, options?: any) => universalPlayerEngine.play(item, options),
    [],
  )
  const pause = useCallback(() => universalPlayerEngine.pause(), [])
  const resume = useCallback(() => universalPlayerEngine.resume(), [])
  const togglePlay = useCallback(() => universalPlayerEngine.togglePlay(), [])
  const stop = useCallback(() => universalPlayerEngine.stop(), [])
  const seek = useCallback((sec: number) => universalPlayerEngine.seek(sec), [])
  const seekRelative = useCallback((sec: number) => universalPlayerEngine.seekRelative(sec), [])
  const skipNext = useCallback(() => universalPlayerEngine.skipNext(), [])
  const skipPrevious = useCallback(() => universalPlayerEngine.skipPrevious(), [])
  const skipToIndex = useCallback((idx: number) => universalPlayerEngine.skipToIndex(idx), [])

  const addToQueue = useCallback((item: any) => universalPlayerEngine.addToQueue(item), [])
  const removeFromQueue = useCallback((idx: number) => universalPlayerEngine.removeFromQueue(idx), [])
  const moveQueueItem = useCallback((from: number, to: number) => universalPlayerEngine.moveQueueItem(from, to), [])
  const clearQueue = useCallback(() => universalPlayerEngine.clearQueue(), [])
  const toggleShuffle = useCallback(() => universalPlayerEngine.toggleShuffle(), [])
  const setRepeatMode = useCallback((m: any) => universalPlayerEngine.setRepeatMode(m), [])

  const setVolume = useCallback((v: number) => universalPlayerEngine.setVolume(v), [])
  const toggleMute = useCallback(() => universalPlayerEngine.toggleMute(), [])
  const setPlaybackSpeed = useCallback((s: number) => universalPlayerEngine.setPlaybackSpeed(s), [])

  const setViewMode = useCallback((m: any) => universalPlayerEngine.setViewMode(m), [])
  const setTheater = useCallback((t: boolean) => universalPlayerEngine.setTheater(t), [])
  const toggleTheater = useCallback(() => universalPlayerEngine.toggleTheater(), [])
  const setZoomedOut = useCallback((z: boolean) => universalPlayerEngine.setZoomedOut(z), [])
  const toggleZoom = useCallback(() => universalPlayerEngine.toggleZoom(), [])
  const setInAppPip = useCallback((p: boolean) => universalPlayerEngine.setInAppPip(p), [])
  const toggleInAppPip = useCallback(() => universalPlayerEngine.toggleInAppPip(), [])
  const toggleOverallPip = useCallback(() => universalPlayerEngine.toggleOverallPip(), [])

  const setActiveSubtitle = useCallback((s: string | null) => universalPlayerEngine.setActiveSubtitle(s), [])
  const setActiveAudio = useCallback((a: number | null) => universalPlayerEngine.setActiveAudio(a), [])
  const setQuality = useCallback((q: string) => universalPlayerEngine.setQuality(q), [])
  const failoverServer = useCallback((b: string) => universalPlayerEngine.failoverServer(b), [])

  const value: UniversalPlayerContextValue = useMemo(
    () => ({
      ...engineState,
      play,
      pause,
      resume,
      togglePlay,
      stop,
      seek,
      seekRelative,
      skipNext,
      skipPrevious,
      skipToIndex,
      addToQueue,
      removeFromQueue,
      moveQueueItem,
      clearQueue,
      toggleShuffle,
      setRepeatMode,
      setVolume,
      toggleMute,
      setPlaybackSpeed,
      setViewMode,
      setTheater,
      toggleTheater,
      setZoomedOut,
      toggleZoom,
      setInAppPip,
      toggleInAppPip,
      toggleOverallPip,
      setActiveSubtitle,
      setActiveAudio,
      setQuality,
      failoverServer,
    }),
    [
      engineState,
      play,
      pause,
      resume,
      togglePlay,
      stop,
      seek,
      seekRelative,
      skipNext,
      skipPrevious,
      skipToIndex,
      addToQueue,
      removeFromQueue,
      moveQueueItem,
      clearQueue,
      toggleShuffle,
      setRepeatMode,
      setVolume,
      toggleMute,
      setPlaybackSpeed,
      setViewMode,
      setTheater,
      toggleTheater,
      setZoomedOut,
      toggleZoom,
      setInAppPip,
      toggleInAppPip,
      toggleOverallPip,
      setActiveSubtitle,
      setActiveAudio,
      setQuality,
      failoverServer,
    ],
  )

  return (
    <UniversalPlayerContext.Provider value={value}>
      {children}
    </UniversalPlayerContext.Provider>
  )
}
