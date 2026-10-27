import { useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Hls from 'hls.js'
import {
  Clapperboard,
  X,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Tv,
  Settings2,
  PictureInPicture2,
  Check,
  Keyboard,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useMediaStreamPlayer } from '../../hooks/use-media-stream-player'
import { useQuickStream } from '../../hooks/use-quick-stream'
import { OPEN_QUICK_STREAM_EVENT, type QuickStreamEventDetail } from '../../utils/open-quick-stream'
import { cn } from '@/lib/utils'
import { safePlay, buildYouTubeEmbedUrl } from '../../utils/player'
import { loadPlayerSettings, savePlayerSettings, formatTime } from '@/features/discover/utils/trailer'
import { buildQualityOptions, getQualityBadgeLabel } from '../../utils/quality'
import { MediaPlayerInAppPipOverlay } from '../molecules/media-player-in-app-pip-overlay'
import type { UnifiedMediaPlayerModalProps } from '../../types/unified-player'

export const UnifiedMediaPlayerModal = ({
  mode: propMode,
  youtubeId,
  title: propTitle,
  streamSession,
  isExiting: propIsExiting,
  onClose: propOnClose,
}: UnifiedMediaPlayerModalProps = {}) => {
  // If youtubeId or propMode is trailer, we are in trailer mode
  const isTrailer = propMode === 'trailer' || Boolean(youtubeId)

  // --------------------------------------------------------------------------
  // STREAM MODE STATE (via useMediaStreamPlayer)
  // --------------------------------------------------------------------------
  const streamPlayer = useMediaStreamPlayer()
  const {
    session: contextSession,
    isOpen: streamIsOpen,
    isPlaying: streamIsPlaying,
    isBuffering,
    currentTime: streamCurrentTime,
    duration: streamDuration,
    bufferedTime,
    volume: streamVolume,
    isMuted: streamIsMuted,
    isTheater: streamIsTheater,
    isInAppPip,
    isOverallPip,
    activeSubtitle,
    currentQuality,
    availableQualities,
    activeLevelHeight,
    playbackMethod,
    closeStream,
    togglePlay: streamTogglePlay,
    seek: streamSeek,
    setVolume: streamSetVolume,
    toggleMute: streamToggleMute,
    setTheater: streamSetTheater,
    setInAppPip,
    toggleInAppPip,
    toggleOverallPip,
    registerVideoElement,
    setQuality,
    setAvailableQualities,
    setActiveLevelHeight,
    onTimeUpdate,
    onBufferedUpdate,
    onBuffering,
    onError: onStreamError,
    fallbackToHls,
    failoverToBaseUrl,
  } = streamPlayer

  const activeStreamSession = streamSession ?? contextSession
  const { quickStream } = useQuickStream()

  // --------------------------------------------------------------------------
  // COMMON & TRAILER STATE
  // --------------------------------------------------------------------------
  const [initialSettings] = useState(loadPlayerSettings)
  const [isZoomedOut, setIsZoomedOutState] = useState(initialSettings.isZoomedOut)
  const [trailerIsTheater, setTrailerIsTheaterState] = useState(initialSettings.isTheater)
  const [trailerIsMuted, setTrailerIsMutedState] = useState(initialSettings.isMuted)
  const [trailerVolume, setTrailerVolumeState] = useState(initialSettings.volume)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [trailerIsPlaying, setTrailerIsPlaying] = useState(true)
  const [trailerCurrentTime, setTrailerCurrentTime] = useState(0)
  const [trailerDuration, setTrailerDuration] = useState(0)
  const [trailerBufferedFraction, setTrailerBufferedFraction] = useState(0)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [hasExternalSpace, setHasExternalSpace] = useState(false)
  const [embedBlocked, setEmbedBlocked] = useState(false)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9)

  // Stream menus state
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const progressBarRef = useRef<HTMLDivElement | null>(null)
  const volumeContainerRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUserActionRef = useRef<number>(0)
  const dragTimeRef = useRef<number>(0)
  const initialSeekDoneRef = useRef(false)
  const triedBaseUrlsRef = useRef<Set<string>>(new Set())

  // Resolve current effective values depending on mode
  const effectiveIsTheater = isTrailer ? trailerIsTheater : streamIsTheater
  const effectiveIsPlaying = isTrailer ? trailerIsPlaying : streamIsPlaying
  const effectiveIsMuted = isTrailer ? trailerIsMuted : streamIsMuted
  const effectiveVolume = isTrailer ? trailerVolume : streamVolume
  const effectiveCurrentTime = isTrailer ? trailerCurrentTime : streamCurrentTime
  const effectiveDuration = isTrailer ? trailerDuration : streamDuration
  const effectiveTitle = isTrailer
    ? propTitle
      ? `${propTitle} — Trailer`
      : 'Trailer'
    : activeStreamSession?.title || 'Video Player'

  // Visibility check
  const isVisible = isTrailer ? !propIsExiting : streamIsOpen

  // Initialize available qualities for stream mode
  useEffect(() => {
    if (isTrailer || !activeStreamSession) return
    const opts = buildQualityOptions({
      hasDirectPlay: Boolean(activeStreamSession.directUrl),
      source: activeStreamSession.source,
    })
    setAvailableQualities(opts)
  }, [activeStreamSession, isTrailer, setAvailableQualities])

  // --------------------------------------------------------------------------
  // EXTERNAL SPACE DETECTION
  // --------------------------------------------------------------------------
  const checkExternalSpace = useCallback(() => {
    if (typeof window === 'undefined') return
    const height = window.innerHeight
    setHasExternalSpace(height >= 700)
  }, [])

  useEffect(() => {
    checkExternalSpace()
    window.addEventListener('resize', checkExternalSpace)
    return () => window.removeEventListener('resize', checkExternalSpace)
  }, [checkExternalSpace])

  // --------------------------------------------------------------------------
  // AUTO-HIDE CONTROLS
  // --------------------------------------------------------------------------
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (effectiveIsPlaying && !isInAppPip) {
      hideTimerRef.current = setTimeout(() => {
        if (!showSpeedMenu && !showQualityMenu && !showAudioMenu && !showSubtitleMenu && !showVolumeSlider) {
          setControlsVisible(false)
        }
      }, 3000)
    }
  }, [
    effectiveIsPlaying,
    isInAppPip,
    showAudioMenu,
    showQualityMenu,
    showSpeedMenu,
    showSubtitleMenu,
    showVolumeSlider,
  ])

  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  const handleMouseLeave = useCallback(() => {
    if (effectiveIsPlaying && !isInAppPip) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 800)
    }
  }, [effectiveIsPlaying, isInAppPip])

  // Center play/pause splash feedback
  const triggerSplash = useCallback((action: 'play' | 'pause') => {
    setSplashAction(action)
    if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
    splashTimeoutRef.current = setTimeout(() => {
      setSplashAction(null)
    }, 450)
  }, [])

  // --------------------------------------------------------------------------
  // TRAILER ENGINE METHODS & POSTMESSAGE
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

  const setIsZoomedOut = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setIsZoomedOutState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isZoomedOut: next })
      return next
    })
  }, [])

  const setTrailerIsTheater = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setTrailerIsTheaterState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isTheater: next })
      return next
    })
  }, [])

  const toggleZoom = useCallback(() => {
    showControls()
    setIsZoomedOut((prev) => !prev)
  }, [setIsZoomedOut, showControls])

  const toggleTheater = useCallback(() => {
    showControls()
    if (isTrailer) {
      setTrailerIsTheater((prev) => !prev)
    } else {
      streamSetTheater(!streamIsTheater)
    }
  }, [isTrailer, setTrailerIsTheater, showControls, streamIsTheater, streamSetTheater])

  // Play/Pause toggle
  const handleTogglePlay = useCallback(() => {
    showControls()
    if (isTrailer) {
      lastUserActionRef.current = Date.now()
      setTrailerIsPlaying((prev) => {
        const next = !prev
        postToTrailer(next ? 'playVideo' : 'pauseVideo')
        triggerSplash(next ? 'play' : 'pause')
        return next
      })
    } else {
      streamTogglePlay()
      triggerSplash(!streamIsPlaying ? 'play' : 'pause')
    }
  }, [isTrailer, postToTrailer, showControls, streamIsPlaying, streamTogglePlay, triggerSplash])

  // Volume & Mute handlers
  const handleToggleMute = useCallback(() => {
    showControls()
    if (isTrailer) {
      setTrailerIsMutedState((prev) => {
        const next = !prev
        savePlayerSettings({ isMuted: next })
        if (next) {
          postToTrailer('mute')
        } else {
          postToTrailer('unMute')
          if (trailerVolume === 0) {
            setTrailerVolumeState(0.5)
            savePlayerSettings({ volume: 0.5, isMuted: false })
            postToTrailer('setVolume', [50])
          }
        }
        return next
      })
    } else {
      streamToggleMute()
    }
  }, [isTrailer, postToTrailer, showControls, streamToggleMute, trailerVolume])

  const handleVolumeChange = useCallback(
    (newVol: number) => {
      showControls()
      const clamped = Math.max(0, Math.min(1, newVol))
      if (isTrailer) {
        setTrailerVolumeState(clamped)
        const nextMuted = clamped === 0
        setTrailerIsMutedState(nextMuted)
        savePlayerSettings({ volume: clamped, isMuted: nextMuted })
        if (clamped === 0) {
          postToTrailer('mute')
        } else {
          if (trailerIsMuted) {
            postToTrailer('unMute')
          }
          postToTrailer('setVolume', [Math.round(clamped * 100)])
        }
      } else {
        streamSetVolume(clamped)
      }
    },
    [isTrailer, postToTrailer, showControls, streamSetVolume, trailerIsMuted],
  )

  const handleSeekRelative = useCallback(
    (delta: number) => {
      showControls()
      if (effectiveDuration <= 0) return
      const newTime = Math.min(effectiveDuration, Math.max(0, effectiveCurrentTime + delta))
      if (isTrailer) {
        setTrailerCurrentTime(newTime)
        postToTrailer('seekTo', [newTime, true])
      } else {
        streamSeek(newTime)
      }
    },
    [effectiveCurrentTime, effectiveDuration, isTrailer, postToTrailer, showControls, streamSeek],
  )

  const handleClose = useCallback(() => {
    if (isTrailer) {
      if (propOnClose) propOnClose()
    } else {
      closeStream()
    }
  }, [closeStream, isTrailer, propOnClose])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

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
  }, [isDraggingProgress, isTrailer, postToTrailer, sendTrailerListening, trailerIsMuted, trailerVolume])

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

  // Key navigation shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      showControls()

      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false)
        } else {
          handleClose()
        }
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        handleTogglePlay()
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute()
      } else if (e.key === 'z' || e.key === 'Z') {
        toggleZoom()
      } else if (e.key === 't' || e.key === 'T') {
        toggleTheater()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'i' || e.key === 'I') {
        if (!isTrailer) toggleInAppPip()
      } else if (e.key === 'p' || e.key === 'P') {
        if (!isTrailer) toggleOverallPip()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        if (!isTrailer) {
          setShowQualityMenu((prev) => !prev)
          setShowSpeedMenu(false)
          setShowAudioMenu(false)
          setShowSubtitleMenu(false)
        }
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault()
        setShowShortcutsModal((prev) => !prev)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleSeekRelative(isTrailer ? -5 : -10)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleSeekRelative(isTrailer ? 5 : 10)
      }
    },
    [
      handleClose,
      handleSeekRelative,
      handleToggleMute,
      handleTogglePlay,
      isTrailer,
      showControls,
      showShortcutsModal,
      toggleFullscreen,
      toggleInAppPip,
      toggleOverallPip,
      toggleTheater,
      toggleZoom,
    ],
  )

  useEffect(() => {
    if (!isVisible && !isInAppPip) return
    window.addEventListener('keydown', handleKeyDown)
    if (isVisible && !isInAppPip) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [handleKeyDown, isInAppPip, isVisible])

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // --------------------------------------------------------------------------
  // PROGRESS SCRUBBING
  // --------------------------------------------------------------------------
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || effectiveDuration <= 0) return
    showControls()
    setIsDraggingProgress(true)
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const target = fraction * effectiveDuration
    dragTimeRef.current = target

    if (isTrailer) {
      setTrailerCurrentTime(target)
      postToTrailer('seekTo', [target, true])
    } else {
      streamSeek(target)
    }

    const handleMouseMoveWindow = (moveEvent: MouseEvent) => {
      if (!progressBarRef.current) return
      const moveRect = progressBarRef.current.getBoundingClientRect()
      const moveFraction = Math.min(1, Math.max(0, (moveEvent.clientX - moveRect.left) / moveRect.width))
      const moveTarget = moveFraction * effectiveDuration
      dragTimeRef.current = moveTarget
      if (isTrailer) {
        setTrailerCurrentTime(moveTarget)
      } else {
        streamSeek(moveTarget)
      }
    }

    const handleMouseUpWindow = () => {
      setIsDraggingProgress(false)
      if (isTrailer) {
        postToTrailer('seekTo', [dragTimeRef.current, true])
      } else {
        streamSeek(dragTimeRef.current)
      }
      window.removeEventListener('mousemove', handleMouseMoveWindow)
      window.removeEventListener('mouseup', handleMouseUpWindow)
    }

    window.addEventListener('mousemove', handleMouseMoveWindow)
    window.addEventListener('mouseup', handleMouseUpWindow)
  }

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------
  if (!isVisible && !isInAppPip) return null

  const VolumeIcon = effectiveIsMuted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2
  const progressPercent = effectiveDuration > 0 ? (effectiveCurrentTime / effectiveDuration) * 100 : 0
  const bufferedPercent = isTrailer
    ? Math.min(100, Math.max(0, trailerBufferedFraction * 100))
    : effectiveDuration > 0
    ? (bufferedTime / effectiveDuration) * 100
    : 0

  const iframeSrc = youtubeId ? buildYouTubeEmbedUrl(youtubeId) : ''

  // Dynamic aspect ratio calculation
  const currentAspectRatio = isTrailer ? 16 / 9 : videoAspectRatio || 16 / 9
  const maxVideoHeight = isFullscreen
    ? '100vh'
    : hasExternalSpace
    ? 'calc(100vh - 160px)'
    : 'calc(100vh - 32px)'

  // Render Title pill
  const renderTitle = () => (
    <div className="flex h-9 items-center gap-2 pl-2 pr-3.5 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-lg border-0 min-w-0">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Clapperboard className="h-3 w-3" />
      </span>
      <span className="truncate text-xs sm:text-sm font-medium text-primary-foreground max-w-[200px] sm:max-w-md">
        {effectiveTitle}
      </span>
      {!isTrailer && activeStreamSession?.source && (
        <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold uppercase tracking-wider">
          {activeStreamSession.source}
        </span>
      )}
    </div>
  )

  // Render Header with Title and Close button
  const renderHeader = () => (
    <div className="flex items-center justify-between w-full px-1">
      {renderTitle()}
      <button
        type="button"
        onClick={handleClose}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] hover:bg-white/15 text-muted-foreground hover:text-primary-foreground backdrop-blur-xl shadow-lg transition-all border-0 pointer-events-auto"
        aria-label={isTrailer ? 'Close trailer' : 'Close (Esc)'}
        title={isTrailer ? 'Close trailer' : 'Close (Esc)'}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )

  // Render Scrubber progress bar
  const renderProgressBar = () => (
    <div
      ref={progressBarRef}
      role="slider"
      tabIndex={0}
      aria-label="Video timeline"
      aria-valuemin={0}
      aria-valuemax={effectiveDuration || 100}
      aria-valuenow={effectiveCurrentTime}
      onMouseDown={handleProgressMouseDown}
      className="relative h-4 flex items-center cursor-pointer group pointer-events-auto select-none border-0"
    >
      <div className="h-1.5 w-full rounded-full bg-white/15 group-hover:h-2 transition-all duration-150 overflow-hidden relative border-0">
        {bufferedPercent > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-all duration-300 border-0"
            style={{ width: `${bufferedPercent}%` }}
          />
        )}
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] transition-all duration-75 border-0"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {(progressPercent > 0 || isDraggingProgress) && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-primary-foreground shadow-[0_0_8px_rgba(0,0,0,0.6)] transition-opacity duration-150 border-0 ${
            isDraggingProgress ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${progressPercent}%` }}
        />
      )}
    </div>
  )

  // Render Controls row
  const renderControlsRow = () => (
    <div className="flex items-center justify-between gap-2 pointer-events-auto">
      {/* Left controls: Play/Pause, Skip, Volume, Time */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] hover:bg-white/15 text-primary-foreground backdrop-blur-xl shadow-lg transition-all border-0"
          aria-label={effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
          title={effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {effectiveIsPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        {!isTrailer && (
          <>
            <button
              type="button"
              onClick={() => handleSeekRelative(-10)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
              title="Seek -10s (Left Arrow)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSeekRelative(10)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
              title="Seek +10s (Right Arrow)"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Volume popover */}
        <div ref={volumeContainerRef} onMouseEnter={() => setShowVolumeSlider(true)} className="relative flex items-center">
          <button
            type="button"
            onClick={handleToggleMute}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
            aria-label={effectiveIsMuted ? 'Unmute (M)' : 'Mute (M)'}
            title={effectiveIsMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          {showVolumeSlider && (
            <div
              className="absolute left-full ml-1.5 px-3 py-2 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-xl flex items-center gap-2 border-0 z-30"
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <input
                type="range"
                role="slider"
                aria-label="Volume slider"
                aria-valuenow={effectiveIsMuted ? 0 : effectiveVolume}
                min="0"
                max="1"
                step="0.05"
                value={effectiveIsMuted ? 0 : effectiveVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 h-1 accent-primary cursor-pointer border-0"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-7 text-right">
                {Math.round((effectiveIsMuted ? 0 : effectiveVolume) * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground pl-1 truncate">
          <span>{formatTime(effectiveCurrentTime)}</span>
          <span className="opacity-50">/</span>
          <span className="opacity-70">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* Right controls: Zoom, Quality, Tracks, PiP, Theater, Fullscreen, Close */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {isTrailer && (
          <button
            type="button"
            onClick={toggleZoom}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
            aria-label={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
            title={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
          >
            {isZoomedOut ? <ZoomIn className="h-4 w-4" /> : <ZoomOut className="h-4 w-4" />}
          </button>
        )}

        {/* Stream Quality Menu */}
        {!isTrailer && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQualityMenu((prev) => !prev)}
              className={cn(
                'flex h-8 px-2.5 items-center gap-1 rounded-full text-xs font-medium transition-all border-0',
                showQualityMenu
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
              )}
              title="Video Quality (Q)"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{getQualityBadgeLabel(currentQuality, availableQualities, activeLevelHeight)}</span>
            </button>
            {showQualityMenu && (
              <div
                className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left border-0 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-muted-foreground">Quality</div>
                {availableQualities.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setQuality(q.id)
                      setShowQualityMenu(false)
                    }}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between',
                      currentQuality === q.id
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'text-muted-foreground hover:bg-white/10 hover:text-primary-foreground'
                    )}
                  >
                    <span>{q.label}</span>
                    {currentQuality === q.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* In-app PiP mode */}
        {!isTrailer && (
          <button
            type="button"
            onClick={toggleInAppPip}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
            title="Minimize to in-app player (I)"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}

        {/* OS PiP */}
        {!isTrailer && (
          <button
            type="button"
            onClick={toggleOverallPip}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-all border-0',
              isOverallPip
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
            )}
            title="Picture-in-Picture (OS window) (P)"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}

        {/* Theater mode */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={toggleTheater}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-all border-0',
              effectiveIsTheater
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
            )}
            aria-label={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
            title={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
          >
            <Tv className="h-4 w-4" />
          </button>
        )}

        {/* Fullscreen */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0"
          title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )

  // In-app PiP mode render (stream mode)
  if (!isTrailer && isInAppPip) {
    return createPortal(
      <div className="fixed bottom-6 right-6 z-50 w-80 aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border-0">
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain"
          onTimeUpdate={() => {
            if (videoRef.current && !isDraggingProgress) {
              onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || streamDuration)
            }
          }}
          onProgress={() => {
            if (videoRef.current && videoRef.current.buffered.length > 0) {
              const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
              onBufferedUpdate(bufferedEnd)
            }
          }}
        />
        <MediaPlayerInAppPipOverlay
          title={effectiveTitle}
          source={activeStreamSession?.source || ''}
          isPlaying={streamIsPlaying}
          isBuffering={isBuffering}
          isOverallPip={isOverallPip}
          currentTime={streamCurrentTime}
          duration={streamDuration}
          isMuted={streamIsMuted}
          controlsVisible={controlsVisible}
          onTogglePlay={handleTogglePlay}
          onSkipBack={() => handleSeekRelative(-10)}
          onSkipForward={() => handleSeekRelative(10)}
          onSeek={streamSeek}
          onToggleMute={handleToggleMute}
          onRestore={() => setInAppPip(false)}
          onToggleOverallPip={toggleOverallPip}
          onClose={handleClose}
        />
      </div>,
      document.body
    )
  }

  // Standalone shortcuts modal
  const renderShortcutsModal = () => {
    if (!showShortcutsModal) return null
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md border-0"
        onClick={() => setShowShortcutsModal(false)}
      >
        <div
          className="w-full max-w-sm rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-6 shadow-2xl flex flex-col gap-4 border-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-primary-foreground flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              Keyboard Shortcuts
            </h3>
            <button
              type="button"
              onClick={() => setShowShortcutsModal(false)}
              className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Play / Pause</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Space / K</kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Mute / Unmute</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">M</kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Seek ±10s</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">← / →</kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Theater Mode</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">T</kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Fullscreen</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">F</kbd>
            </div>
            {isTrailer && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                <span className="text-foreground">Zoom In / Out</span>
                <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Z</kbd>
              </div>
            )}
            {!isTrailer && (
              <>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                  <span className="text-foreground">In-App PiP</span>
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">I</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                  <span className="text-foreground">Picture-in-Picture (OS)</span>
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">P</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                  <span className="text-foreground">Quality</span>
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Q</kbd>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN PORTAL RENDER
  // --------------------------------------------------------------------------
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md border-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleClose}
      >
        <motion.div
          className={cn(
            'relative flex flex-col gap-2.5 transition-all duration-300 ease-out',
            isFullscreen
              ? 'w-full h-full rounded-none'
              : effectiveIsTheater
              ? 'w-full max-w-none px-2 sm:px-6 md:px-8'
              : 'w-full max-w-5xl px-4'
          )}
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: isVisible ? 1 : 0.94, opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* EXTERNAL MODE: Title header rendered above video when space allows */}
          {hasExternalSpace && !isFullscreen && renderHeader()}

          {/* Dynamic Aspect Ratio Video Canvas Container */}
          <div
            className={cn(
              'relative w-full rounded-3xl sm:rounded-[32px] overflow-hidden bg-black shadow-2xl select-none border-0 transition-[aspect-ratio] duration-200',
              controlsVisible ? 'cursor-default' : 'cursor-none'
            )}
            style={{
              aspectRatio: currentAspectRatio,
              maxHeight: maxVideoHeight,
            }}
          >
            {/* OVERLAY MODE: Top vignette & Title rendered inside when space is constrained or fullscreen */}
            {(!hasExternalSpace || isFullscreen) && (
              <>
                <motion.div
                  animate={{ opacity: controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/85 via-black/35 to-transparent pointer-events-none z-10 rounded-t-3xl sm:rounded-t-[32px]"
                />
                <motion.div
                  initial={false}
                  animate={{
                    opacity: controlsVisible ? 1 : 0,
                    y: controlsVisible ? 0 : -8,
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`absolute top-4 left-4 right-4 z-20 ${
                    controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  {renderHeader()}
                </motion.div>
              </>
            )}

            {/* TRAILER ENGINE: YouTube Embed Iframe or Blocked Fallback Card */}
            {isTrailer ? (
              embedBlocked ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-md">
                  <div className="max-w-md p-6 rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-2xl flex flex-col items-center gap-4 border-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Clapperboard className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-primary-foreground">Trailer Playback Restricted</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        The video publisher has restricted third-party embedded playback for this trailer.
                      </p>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium text-xs sm:text-sm shadow-md hover:opacity-90 transition-opacity"
                    >
                      Watch on YouTube ↗
                    </a>
                  </div>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  src={iframeSrc}
                  title={propTitle ? `${propTitle} trailer` : 'Trailer'}
                  onLoad={handleIframeLoad}
                  frameBorder="0"
                  className={cn(
                    'w-full h-full origin-center transition-transform duration-300 ease-out pointer-events-none border-0',
                    isZoomedOut ? 'scale-100' : 'scale-[1.35]'
                  )}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )
            ) : (
              /* STREAM ENGINE: HTML5 / HLS Video Element */
              <video
                ref={videoRef}
                playsInline
                disablePictureInPicture={false}
                className="w-full h-full object-contain"
                onLoadedMetadata={() => {
                  handleLoadedVideoMetadata()
                  applyInitialSeek()
                }}
                onCanPlay={() => {
                  handleLoadedVideoMetadata()
                  applyInitialSeek()
                }}
                onTimeUpdate={() => {
                  if (videoRef.current && !isDraggingProgress) {
                    onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || streamDuration)
                  }
                }}
                onProgress={() => {
                  if (videoRef.current && videoRef.current.buffered.length > 0) {
                    const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
                    onBufferedUpdate(bufferedEnd)
                  }
                }}
                onWaiting={() => onBuffering(true)}
                onPlaying={() => onBuffering(false)}
                onError={() => {
                  if (playbackMethod === 'direct-play') {
                    fallbackToHls()
                  } else {
                    onStreamError('Video playback error encountered')
                  }
                }}
              >
                {activeSubtitle?.url && (
                  <track
                    kind="subtitles"
                    src={activeSubtitle.url}
                    label={activeSubtitle.label || 'Subtitles'}
                    srcLang={
                      activeSubtitle.language && activeSubtitle.language !== 'und'
                        ? activeSubtitle.language
                        : 'en'
                    }
                    default
                  />
                )}
              </video>
            )}

            {/* Click-to-Play/Pause interactive gesture overlay */}
            <div
              className="absolute inset-0 cursor-pointer z-10 flex items-center justify-center border-0"
              onClick={handleTogglePlay}
              onDoubleClick={isTrailer ? toggleZoom : toggleFullscreen}
              aria-label={effectiveIsPlaying ? 'Pause video' : 'Play video'}
              role="button"
              tabIndex={-1}
            >
              {/* Play/Pause center splash feedback animation */}
              <AnimatePresence>
                {splashAction && (
                  <motion.div
                    key={splashAction}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.35 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black/65 backdrop-blur-md text-primary-foreground shadow-2xl pointer-events-none border-0"
                  >
                    {splashAction === 'play' ? (
                      <Play className="h-8 w-8 sm:h-10 sm:w-10 fill-current ml-1 text-primary-foreground" />
                    ) : (
                      <Pause className="h-8 w-8 sm:h-10 sm:w-10 fill-current text-primary-foreground" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* OVERLAY MODE: Bottom vignette & Controls rendered inside when space is constrained or fullscreen */}
            {(!hasExternalSpace || isFullscreen) && (
              <>
                <motion.div
                  animate={{ opacity: controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10 rounded-b-3xl sm:rounded-b-[32px]"
                />
                <motion.div
                  initial={false}
                  animate={{
                    opacity: controlsVisible ? 1 : 0,
                    y: controlsVisible ? 0 : 10,
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={cn(
                    'absolute bottom-3 sm:bottom-4 inset-x-4 sm:inset-x-6 z-20 flex flex-col gap-2.5',
                    controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
                  )}
                >
                  {renderProgressBar()}
                  {renderControlsRow()}
                </motion.div>
              </>
            )}
          </div>

          {/* EXTERNAL MODE: Controls rendered outside below video when viewport allows */}
          {hasExternalSpace && !isFullscreen && (
            <div className="w-full flex flex-col gap-2.5 px-1 pointer-events-auto">
              {renderProgressBar()}
              {renderControlsRow()}
            </div>
          )}
        </motion.div>

        {renderShortcutsModal()}
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
