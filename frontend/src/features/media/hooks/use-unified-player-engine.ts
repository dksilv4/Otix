import { useState, useRef, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import { safePlay, buildYouTubeEmbedUrl } from '../utils/player'
import { triggerPlexDecision } from '../utils/plex-stream'
import { extractYoutubeIdFromUrl } from '@/features/discover/utils/hero'
import { buildQualityOptions } from '../utils/quality'
import { universalPlayerEngine } from '@/features/player/core/universal-player-engine'
import { OPEN_QUICK_STREAM_EVENT, type QuickStreamEventDetail } from '../utils/open-quick-stream'
import { useQuickStream } from './use-quick-stream'
import type { useMediaStreamPlayer } from './use-media-stream-player'
import type { StreamPlaybackSession } from '../types/stream-player'

export interface UseUnifiedPlayerEngineProps {
  isTrailer: boolean
  youtubeId?: string
  activeStreamSession: StreamPlaybackSession | null
  streamPlayer: ReturnType<typeof useMediaStreamPlayer>
  trailerIsMuted: boolean
  trailerVolume: number
  isDraggingProgress: boolean
  setTrailerIsMutedState: (muted: boolean) => void
}

export const useUnifiedPlayerEngine = ({
  isTrailer,
  youtubeId,
  activeStreamSession,
  streamPlayer,
  trailerIsMuted,
  trailerVolume,
  isDraggingProgress,
  setTrailerIsMutedState,
}: UseUnifiedPlayerEngineProps) => {
  const {
    playbackMethod,
    isInAppPip,
    setAvailableQualities,
    setActiveLevelHeight,
    registerVideoElement,
    failoverToBaseUrl,
    fallbackToHls,
  } = streamPlayer

  const { quickStream } = useQuickStream()

  const [embedBlocked, setEmbedBlocked] = useState(false)
  const [trailerIsPlaying, setTrailerIsPlaying] = useState(true)
  const [trailerCurrentTime, setTrailerCurrentTime] = useState(0)
  const [trailerDuration, setTrailerDuration] = useState(0)
  const [trailerBufferedFraction, setTrailerBufferedFraction] = useState(0)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastUserActionRef = useRef<number>(0)
  const initialSeekDoneRef = useRef(false)
  const triedBaseUrlsRef = useRef<Set<string>>(new Set())
  const currentStreamUrlRef = useRef<string | null>(null)
  const currentPlaybackMethodRef = useRef<string | null>(null)
  const currentItemIdRef = useRef<string | null>(null)
  const targetStartTimeRef = useRef<number>(0)
  const pendingSeekTimeRef = useRef<number | null>(null)

  const fallbackToHlsRef = useRef(fallbackToHls)
  const stallWatchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPlayheadTimeRef = useRef<number>(-1)
  const stallStartTimeRef = useRef<number | null>(null)
  const consecutiveStallRecoveriesRef = useRef<number>(0)

  useEffect(() => {
    fallbackToHlsRef.current = fallbackToHls
  }, [fallbackToHls])

  const failoverToBaseUrlRef = useRef(failoverToBaseUrl)
  const setAvailableQualitiesRef = useRef(setAvailableQualities)
  const setActiveLevelHeightRef = useRef(setActiveLevelHeight)

  useEffect(() => {
    failoverToBaseUrlRef.current = failoverToBaseUrl
    setAvailableQualitiesRef.current = setAvailableQualities
    setActiveLevelHeightRef.current = setActiveLevelHeight
  }, [failoverToBaseUrl, setAvailableQualities, setActiveLevelHeight])

  const cleanYoutubeId = youtubeId ? extractYoutubeIdFromUrl(youtubeId) || youtubeId : ''
  const iframeSrc = cleanYoutubeId ? buildYouTubeEmbedUrl(cleanYoutubeId) : ''

  // --------------------------------------------------------------------------
  // TRAILER METHODS
  // --------------------------------------------------------------------------
  const postToTrailer = useCallback((command: string, args: unknown[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args,
        }),
        '*',
      )
    } catch {
      // ignore
    }
  }, [])

  const sendTrailerListening = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: 'listening',
          id: 1,
          channel: 'widget',
        }),
        '*',
      )
    } catch {
      // ignore
    }
  }, [])

  // Initialize available qualities for stream mode
  useEffect(() => {
    if (isTrailer || !activeStreamSession) return
    const opts = buildQualityOptions({
      hasDirectPlay: Boolean(activeStreamSession.directUrl),
      source: activeStreamSession.source,
    })
    setAvailableQualities(opts)
  }, [activeStreamSession, isTrailer, setAvailableQualities])

  // Audio Focus: Pause background audio when trailer is launched
  useEffect(() => {
    if (isTrailer) {
      universalPlayerEngine.pause()
    }
  }, [isTrailer])

  // Trailer YouTube window message listener
  useEffect(() => {
    if (!isTrailer) return
    const handleMessage = (e: MessageEvent) => {
      let data: any
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (!data) return

      if (data.event === 'onReady' || data.event === 'initialDelivery') {
        sendTrailerListening()
        if (trailerIsMuted) {
          postToTrailer('mute')
        } else {
          postToTrailer('unMute')
          postToTrailer('setVolume', [Math.round(trailerVolume * 100)])
        }
      }

      if (
        data.event === 'onError' ||
        (data.event === 'infoDelivery' && (data.info?.errorCode || data.info?.error))
      ) {
        const code = data.data ?? data.info?.errorCode ?? data.info?.error
        if (code === 150 || code === 101 || code === 2 || code === 100 || code === 5) {
          setEmbedBlocked(true)
        }
      }

      if (data.event === 'infoDelivery' && data.info) {
        if (typeof data.info.currentTime === 'number' && !isDraggingProgress) {
          setTrailerCurrentTime(data.info.currentTime)
        }
        if (typeof data.info.duration === 'number' && data.info.duration > 0) {
          setTrailerDuration(data.info.duration)
        }
        if (typeof data.info.playerState === 'number' && Date.now() - lastUserActionRef.current > 800) {
          setTrailerIsPlaying(data.info.playerState === 1)
        }
        if (typeof data.info.videoLoadedFraction === 'number') {
          setTrailerBufferedFraction(data.info.videoLoadedFraction)
        }
        if (typeof data.info.muted === 'boolean') {
          setTrailerIsMutedState(data.info.muted)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isDraggingProgress, isTrailer, postToTrailer, sendTrailerListening, setTrailerIsMutedState, trailerIsMuted, trailerVolume])

  const handleIframeLoad = useCallback(() => {
    sendTrailerListening()
    if (trailerIsMuted) {
      postToTrailer('mute')
    } else {
      postToTrailer('unMute')
      postToTrailer('setVolume', [Math.round(trailerVolume * 100)])
    }
  }, [postToTrailer, sendTrailerListening, trailerIsMuted, trailerVolume])

  // Quick stream custom events (stream mode)
  useEffect(() => {
    if (isTrailer) return
    const handleQuickStreamEvent = (e: Event) => {
      const customEvent = e as CustomEvent<QuickStreamEventDetail>
      if (customEvent.detail) {
        quickStream(customEvent.detail)
      }
    }
    window.addEventListener(OPEN_QUICK_STREAM_EVENT, handleQuickStreamEvent)
    return () => window.removeEventListener(OPEN_QUICK_STREAM_EVENT, handleQuickStreamEvent)
  }, [isTrailer, quickStream])

  // Video element registration (stream mode)
  const setVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el
      setVideoElement(el)
      if (!isTrailer) {
        registerVideoElement(el)
        if (el) {
          const state = universalPlayerEngine.getState()
          el.volume = state.isMuted ? 0 : state.volume
          el.muted = state.isMuted
        }
      }
    },
    [isTrailer, registerVideoElement],
  )

  useEffect(() => {
    if (!isTrailer && videoRef.current) {
      registerVideoElement(videoRef.current)
      const state = universalPlayerEngine.getState()
      videoRef.current.volume = state.isMuted ? 0 : state.volume
      videoRef.current.muted = state.isMuted
    }
    return () => {
      if (!isTrailer) {
        registerVideoElement(null)
      }
    }
  }, [isTrailer, registerVideoElement, isInAppPip, activeStreamSession])

  // Initial seek for stream mode
  const applyInitialSeek = useCallback((forceTime?: number) => {
    const video = videoRef.current
    if (!video) return
    registerVideoElement(video)
    const currentState = universalPlayerEngine.getState()
    video.volume = currentState.isMuted ? 0 : currentState.volume
    video.muted = currentState.isMuted
    if (forceTime === undefined && initialSeekDoneRef.current && pendingSeekTimeRef.current === null) return

    const targetSeconds =
      forceTime !== undefined
        ? forceTime
        : pendingSeekTimeRef.current !== null
        ? pendingSeekTimeRef.current
        : (activeStreamSession?.startPositionMs || 0) / 1000

    if (targetSeconds > 0 && Math.abs(video.currentTime - targetSeconds) > 1.5) {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        video.currentTime = targetSeconds
        pendingSeekTimeRef.current = null
        initialSeekDoneRef.current = true
      } else {
        pendingSeekTimeRef.current = targetSeconds
      }
    } else {
      pendingSeekTimeRef.current = null
      initialSeekDoneRef.current = true
    }
  }, [activeStreamSession?.startPositionMs, registerVideoElement])

  // Video aspect ratio auto-resizing
  const handleLoadedVideoMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    registerVideoElement(video)
    const currentState = universalPlayerEngine.getState()
    video.volume = currentState.isMuted ? 0 : currentState.volume
    video.muted = currentState.isMuted
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight)
    }
    if (!initialSeekDoneRef.current || pendingSeekTimeRef.current !== null) {
      applyInitialSeek()
    }
  }, [applyInitialSeek, registerVideoElement])

  // Reset engine refs and clean up HLS when stream session closes
  useEffect(() => {
    if (!activeStreamSession) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      currentStreamUrlRef.current = null
      currentPlaybackMethodRef.current = null
    }
  }, [activeStreamSession])

  // HLS stream playback engine
  useEffect(() => {
    const video = videoElement || videoRef.current
    if (isTrailer || !activeStreamSession || !video) return
    registerVideoElement(video)
    const currentState = universalPlayerEngine.getState()
    video.volume = currentState.isMuted ? 0 : currentState.volume
    video.muted = currentState.isMuted
    const targetUrl =
      playbackMethod === 'direct-play'
        ? activeStreamSession.directUrl || activeStreamSession.hlsUrl
        : activeStreamSession.hlsUrl

    if (!targetUrl) return

    const isHlsAttachedToThisVideo = Boolean(
      hlsRef.current && (hlsRef.current as any).media === video,
    )
    const isDirectPlayingOnThisVideo = Boolean(
      playbackMethod === 'direct-play' && video.src && targetUrl && video.src.includes(targetUrl),
    )

    // If already playing this exact stream URL and engine method on this video element, do not reload
    if (
      currentStreamUrlRef.current === targetUrl &&
      currentPlaybackMethodRef.current === playbackMethod &&
      (isHlsAttachedToThisVideo || isDirectPlayingOnThisVideo)
    ) {
      return
    }

    if (hlsRef.current && (hlsRef.current as any).media !== video) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const previousTime =
      video.currentTime > 0
        ? video.currentTime
        : universalPlayerEngine.getState().position > 0
        ? universalPlayerEngine.getState().position
        : (activeStreamSession.startPositionMs || 0) / 1000

    targetStartTimeRef.current = previousTime
    currentStreamUrlRef.current = targetUrl
    currentPlaybackMethodRef.current = playbackMethod
    initialSeekDoneRef.current = false

    if (playbackMethod === 'direct-play' && activeStreamSession.directUrl) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.preload = 'auto'
      video.src = activeStreamSession.directUrl

      const targetSeekTime = previousTime > 0 ? previousTime : (activeStreamSession.startPositionMs || 0) / 1000
      if (targetSeekTime > 0) {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          video.currentTime = targetSeekTime
          initialSeekDoneRef.current = true
          pendingSeekTimeRef.current = null
        } else {
          pendingSeekTimeRef.current = targetSeekTime
          initialSeekDoneRef.current = false
        }
      } else {
        initialSeekDoneRef.current = true
        pendingSeekTimeRef.current = null
      }

      safePlay(video)
      return
    }

    if (Hls.isSupported()) {
      // FAST RELOAD WITHOUT FULL HLS DESTRUCTION:
      // If HLS is already attached to this video and the itemId is identical (track or quality change),
      // stop load, set startPosition, update source, and resume without tearing down MediaSource.
      const isSameItem = currentItemIdRef.current === activeStreamSession.itemId
      if (hlsRef.current && (hlsRef.current as any).media === video && isSameItem) {
        const hls = hlsRef.current
        hls.stopLoad()
        hls.config.startPosition = previousTime > 0 ? previousTime : -1
        if (
          activeStreamSession.source === 'plex' &&
          activeStreamSession.serverUrl &&
          activeStreamSession.itemId &&
          activeStreamSession.token
        ) {
          void triggerPlexDecision(
            activeStreamSession.serverUrl,
            activeStreamSession.itemId,
            activeStreamSession.token,
            activeStreamSession.playSessionId,
            activeStreamSession.clientId,
            activeStreamSession.maxVideoBitrate || activeStreamSession.videoResolution
              ? {
                  maxVideoBitrate: activeStreamSession.maxVideoBitrate,
                  videoResolution: activeStreamSession.videoResolution,
                  offsetSeconds: previousTime > 0 ? previousTime : undefined,
                }
              : {
                  offsetSeconds: previousTime > 0 ? previousTime : undefined,
                },
          )
        }
        hls.loadSource(activeStreamSession.hlsUrl)
        hls.startLoad(previousTime > 0 ? previousTime : -1)
        safePlay(video)
        return
      }

      currentItemIdRef.current = activeStreamSession.itemId

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      const hls = new Hls({
        capLevelToPlayerSize: true,
        autoStartLoad: true,
        enableWorker: true,
        startPosition: previousTime > 0 ? previousTime : -1,
      })
      hlsRef.current = hls
      if (
        activeStreamSession.source === 'plex' &&
        activeStreamSession.serverUrl &&
        activeStreamSession.itemId &&
        activeStreamSession.token
      ) {
        void triggerPlexDecision(
          activeStreamSession.serverUrl,
          activeStreamSession.itemId,
          activeStreamSession.token,
          activeStreamSession.playSessionId,
          activeStreamSession.clientId,
          activeStreamSession.maxVideoBitrate || activeStreamSession.videoResolution
            ? {
                maxVideoBitrate: activeStreamSession.maxVideoBitrate,
                videoResolution: activeStreamSession.videoResolution,
                offsetSeconds: previousTime > 0 ? previousTime : undefined,
              }
            : {
                offsetSeconds: previousTime > 0 ? previousTime : undefined,
              },
        )
      }
      hls.loadSource(activeStreamSession.hlsUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const qualityOptions = buildQualityOptions(data.levels)
        setAvailableQualitiesRef.current(qualityOptions)
        const targetSeek = targetStartTimeRef.current > 0 ? targetStartTimeRef.current : previousTime
        if (targetSeek > 0) {
          applyInitialSeek(targetSeek)
        } else {
          applyInitialSeek()
        }
        safePlay(video)
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels[data.level]
        if (level) {
          setActiveLevelHeightRef.current(level.height)
        }
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (activeStreamSession.baseUrls && activeStreamSession.baseUrls.length > 1) {
                const nextUrl = activeStreamSession.baseUrls.find(
                  (u) => !triedBaseUrlsRef.current.has(u) && u !== activeStreamSession.serverUrl,
                )
                if (nextUrl) {
                  triedBaseUrlsRef.current.add(nextUrl)
                  failoverToBaseUrlRef.current(nextUrl)
                  return
                }
              }
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              hls.destroy()
              break
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeStreamSession.hlsUrl
      video.load()
      if (previousTime > 0) {
        video.currentTime = previousTime
      }
      safePlay(video)
    }

    return () => {
      // Keep HLS attached during session; clean up on unmount or session switch
    }
  }, [
    activeStreamSession?.hlsUrl,
    activeStreamSession?.directUrl,
    activeStreamSession?.playSessionId,
    activeStreamSession?.selectedQuality,
    applyInitialSeek,
    isTrailer,
    playbackMethod,
    videoElement,
  ])

  // --------------------------------------------------------------------------
  // BUFFER STALL WATCHDOG RECOVERY (>8s stall detection & recovery)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (isTrailer || !activeStreamSession) {
      if (stallWatchdogTimerRef.current) {
        clearInterval(stallWatchdogTimerRef.current)
        stallWatchdogTimerRef.current = null
      }
      stallStartTimeRef.current = null
      lastPlayheadTimeRef.current = -1
      consecutiveStallRecoveriesRef.current = 0
      return
    }

    const checkStall = () => {
      const video = videoElement || videoRef.current
      if (!video) return

      // Do not flag stall if paused, ended, dragging progress, or loading metadata
      if (video.paused || video.ended || isDraggingProgress || video.readyState === 0) {
        stallStartTimeRef.current = null
        lastPlayheadTimeRef.current = video.currentTime
        return
      }

      // Grace period after user action (e.g. seek / play-pause toggle)
      if (Date.now() - lastUserActionRef.current < 2000) {
        stallStartTimeRef.current = null
        lastPlayheadTimeRef.current = video.currentTime
        return
      }

      const currentTime = video.currentTime
      const hasAdvanced =
        lastPlayheadTimeRef.current >= 0 &&
        Math.abs(currentTime - lastPlayheadTimeRef.current) > 0.15

      if (hasAdvanced) {
        lastPlayheadTimeRef.current = currentTime
        stallStartTimeRef.current = null
        consecutiveStallRecoveriesRef.current = 0
        return
      }

      if (lastPlayheadTimeRef.current < 0) {
        lastPlayheadTimeRef.current = currentTime
        return
      }

      const now = Date.now()
      if (stallStartTimeRef.current === null) {
        stallStartTimeRef.current = now
        return
      }

      const stallDuration = now - stallStartTimeRef.current
      if (stallDuration >= 8000) {
        consecutiveStallRecoveriesRef.current += 1
        stallStartTimeRef.current = now

        const hls = hlsRef.current
        if (hls && playbackMethod !== 'direct-play') {
          if (consecutiveStallRecoveriesRef.current === 1) {
            // Tier 1: Recover media error & restart loading
            try {
              hls.recoverMediaError()
            } catch {
              // Ignore recovery error
            }
            hls.startLoad()

            // Micro buffer gap nudge if video is stuck within 1s of buffered start
            if (video.buffered.length > 0) {
              for (let i = 0; i < video.buffered.length; i++) {
                const start = video.buffered.start(i)
                if (start > currentTime && start - currentTime < 1.0) {
                  video.currentTime = start + 0.05
                  break
                }
              }
            }
            safePlay(video)
          } else if (consecutiveStallRecoveriesRef.current === 2) {
            // Tier 2: Multi-server failover if available; otherwise swap audio codec
            if (activeStreamSession.baseUrls && activeStreamSession.baseUrls.length > 1) {
              const nextUrl = activeStreamSession.baseUrls.find(
                (u) => !triedBaseUrlsRef.current.has(u) && u !== activeStreamSession.serverUrl,
              )
              if (nextUrl) {
                triedBaseUrlsRef.current.add(nextUrl)
                failoverToBaseUrlRef.current(nextUrl)
                return
              }
            }
            try {
              hls.swapAudioCodec()
              hls.recoverMediaError()
            } catch {
              // Ignore recovery error
            }
            hls.startLoad()
            safePlay(video)
          } else {
            // Tier 3: Nudge playhead forward past stubborn block
            if (video.duration && currentTime + 1 < video.duration) {
              video.currentTime = currentTime + 0.5
            }
            hls.startLoad()
            safePlay(video)
          }
        } else if (playbackMethod === 'direct-play') {
          if (consecutiveStallRecoveriesRef.current === 1) {
            if (video.duration && currentTime + 0.2 < video.duration) {
              video.currentTime = currentTime + 0.1
            }
            safePlay(video)
          } else {
            // Tier 2 Direct Play: Fall back to HLS transcode without unmounting
            if (fallbackToHlsRef.current) {
              fallbackToHlsRef.current()
            }
          }
        }
      }
    }

    stallWatchdogTimerRef.current = setInterval(checkStall, 1000)

    return () => {
      if (stallWatchdogTimerRef.current) {
        clearInterval(stallWatchdogTimerRef.current)
        stallWatchdogTimerRef.current = null
      }
    }
  }, [
    activeStreamSession,
    isDraggingProgress,
    isTrailer,
    playbackMethod,
    videoElement,
  ])

  // Explicit unmount cleanup for HLS
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      currentStreamUrlRef.current = null
      currentPlaybackMethodRef.current = null
    }
  }, [])

  return {
    videoRef,
    setVideoRef,
    hlsRef,
    iframeRef,
    embedBlocked,
    setEmbedBlocked,
    trailerCurrentTime,
    setTrailerCurrentTime,
    trailerDuration,
    setTrailerDuration,
    trailerBufferedFraction,
    trailerIsPlaying,
    setTrailerIsPlaying,
    videoAspectRatio,
    lastUserActionRef,
    cleanYoutubeId,
    iframeSrc,
    postToTrailer,
    sendTrailerListening,
    handleIframeLoad,
    handleLoadedVideoMetadata,
    applyInitialSeek,
  }
}
