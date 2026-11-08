import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type {
  StreamPlaybackSession,
  PlaybackMethod,
  StreamQualityOption,
  MediaStreamPlayerContextValue,
} from '../types/stream-player'

export type { MediaStreamPlayerContextValue }
import { determinePlaybackMethod } from '../utils/stream-compatibility'
import { loadPlayerSettings, savePlayerSettings } from '@/features/discover/utils/trailer'
import { apiClient } from '@/lib/api/client'
import { getPluginApi, getPlexClientId } from '../utils/player'
import { switchPlexSessionServer, updatePlexSessionQuality } from '../utils/plex-stream'
import { buildQualityOptions, DEFAULT_QUALITY_ID } from '../utils/quality'
import {
  buildLocalMediaSession,
  buildLocalAudioTrack,
  isAudioFile,
  resolveLocalAudioPlaylist,
} from '../utils/local-media'
import { usePlayer } from '@/lib/player/use-player'
import { useDeepLink } from '@/features/auth/hooks/use-deep-link'
import {
  isOverallPipSupported,
  isOverallPipActive,
  requestOverallPip,
  exitOverallPip,
  toggleOverallPip,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  registerMediaSessionActions,
} from '../utils/pip'
import { defaultPlayerContextValue } from '../utils/player-defaults'

const MediaStreamPlayerContext = createContext<MediaStreamPlayerContextValue | null>(null)

export const MediaStreamPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const { playLocalTrack, playLocalTracks, stop: stopAudio } = usePlayer()
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
  const [isInAppPip, setIsInAppPipState] = useState(false)
  const [isOverallPip, setIsOverallPipState] = useState(false)
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null)
  const [activeAudioIndex, setActiveAudioIndex] = useState<number | null>(null)
  const [currentQuality, setCurrentQuality] = useState<string>(DEFAULT_QUALITY_ID)
  const [availableQualities, setAvailableQualities] = useState<StreamQualityOption[]>(() => buildQualityOptions())
  const [activeLevelHeight, setActiveLevelHeightState] = useState<number | null>(null)
  const [playbackMethod, setPlaybackMethod] = useState<PlaybackMethod>('direct-play')
  const [error, setError] = useState<string | null>(null)

  const sessionRef = useRef<StreamPlaybackSession | null>(null)
  const currentTimeRef = useRef(currentTime)
  const isPlayingRef = useRef(isPlaying)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    sessionRef.current = session
    currentTimeRef.current = currentTime
    isPlayingRef.current = isPlaying
  }, [session, currentTime, isPlaying])

  // MediaSession API metadata synchronization
  useEffect(() => {
    if (!session || !isOpen) {
      syncMediaSessionMetadata(null)
      return
    }

    syncMediaSessionMetadata({
      title: session.title,
      subtitle: session.subtitle,
      seriesTitle: session.episodeContext?.seriesTitle,
      seasonNumber: session.episodeContext?.seasonNumber,
      episodeNumber: session.episodeContext?.episodeNumber,
      episodeTitle: session.episodeContext?.episodeTitle,
      source: session.source,
    })
  }, [session, isOpen])

  // MediaSession API playback state synchronization
  useEffect(() => {
    if (!isOpen || !session) return
    syncMediaSessionPlaybackState(isPlaying, currentTime, duration, playbackSpeed)
  }, [isOpen, session, isPlaying, currentTime, duration, playbackSpeed])

  // Send playback heartbeat to the media server (Plex Timeline & desktop plugin)
  const sendProgressHeartbeat = useCallback(
    async (isStopped = false) => {
      const active = sessionRef.current
      if (!active || active.source === 'local') return

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

    const method = newSession.source === 'local'
      ? 'direct-play'
      : determinePlaybackMethod(
          newSession.container,
          newSession.videoCodec,
          newSession.audioCodec
        )

    const initialQualities = buildQualityOptions({
      hasDirectPlay: Boolean(newSession.directUrl),
      source: newSession.source,
    })
    setAvailableQualities(initialQualities)
    setCurrentQuality(newSession.selectedQuality || DEFAULT_QUALITY_ID)
    setActiveLevelHeightState(null)

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
    setIsInAppPipState(false)
    setIsOverallPipState(false)
    setIsOpen(true)

    // Notify server of session start
    setTimeout(() => {
      sendProgressHeartbeat(false)
    }, 150)
  }, [sendProgressHeartbeat])

  // Close stream session & clean up
  const closeStream = useCallback(() => {
    if (videoElementRef.current && isOverallPipActive(videoElementRef.current)) {
      exitOverallPip(videoElementRef.current).catch(() => {})
    }
    syncMediaSessionMetadata(null)
    sendProgressHeartbeat(true)
    setIsOpen(false)
    setIsInAppPipState(false)
    setIsOverallPipState(false)
    setIsPlaying(false)
    setSession(null)
    setError(null)
    setCurrentQuality(DEFAULT_QUALITY_ID)
    setActiveLevelHeightState(null)
    setAvailableQualities(buildQualityOptions())
  }, [sendProgressHeartbeat])

  // Handle media/play deep links (e.g. from Windows "Open with Otix" or file double-click)
  useDeepLink(
    useCallback(
      (data) => {
        if (data.action === 'media/play' && data.params?.path) {
          const filePath = data.params.path
          if (isAudioFile(filePath)) {
            // Audio files (.mp3, .flac, .wav, etc.) -> Otix Music Player
            closeStream()
            // 1. Immediately launch playback so audio starts without any delay
            const immediateTrack = buildLocalAudioTrack(filePath)
            void playLocalTrack(immediateTrack)

            // 2. Concurrently discover folder tracks, ID3 tags, and high-res album artwork
            void resolveLocalAudioPlaylist(filePath)
              .then(({ tracks, initialIndex }) => {
                if (tracks.length > 0) {
                  void playLocalTracks(tracks, initialIndex)
                }
              })
              .catch((err) => {
                console.warn('[useMediaStreamPlayer] Failed to load audio playlist:', err)
              })
          } else {
            // Video files (.mp4, .mkv, .avi, etc.) -> Otix Video Player
            stopAudio()
            const session = buildLocalMediaSession(filePath)
            openStream(session)
          }
        }
      },
      [openStream, closeStream, playLocalTrack, playLocalTracks, stopAudio],
    ),
  )

  const failoverToBaseUrl = useCallback((newBaseUrl: string) => {
    setSession((prev) => {
      if (!prev) return null
      console.warn(`[StreamPlayer] Failing over stream session from ${prev.serverUrl} to ${newBaseUrl}`)
      return switchPlexSessionServer(prev, newBaseUrl)
    })
  }, [])

  // Transport actions
  const togglePlay = useCallback(() => {
    setIsPlaying((prev: boolean) => {
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

  // MediaSession Action Handlers registration
  useEffect(() => {
    if (!isOpen || !session) return
    const cleanup = registerMediaSessionActions(
      {
        onPlay: play,
        onPause: pause,
        onSeek: seek,
      },
      () => currentTimeRef.current,
      () => duration,
    )
    return cleanup
  }, [isOpen, session, play, pause, seek, duration])

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
    setIsMutedState((prev: boolean) => {
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

  const setInAppPip = useCallback((val: boolean) => {
    setIsInAppPipState(val)
  }, [])

  const toggleInAppPip = useCallback(() => {
    setIsInAppPipState((prev: boolean) => !prev)
  }, [])

  const setIsOverallPip = useCallback((val: boolean) => {
    setIsOverallPipState(val)
  }, [])

  const requestOverallPipAction = useCallback(async () => {
    if (videoElementRef.current) {
      await requestOverallPip(videoElementRef.current)
      setIsOverallPipState(true)
    }
  }, [])

  const exitOverallPipAction = useCallback(async () => {
    await exitOverallPip(videoElementRef.current)
    setIsOverallPipState(false)
  }, [])

  const toggleOverallPipAction = useCallback(async () => {
    if (videoElementRef.current) {
      const entered = await toggleOverallPip(videoElementRef.current)
      setIsOverallPipState(entered)
    }
  }, [])

  const [isOverallPipSupportedState, setIsOverallPipSupportedState] = useState<boolean>(() => isOverallPipSupported())

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el
    if (el) {
      setIsOverallPipState(isOverallPipActive(el))
      setIsOverallPipSupportedState(isOverallPipSupported(el))
    }
  }, [])

  const setActiveSubtitle = useCallback((subId: string | null) => {
    setActiveSubtitleId(subId)
  }, [])

  const setActiveAudio = useCallback((audioIdx: number | null) => {
    setActiveAudioIndex(audioIdx)
  }, [])

  const setQuality = useCallback((qualityId: string) => {
    setCurrentQuality(qualityId)
  }, [])

  const setActiveLevelHeight = useCallback((height: number | null) => {
    setActiveLevelHeightState(height)
  }, [])

  const updateSessionQuality = useCallback((qualityOption: StreamQualityOption) => {
    setSession((prev) => {
      if (!prev) return null
      if (prev.source === 'plex') {
        return updatePlexSessionQuality(prev, qualityOption)
      }
      return {
        ...prev,
        selectedQuality: qualityOption.id,
        maxVideoBitrate: qualityOption.maxVideoBitrate,
        videoResolution: qualityOption.videoResolution,
      }
    })
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
    isInAppPip,
    isOverallPip,
    isOverallPipSupported: isOverallPipSupportedState,
    activeSubtitle,
    activeAudio,
    currentQuality,
    availableQualities,
    activeLevelHeight,
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
    setInAppPip,
    toggleInAppPip,
    setIsOverallPip,
    requestOverallPip: requestOverallPipAction,
    exitOverallPip: exitOverallPipAction,
    toggleOverallPip: toggleOverallPipAction,
    registerVideoElement,
    setActiveSubtitle,
    setActiveAudio,
    setQuality,
    setAvailableQualities,
    setActiveLevelHeight,
    updateSessionQuality,
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

// eslint-disable-next-line react-refresh/only-export-components
export const useMediaStreamPlayer = (): MediaStreamPlayerContextValue => {
  const ctx = useContext(MediaStreamPlayerContext)
  return ctx || defaultPlayerContextValue
}
