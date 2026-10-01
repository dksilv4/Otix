import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type {
  StreamPlaybackSession,
  PlaybackMethod,
  SubtitleTrack,
  AudioTrack,
} from '../types/stream-player'
import { determinePlaybackMethod } from '../utils/stream-compatibility'
import { loadPlayerSettings, savePlayerSettings } from '@/features/discover/components/molecules/trailer-video-modal'

interface PluginApi {
  callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
}

function getPluginApi(): PluginApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { desktopAPI?: { plugin?: PluginApi } }).desktopAPI?.plugin
}

export interface MediaStreamPlayerContextValue {
  session: StreamPlaybackSession | null
  isOpen: boolean
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isTheater: boolean
  isZoomedOut: boolean
  activeSubtitle: SubtitleTrack | null
  activeAudio: AudioTrack | null
  playbackMethod: PlaybackMethod
  error: string | null

  // Session lifecycle
  openStream: (session: StreamPlaybackSession) => void
  closeStream: () => void

  // Transport actions
  togglePlay: () => void
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setTheater: (isTheater: boolean) => void
  setZoomedOut: (isZoomed: boolean) => void
  setActiveSubtitle: (subtitleId: string | null) => void
  setActiveAudio: (audioIndex: number | null) => void

  // Internal bindings for the video element
  onTimeUpdate: (time: number, duration: number) => void
  onBuffering: (buffering: boolean) => void
  onError: (err: string | null) => void
  fallbackToHls: () => void
}

const MediaStreamPlayerContext = createContext<MediaStreamPlayerContextValue | null>(null)

export function MediaStreamPlayerProvider({ children }: { children: React.ReactNode }) {
  const [initialSettings] = useState(loadPlayerSettings)
  const [session, setSession] = useState<StreamPlaybackSession | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(initialSettings.volume)
  const [isMuted, setIsMutedState] = useState(initialSettings.isMuted)
  const [isTheater, setIsTheaterState] = useState(initialSettings.isTheater)
  const [isZoomedOut, setIsZoomedOutState] = useState(initialSettings.isZoomedOut)
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null)
  const [activeAudioIndex, setActiveAudioIndex] = useState<number | null>(null)
  const [playbackMethod, setPlaybackMethod] = useState<PlaybackMethod>('direct-play')
  const [error, setError] = useState<string | null>(null)

  const sessionRef = useRef<StreamPlaybackSession | null>(null)
  const currentTimeRef = useRef(currentTime)
  const isPlayingRef = useRef(isPlaying)

  useEffect(() => {
    sessionRef.current = session
    currentTimeRef.current = currentTime
    isPlayingRef.current = isPlaying
  }, [session, currentTime, isPlaying])

  // Send playback heartbeat to the media server
  const sendProgressHeartbeat = useCallback((isStopped = false) => {
    const active = sessionRef.current
    if (!active) return

    const api = getPluginApi()
    if (!api?.callData) return

    const positionMs = Math.round(currentTimeRef.current * 1000)
    const durationMs = Math.round((active.durationMs || 0))

    if (isStopped) {
      api.callData(active.source, 'session.stop', {
        playSessionId: active.playSessionId,
        itemId: active.itemId,
        positionMs,
      }).catch((err) => console.warn('[StreamPlayer] Stop beacon failed:', err))
    } else {
      api.callData(active.source, 'session.progress', {
        playSessionId: active.playSessionId,
        itemId: active.itemId,
        positionMs,
        durationMs,
        isPaused: !isPlayingRef.current,
      }).catch((err) => console.warn('[StreamPlayer] Progress heartbeat failed:', err))
    }
  }, [])

  // Heartbeat timer (fires every 10 seconds during active playback)
  useEffect(() => {
    if (!isOpen || !session || !isPlaying) return

    const interval = setInterval(() => {
      sendProgressHeartbeat(false)
    }, 10000)

    return () => clearInterval(interval)
  }, [isOpen, session, isPlaying, sendProgressHeartbeat])

  // Open stream session
  const openStream = useCallback((newSession: StreamPlaybackSession) => {
    // If a previous session was open, send a stop beacon
    if (sessionRef.current) {
      sendProgressHeartbeat(true)
    }

    const method = determinePlaybackMethod(
      newSession.container,
      newSession.videoCodec,
      newSession.audioCodec
    )

    setSession(newSession)
    setPlaybackMethod(method)
    setCurrentTime((newSession.startPositionMs || 0) / 1000)
    setDuration((newSession.durationMs || 0) / 1000)
    setActiveAudioIndex(newSession.selectedAudioIndex ?? newSession.audioTracks[0]?.index ?? null)
    setActiveSubtitleId(
      newSession.selectedSubtitleIndex != null
        ? String(newSession.selectedSubtitleIndex)
        : null
    )
    setError(null)
    setIsPlaying(true)
    setIsOpen(true)

    // Notify server of session start
    const api = getPluginApi()
    if (api?.callData) {
      api.callData(newSession.source, 'session.start', {
        playSessionId: newSession.playSessionId,
        itemId: newSession.itemId,
        positionMs: newSession.startPositionMs || 0,
      }).catch((err) => console.warn('[StreamPlayer] Start beacon failed:', err))
    }
  }, [sendProgressHeartbeat])

  // Close stream session & clean up
  const closeStream = useCallback(() => {
    sendProgressHeartbeat(true)
    setIsOpen(false)
    setIsPlaying(false)
    setSession(null)
    setError(null)
  }, [sendProgressHeartbeat])

  // Transport actions
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev)
  }, [])

  const play = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const seek = useCallback((seconds: number) => {
    setCurrentTime(seconds)
  }, [])

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val))
    setVolumeState(clamped)
    if (clamped > 0 && isMuted) {
      setIsMutedState(false)
      savePlayerSettings({ volume: clamped, isMuted: false })
    } else {
      savePlayerSettings({ volume: clamped })
    }
  }, [isMuted])

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev
      savePlayerSettings({ isMuted: next })
      return next
    })
  }, [])

  const setTheater = useCallback((val: boolean) => {
    setIsTheaterState(val)
    savePlayerSettings({ isTheater: val })
  }, [])

  const setZoomedOut = useCallback((val: boolean) => {
    setIsZoomedOutState(val)
    savePlayerSettings({ isZoomedOut: val })
  }, [])

  const setActiveSubtitle = useCallback((subId: string | null) => {
    setActiveSubtitleId(subId)
  }, [])

  const setActiveAudio = useCallback((audioIdx: number | null) => {
    setActiveAudioIndex(audioIdx)
    // Reload transcode if needed
  }, [])

  const onTimeUpdate = useCallback((time: number, dur: number) => {
    setCurrentTime(time)
    if (dur > 0 && dur !== duration) {
      setDuration(dur)
    }
  }, [duration])

  const onBuffering = useCallback((buffering: boolean) => {
    setIsBuffering(buffering)
  }, [])

  const onError = useCallback((err: string | null) => {
    setError(err)
  }, [])

  const fallbackToHls = useCallback(() => {
    console.warn('[StreamPlayer] Direct play unsupported or failed; falling back to HLS transcode')
    setPlaybackMethod('transcode')
  }, [])

  const activeSubtitle = useMemo(() => {
    if (!session || !activeSubtitleId) return null
    return session.subtitles.find((s) => s.id === activeSubtitleId || String(s.index) === activeSubtitleId) ?? null
  }, [session, activeSubtitleId])

  const activeAudio = useMemo(() => {
    if (!session || activeAudioIndex == null) return null
    return session.audioTracks.find((a) => a.index === activeAudioIndex) ?? null
  }, [session, activeAudioIndex])

  const value: MediaStreamPlayerContextValue = {
    session,
    isOpen,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    isTheater,
    isZoomedOut,
    activeSubtitle,
    activeAudio,
    playbackMethod,
    error,

    openStream,
    closeStream,
    togglePlay,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    setTheater,
    setZoomedOut,
    setActiveSubtitle,
    setActiveAudio,
    onTimeUpdate,
    onBuffering,
    onError,
    fallbackToHls,
  }

  return (
    <MediaStreamPlayerContext.Provider value={value}>
      {children}
    </MediaStreamPlayerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMediaStreamPlayer(): MediaStreamPlayerContextValue {
  const ctx = useContext(MediaStreamPlayerContext)
  if (!ctx) {
    throw new Error('useMediaStreamPlayer must be used within MediaStreamPlayerProvider')
  }
  return ctx
}
