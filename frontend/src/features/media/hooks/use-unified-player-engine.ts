import { useState, useRef, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import { safePlay, buildYouTubeEmbedUrl } from '../utils/player'
import { extractYoutubeIdFromUrl } from '@/features/discover/utils/hero'
import { buildQualityOptions } from '../utils/quality'
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
  } = streamPlayer

  const { quickStream } = useQuickStream()

  const [embedBlocked, setEmbedBlocked] = useState(false)
  const [trailerIsPlaying, setTrailerIsPlaying] = useState(true)
  const [trailerCurrentTime, setTrailerCurrentTime] = useState(0)
  const [trailerDuration, setTrailerDuration] = useState(0)
  const [trailerBufferedFraction, setTrailerBufferedFraction] = useState(0)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastUserActionRef = useRef<number>(0)
  const initialSeekDoneRef = useRef(false)
  const triedBaseUrlsRef = useRef<Set<string>>(new Set())

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
  useEffect(() => {
    if (!isTrailer && videoRef.current) {
      registerVideoElement(videoRef.current)
    }
  }, [isTrailer, registerVideoElement, isInAppPip])

  // Video aspect ratio auto-resizing
  const handleLoadedVideoMetadata = useCallback(() => {
    const video = videoRef.current
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight)
    }
  }, [])

  // Initial seek for stream mode
  const applyInitialSeek = useCallback(() => {
    const video = videoRef.current
    if (!video || !activeStreamSession?.startPositionMs || initialSeekDoneRef.current) return
    const targetSeconds = activeStreamSession.startPositionMs / 1000
    if (targetSeconds > 0 && Math.abs(video.currentTime - targetSeconds) > 2) {
      video.currentTime = targetSeconds
      initialSeekDoneRef.current = true
    }
  }, [activeStreamSession?.startPositionMs])

  // HLS stream playback engine
  useEffect(() => {
    if (isTrailer || !activeStreamSession || !videoRef.current) return
    initialSeekDoneRef.current = false
    const video = videoRef.current

    if (playbackMethod === 'direct-play' && activeStreamSession.directUrl) {
      video.src = activeStreamSession.directUrl
      video.load()
      safePlay(video)
      return
    }

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      const hls = new Hls({
        capLevelToPlayerSize: true,
        autoStartLoad: true,
        enableWorker: true,
      })
      hlsRef.current = hls
      hls.loadSource(activeStreamSession.hlsUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const qualityOptions = buildQualityOptions(data.levels)
        setAvailableQualities(qualityOptions)
        applyInitialSeek()
        safePlay(video)
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels[data.level]
        if (level) {
          setActiveLevelHeight(level.height)
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
                  failoverToBaseUrl(nextUrl)
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
      safePlay(video)
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [
    activeStreamSession,
    applyInitialSeek,
    failoverToBaseUrl,
    isTrailer,
    playbackMethod,
    setActiveLevelHeight,
    setAvailableQualities,
  ])

  return {
    videoRef,
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
