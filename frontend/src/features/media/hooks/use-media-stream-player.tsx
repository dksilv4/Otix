import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type {
  StreamPlaybackSession,
  PlaybackMethod,
  SubtitleTrack,
  AudioTrack,
} from '../types/stream-player'
import { determinePlaybackMethod } from '../utils/stream-compatibility'
import { loadPlayerSettings, savePlayerSettings } from '@/features/discover/utils/trailer'
import { apiClient } from '@/lib/api/client'
import { getPluginApi, getPlexClientId } from '../utils/player'
import { switchPlexSessionServer } from '../utils/plex-stream'

export interface MediaStreamPlayerContextValue {
  session: StreamPlaybackSession | null
  isOpen: boolean
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  bufferedTime: number
  volume: number
  playbackSpeed: number
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
  failoverToBaseUrl: (newBaseUrl: string) => void

  // Transport actions
  togglePlay: () => void
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  setPlaybackSpeed: (speed: number) => void
  toggleMute: () => void
  setTheater: (isTheater: boolean) => void
  setZoomedOut: (isZoomed: boolean) => void
  setActiveSubtitle: (subtitleId: string | null) => void
  setActiveAudio: (audioIndex: number | null) => void

  // Internal bindings for the video element
  onTimeUpdate: (time: number, duration: number) => void
  onBufferedUpdate: (buffered: number) => void
  onBuffering: (buffering: boolean) => void
  onError: (err: string | null) => void
  fallbackToHls: () => void
}

const MediaStreamPlayerContext = createContext<MediaStreamPlayerContextValue | null>(null)

export const MediaStreamPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const [initialSettings] = useState(loadPlayerSettings)
  const [session, setSession] = useState<StreamPlaybackSession | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedTime, setBufferedTime] = useState(0)
  const [playbackSpeed, setPlaybackSpeedState] = useState(1)
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

  // Send playback heartbeat to the media server (Plex Timeline & desktop plugin)
  const sendProgressHeartbeat = useCallback(
    async (isStopped = false) => {
      const active = sessionRef.current
      if (!active) return

      const positionMs = Math.round(currentTimeRef.current * 1000)
      const durationMs = Math.round(active.durationMs || 0)
      const state = isStopped ? 'stopped' : isPlayingRef.current ? 'playing' : 'paused'

      // 1. Report to Plex Media Server timeline
      if (active.source === 'plex' && active.serverUrl && active.itemId) {
        const clientId = active.clientId || getPlexClientId()
        const params = new URLSearchParams({
          ratingKey: String(active.itemId),
          key: `/library/metadata/${active.itemId}`,
          state,
          time: String(positionMs),
          duration: String(durationMs),
          hasMDE: '1',
          'X-Plex-Client-Identifier': clientId,
          'X-Plex-Session-Identifier': active.playSessionId,
          'X-Plex-Playback-Session-Id': active.playSessionId,
          'X-Plex-Product': 'Otix',
          'X-Plex-Platform': 'Web',
          'X-Plex-Platform-Version': '1.0',
          'X-Plex-Device': 'Otix Web',
          'X-Plex-Device-Name': 'Otix Player',
          'X-Plex-Version': '1.0.0',
        })
        if (active.token) {
          params.set('X-Plex-Token', active.token)
        }

        const directTimelineUrl = `${active.serverUrl.replace(/\/$/, '')}/:/timeline?${params.toString()}`

        // On shared servers, skip direct PMS timeline calls to avoid corrupting the server owner's watch offset.
        if (!active.isSharedServer) {
          try {
            // Use fetch with keepalive: isStopped instead of navigator.sendBeacon.
            // sendBeacon sends an HTTP POST which Plex rejects on GET /:/timeline,
            // preventing Plex from stopping active transcode sessions and leaving duplicate streams.
            await fetch(directTimelineUrl, {
              method: 'GET',
              mode: 'no-cors',
              keepalive: isStopped,
            })
          } catch {
            // Direct fetch failed
          }
        }

        // Keep Otix backend UserPlexItem viewOffset in sync locally without proxying
        // duplicate /:/timeline requests to the Plex server from backend.
        // For shared servers, always sync progress so the friend's position is strictly tracked for their account.
        if (active.isSharedServer || isStopped || state === 'paused' || Math.random() < 0.25) {
          apiClient
            .post('/integrations/plex/timeline', {
              serverUrl: active.serverUrl,
              token: active.token,
              ratingKey: active.itemId,
              state,
              timeMs: positionMs,
              durationMs,
              clientId,
              sessionId: active.playSessionId,
              localOnly: true,
            })
            .catch(() => {})
        }
      }

      // 2. Also notify desktop plugin if running in Electron environment (non-Plex sources)
      // For Plex, timeline is already reported peer-to-peer with matching session/client identifiers.
      const api = getPluginApi()
      if (api?.callData && active.source !== 'plex') {
        if (isStopped) {
          api.callData(active.source, 'session.stop', {
            playSessionId: active.playSessionId,
            itemId: active.itemId,
            positionMs,
          }).catch(() => {})
        } else {
          api.callData(active.source, 'session.progress', {
            playSessionId: active.playSessionId,
            itemId: active.itemId,
            positionMs,
            durationMs,
            isPaused: !isPlayingRef.current,
          }).catch(() => {})
        }
      }
    },
    [],
  )

  // Clean stop on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionRef.current) {
        sendProgressHeartbeat(true)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sendProgressHeartbeat])

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
    setBufferedTime(0)
    setPlaybackSpeedState(1)
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
    setTimeout(() => {
      sendProgressHeartbeat(false)
    }, 150)
  }, [sendProgressHeartbeat])

  // Close stream session & clean up
  const closeStream = useCallback(() => {
    sendProgressHeartbeat(true)
    setIsOpen(false)
    setIsPlaying(false)
    setSession(null)
    setError(null)
  }, [sendProgressHeartbeat])

  const failoverToBaseUrl = useCallback((newBaseUrl: string) => {
    setSession((prev) => {
      if (!prev) return null
      console.warn(`[StreamPlayer] Failing over stream session from ${prev.serverUrl} to ${newBaseUrl}`)
      return switchPlexSessionServer(prev, newBaseUrl)
    })
  }, [])

  // Transport actions
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev
      isPlayingRef.current = next
      setTimeout(() => sendProgressHeartbeat(false), 50)
      return next
    })
  }, [sendProgressHeartbeat])

  const play = useCallback(() => {
    setIsPlaying(true)
    isPlayingRef.current = true
    setTimeout(() => sendProgressHeartbeat(false), 50)
  }, [sendProgressHeartbeat])

  const pause = useCallback(() => {
    setIsPlaying(false)
    isPlayingRef.current = false
    setTimeout(() => sendProgressHeartbeat(false), 50)
  }, [sendProgressHeartbeat])

  const seek = useCallback((seconds: number) => {
    setCurrentTime(seconds)
    currentTimeRef.current = seconds
    setTimeout(() => sendProgressHeartbeat(false), 50)
  }, [sendProgressHeartbeat])

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed)
  }, [])

  const onBufferedUpdate = useCallback((buffered: number) => {
    setBufferedTime(buffered)
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
    bufferedTime,
    volume,
    playbackSpeed,
    isMuted,
    isTheater,
    isZoomedOut,
    activeSubtitle,
    activeAudio,
    playbackMethod,
    error,

    openStream,
    closeStream,
    failoverToBaseUrl,
    togglePlay,
    play,
    pause,
    seek,
    setVolume,
    setPlaybackSpeed,
    toggleMute,
    setTheater,
    setZoomedOut,
    setActiveSubtitle,
    setActiveAudio,
    onTimeUpdate,
    onBufferedUpdate,
    onBuffering,
    onError,
    fallbackToHls,
  }

  return (
    <MediaStreamPlayerContext.Provider value={value}>
      {children}
    </MediaStreamPlayerContext.Provider>
  )
};

const noop = () => {}
const defaultPlayerContextValue: MediaStreamPlayerContextValue = {
  session: null,
  isOpen: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  bufferedTime: 0,
  volume: 1,
  playbackSpeed: 1,
  isMuted: false,
  isBuffering: false,
  isTheater: false,
  isZoomedOut: false,
  activeSubtitle: null,
  activeAudio: null,
  playbackMethod: 'direct-play',
  error: null,
  openStream: noop,
  closeStream: noop,
  togglePlay: noop,
  play: noop,
  pause: noop,
  seek: noop,
  setVolume: noop,
  setPlaybackSpeed: noop,
  toggleMute: noop,
  setTheater: noop,
  setZoomedOut: noop,
  setActiveSubtitle: noop,
  setActiveAudio: noop,
  onTimeUpdate: noop,
  onBufferedUpdate: noop,
  onBuffering: noop,
  onError: noop,
  fallbackToHls: noop,
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMediaStreamPlayer = (): MediaStreamPlayerContextValue => {
  const ctx = useContext(MediaStreamPlayerContext)
  return ctx || defaultPlayerContextValue
}
