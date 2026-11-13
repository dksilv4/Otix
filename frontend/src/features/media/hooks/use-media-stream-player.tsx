import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type {
  StreamPlaybackSession,
  PlaybackMethod,
  StreamQualityOption,
  MediaStreamPlayerContextValue,
} from '../types/stream-player'
import type { PlayableMediaItem } from '@/features/player/types/item'

export type { MediaStreamPlayerContextValue }
import { determinePlaybackMethod } from '../utils/stream-compatibility'
import { loadPlayerSettings, savePlayerSettings } from '@/features/discover/utils/trailer'
import { apiClient } from '@/lib/api/client'
import { getPluginApi, getPlexClientId, safePlay } from '../utils/player'
import { switchPlexSessionServer, updatePlexSessionQuality, updatePlexSessionAudio } from '../utils/plex-stream'
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
import { UniversalPlayerContext } from '@/features/player/core/universal-player-context'
import { universalPlayerEngine } from '@/features/player/core/universal-player-engine'
import { streamSessionToPlayableItem } from '@/features/player/utils/converters'
import type { UniversalPlayerContextValue } from '@/features/player/types'

const MediaStreamPlayerContext = createContext<MediaStreamPlayerContextValue | null>(null)

const UniversalStreamPlayerBridge = ({
  universal,
  children,
}: {
  universal: UniversalPlayerContextValue
  children: React.ReactNode
}) => {
  const isVideo = universal.currentItem?.mediaType === 'video'
  const session = isVideo
    ? (universal.currentItem?.providerData as StreamPlaybackSession) || null
    : null
  const isOpen = Boolean(isVideo && universal.status !== 'idle' && universal.viewMode !== 'hidden')

  const openStream = useCallback(
    (newSession: StreamPlaybackSession, queueItems?: PlayableMediaItem[]) => {
      const mainItem = streamSessionToPlayableItem(newSession)
      if (queueItems && queueItems.length > 0) {
        void universalPlayerEngine.play([mainItem, ...queueItems])
      } else {
        void universalPlayerEngine.play(mainItem)
      }
    },
    [],
  )

  const onVideoEnded = useCallback(() => {
    universalPlayerEngine.onVideoEnded()
  }, [])

  const onPlay = useCallback(() => {
    universalPlayerEngine.onVideoPlay()
  }, [])

  const onPause = useCallback(() => {
    universalPlayerEngine.onVideoPause()
  }, [])

  const closeStream = useCallback(() => {
    universalPlayerEngine.stop()
  }, [])

  const failoverToBaseUrl = useCallback((newBaseUrl: string) => {
    void universalPlayerEngine.failoverServer(newBaseUrl)
  }, [])

  const togglePlay = useCallback(() => {
    void universalPlayerEngine.togglePlay()
  }, [])

  const play = useCallback(() => {
    universalPlayerEngine.resume()
  }, [])

  const pause = useCallback(() => {
    universalPlayerEngine.pause()
  }, [])

  const seek = useCallback((seconds: number) => {
    const video = universalPlayerEngine.getVideoElement()
    if (video) {
      video.currentTime = seconds
    }
    universalPlayerEngine.seek(seconds)
  }, [])

  const setVolume = useCallback((v: number) => {
    const video = universalPlayerEngine.getVideoElement()
    if (video) {
      video.volume = v
      video.muted = v === 0
    }
    universalPlayerEngine.setVolume(v)
  }, [])

  const setPlaybackSpeed = useCallback((s: number) => {
    universalPlayerEngine.setPlaybackSpeed(s)
  }, [])

  const toggleMute = useCallback(() => {
    const video = universalPlayerEngine.getVideoElement()
    if (video) {
      video.muted = !video.muted
    }
    universalPlayerEngine.toggleMute()
  }, [])

  const setTheater = useCallback((t: boolean) => {
    universalPlayerEngine.setTheater(t)
  }, [])

  const setZoomedOut = useCallback((z: boolean) => {
    universalPlayerEngine.setZoomedOut(z)
  }, [])

  const setInAppPip = useCallback((pip: boolean) => {
    universalPlayerEngine.setInAppPip(pip)
  }, [])

  const toggleInAppPip = useCallback(() => {
    universalPlayerEngine.toggleInAppPip()
  }, [])

  const toggleOverallPip = useCallback(() => {
    return universalPlayerEngine.toggleOverallPip()
  }, [])

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    universalPlayerEngine.registerVideoElement(el)
  }, [])

  const setActiveSubtitle = useCallback((id: string | null) => {
    void universalPlayerEngine.setActiveSubtitle(id)
  }, [])

  const setActiveAudio = useCallback((index: number | null) => {
    void universalPlayerEngine.setActiveAudio(index)
  }, [])

  const setQuality = useCallback((qualityId: string) => {
    void universalPlayerEngine.setQuality(qualityId)
  }, [])

  const setAvailableQualities = useCallback((_q: StreamQualityOption[]) => {}, [])
  const setActiveLevelHeight = useCallback((_h: number | null) => {}, [])
  const updateSessionQuality = useCallback((q: StreamQualityOption) => {
    void universalPlayerEngine.setQuality(q.id)
  }, [])

  const onTimeUpdate = useCallback((time: number, duration: number) => {
    universalPlayerEngine.onVideoTimeUpdate(time, duration)
  }, [])

  const onBufferedUpdate = useCallback((buffered: number) => {
    universalPlayerEngine.onVideoBufferedUpdate(buffered)
  }, [])

  const onBuffering = useCallback((buffering: boolean) => {
    universalPlayerEngine.onVideoBuffering(buffering)
  }, [])

  const onError = useCallback((_err: string | null) => {}, [])
  const fallbackToHls = useCallback(() => {
    universalPlayerEngine.fallbackToHls()
  }, [])

  const value: MediaStreamPlayerContextValue = useMemo(() => ({
    session,
    isOpen,
    isPlaying: universal.status === 'playing' || universal.status === 'buffering',
    isBuffering: universal.status === 'buffering' || universal.status === 'loading',
    currentTime: universal.position,
    duration: universal.duration,
    bufferedTime: universal.buffered,
    volume: universal.volume,
    playbackSpeed: universal.playbackSpeed,
    isMuted: universal.isMuted,
    isTheater: universal.isTheater,
    isZoomedOut: universal.isZoomedOut,
    isInAppPip: universal.isInAppPip,
    isOverallPip: universal.isOverallPip,
    isOverallPipSupported: universal.isOverallPipSupported,
    activeSubtitle: universal.activeSubtitle,
    activeAudio: universal.activeAudio,
    currentQuality: universal.currentQuality,
    availableQualities: universal.availableQualities,
    activeLevelHeight: universal.activeLevelHeight,
    playbackMethod: universal.playbackMethod,
    error: universal.error,
    queue: universal.queue || [],
    skipToIndex: universal.skipToIndex,
    removeFromQueue: universal.removeFromQueue,
    clearQueue: universal.clearQueue,

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
    setIsOverallPip: () => {},
    requestOverallPip: async () => {},
    exitOverallPip: async () => {},
    toggleOverallPip,
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
    onVideoEnded,
    onPlay,
    onPause,
    fallbackToHls,
  }), [
    session,
    isOpen,
    universal.status,
    universal.position,
    universal.duration,
    universal.buffered,
    universal.volume,
    universal.playbackSpeed,
    universal.isMuted,
    universal.isTheater,
    universal.isZoomedOut,
    universal.isInAppPip,
    universal.isOverallPip,
    universal.isOverallPipSupported,
    universal.activeSubtitle,
    universal.activeAudio,
    universal.currentQuality,
    universal.availableQualities,
    universal.activeLevelHeight,
    universal.playbackMethod,
    universal.error,
    universal.queue,
    universal.skipToIndex,
    universal.removeFromQueue,
    universal.clearQueue,
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
    toggleOverallPip,
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
    onVideoEnded,
    onPlay,
    onPause,
    fallbackToHls,
  ])

  return (
    <MediaStreamPlayerContext.Provider value={value}>
      {children}
    </MediaStreamPlayerContext.Provider>
  )
}

const LegacyMediaStreamPlayerProvider = ({ children }: { children: React.ReactNode }) => {
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
  const [queue, setQueue] = useState<PlayableMediaItem[]>([])

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
  const openStream = useCallback((newSession: StreamPlaybackSession, queueItems?: PlayableMediaItem[]) => {
    // If a previous session was open, send a stop beacon
    if (sessionRef.current) {
      sendProgressHeartbeat(true)
    }

    setQueue(queueItems || [])

    const method =
      newSession.playbackMethod ||
      (newSession.source === 'local'
        ? 'direct-play'
        : determinePlaybackMethod(
            newSession.container,
            newSession.videoCodec,
            newSession.audioCodec
          ))

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
      if (videoElementRef.current) {
        if (next) {
          safePlay(videoElementRef.current)
        } else {
          videoElementRef.current.pause()
        }
      }
      setTimeout(() => sendProgressHeartbeat(false), 50)
      return next
    })
  }, [sendProgressHeartbeat])

  const play = useCallback(() => {
    setIsPlaying(true)
    isPlayingRef.current = true
    if (videoElementRef.current) {
      safePlay(videoElementRef.current)
    }
    setTimeout(() => sendProgressHeartbeat(false), 50)
  }, [sendProgressHeartbeat])

  const pause = useCallback(() => {
    setIsPlaying(false)
    isPlayingRef.current = false
    if (videoElementRef.current) {
      videoElementRef.current.pause()
    }
    setTimeout(() => sendProgressHeartbeat(false), 50)
  }, [sendProgressHeartbeat])

  const seek = useCallback((seconds: number) => {
    setCurrentTime(seconds)
    currentTimeRef.current = seconds
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = seconds
    }
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
      try {
        const entered = await toggleOverallPip(videoElementRef.current)
        setIsOverallPipState(entered)
      } catch (err) {
        console.warn('[toggleOverallPipAction]', err)
      }
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
    if (audioIdx != null) {
      const currentPos = videoElementRef.current?.currentTime ?? 0
      setSession((prev) => {
        if (!prev) return null
        if (prev.source === 'plex') {
          const track = prev.audioTracks.find((a) => a.index === audioIdx)
          if (track) {
            return updatePlexSessionAudio(prev, track, currentPos)
          }
        }
        return {
          ...prev,
          selectedAudioIndex: audioIdx,
        }
      })
    }
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

  const setQuality = useCallback(
    (qualityId: string) => {
      setCurrentQuality(qualityId)
      const qual = availableQualities.find((q) => q.id === qualityId)
      if (qual) {
        updateSessionQuality(qual)
      }
    },
    [availableQualities, updateSessionQuality],
  )

  const setActiveLevelHeight = useCallback((height: number | null) => {
    setActiveLevelHeightState(height)
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

  const onVideoEnded = useCallback(() => {}, [])
  const onPlay = useCallback(() => {
    setIsPlaying(true)
  }, [])
  const onPause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const skipToIndex = useCallback((index: number) => {
    setQueue((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const target = prev[index]
      if (target.providerData) {
        setSession(target.providerData as StreamPlaybackSession)
      }
      return prev.slice(index + 1)
    })
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

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
    queue,
    skipToIndex,
    removeFromQueue,
    clearQueue,

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
    onVideoEnded,
    onPlay,
    onPause,
    fallbackToHls,
  }

  return (
    <MediaStreamPlayerContext.Provider value={value}>
      {children}
    </MediaStreamPlayerContext.Provider>
  )
}

export const MediaStreamPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const universal = useContext(UniversalPlayerContext)
  if (universal) {
    return <UniversalStreamPlayerBridge universal={universal}>{children}</UniversalStreamPlayerBridge>
  }
  return <LegacyMediaStreamPlayerProvider>{children}</LegacyMediaStreamPlayerProvider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMediaStreamPlayer = (): MediaStreamPlayerContextValue => {
  const ctx = useContext(MediaStreamPlayerContext)
  return ctx || defaultPlayerContextValue
}
