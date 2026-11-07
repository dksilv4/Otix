import { useState, useRef, useEffect, useCallback } from 'react'
import { savePlayerSettings } from '@/features/discover/utils/trailer'
import type { useMediaStreamPlayer } from './use-media-stream-player'
import type { useUnifiedPlayerEngine } from './use-unified-player-engine'

export interface UseUnifiedPlayerControlsProps {
  isTrailer: boolean
  streamPlayer: ReturnType<typeof useMediaStreamPlayer>
  engine: ReturnType<typeof useUnifiedPlayerEngine>
  effectiveIsPlaying: boolean
  effectiveIsMuted: boolean
  effectiveVolume: number
  effectiveDuration: number
  effectiveCurrentTime: number
  trailerVolume: number
  setTrailerVolumeState: (v: number) => void
  trailerIsMuted: boolean
  setTrailerIsMutedState: (m: boolean) => void
  isZoomedOut: boolean
  setIsZoomedOutState: (updater: (prev: boolean) => boolean) => void
  trailerIsTheater: boolean
  setTrailerIsTheaterState: (updater: (prev: boolean) => boolean) => void
  onClose?: () => void
  isVisible: boolean
  isDraggingProgress?: boolean
  setIsDraggingProgress?: (dragging: boolean) => void
}

export const useUnifiedPlayerControls = ({
  isTrailer,
  streamPlayer,
  engine,
  effectiveIsPlaying: _effectiveIsPlaying,
  effectiveIsMuted: _effectiveIsMuted,
  effectiveVolume: _effectiveVolume,
  effectiveDuration,
  trailerVolume,
  setTrailerVolumeState,
  trailerIsMuted,
  setTrailerIsMutedState,
  isZoomedOut: _isZoomedOut,
  setIsZoomedOutState,
  trailerIsTheater: _trailerIsTheater,
  setTrailerIsTheaterState,
  onClose,
  isVisible,
  isDraggingProgress: propIsDraggingProgress,
  setIsDraggingProgress: propSetIsDraggingProgress,
}: UseUnifiedPlayerControlsProps) => {
  const {
    isPlaying: streamIsPlaying,
    isTheater: streamIsTheater,
    isInAppPip,
    closeStream,
    togglePlay: streamTogglePlay,
    seek: streamSeek,
    setVolume: streamSetVolume,
    toggleMute: streamToggleMute,
    setTheater: streamSetTheater,
    toggleInAppPip,
    toggleOverallPip,
  } = streamPlayer

  const {
    postToTrailer,
    lastUserActionRef,
    setTrailerIsPlaying,
    setTrailerCurrentTime,
  } = engine

  const [controlsVisible, setControlsVisible] = useState(true)
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | null>(null)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [localDraggingProgress, setLocalDraggingProgress] = useState(false)
  const isDraggingProgress = propIsDraggingProgress ?? localDraggingProgress
  const setIsDraggingProgress = propSetIsDraggingProgress ?? setLocalDraggingProgress

  const progressBarRef = useRef<HTMLDivElement | null>(null)
  const volumeContainerRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragTimeRef = useRef<number>(0)

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, 3500)
  }, [])

  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  const handleMouseLeave = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, 1000)
  }, [])

  // Splash animation trigger
  const triggerSplash = useCallback((action: 'play' | 'pause') => {
    setSplashAction(action)
    if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
    splashTimeoutRef.current = setTimeout(() => {
      setSplashAction(null)
    }, 500)
  }, [])

  // Zoom and theater persistence
  const setIsZoomedOut = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setIsZoomedOutState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isZoomedOut: next })
      return next
    })
  }, [setIsZoomedOutState])

  const setTrailerIsTheater = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setTrailerIsTheaterState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isTheater: next })
      return next
    })
  }, [setTrailerIsTheaterState])

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
  }, [isTrailer, lastUserActionRef, postToTrailer, setTrailerIsPlaying, showControls, streamIsPlaying, streamTogglePlay, triggerSplash])

  // Volume & Mute handlers
  const handleToggleMute = useCallback(() => {
    showControls()
    if (isTrailer) {
      const next = !trailerIsMuted
      setTrailerIsMutedState(next)
      savePlayerSettings({ isMuted: next })
      if (next) {
        postToTrailer('mute')
      } else {
        postToTrailer('unMute')
        postToTrailer('setVolume', [Math.round(trailerVolume * 100)])
      }
    } else {
      streamToggleMute()
    }
  }, [isTrailer, postToTrailer, setTrailerIsMutedState, showControls, streamToggleMute, trailerIsMuted, trailerVolume])

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      showControls()
      const clamped = Math.min(1, Math.max(0, newVolume))
      if (isTrailer) {
        setTrailerVolumeState(clamped)
        savePlayerSettings({ volume: clamped })
        postToTrailer('setVolume', [Math.round(clamped * 100)])
        if (clamped > 0 && trailerIsMuted) {
          setTrailerIsMutedState(false)
          postToTrailer('unMute')
        }
      } else {
        streamSetVolume(clamped)
      }
    },
    [isTrailer, postToTrailer, setTrailerIsMutedState, setTrailerVolumeState, showControls, streamSetVolume, trailerIsMuted],
  )

  const handleSeekRelative = useCallback(
    (seconds: number) => {
      showControls()
      if (isTrailer) {
        setTrailerCurrentTime((prev) => {
          const next = Math.max(0, Math.min(engine.trailerDuration, prev + seconds))
          postToTrailer('seekTo', [next, true])
          return next
        })
      } else {
        streamSeek(Math.max(0, Math.min(effectiveDuration, streamPlayer.currentTime + seconds)))
      }
    },
    [engine.trailerDuration, isTrailer, postToTrailer, setTrailerCurrentTime, showControls, streamPlayer.currentTime, streamSeek, effectiveDuration],
  )

  const handleClose = useCallback(() => {
    if (isTrailer) {
      onClose?.()
    } else {
      closeStream()
    }
  }, [closeStream, isTrailer, onClose])

  const toggleFullscreen = useCallback(() => {
    showControls()
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    } else {
      void document.exitFullscreen().catch(() => {})
    }
  }, [showControls])

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Keyboard navigation shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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

  // Close volume popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Progress scrubbing
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

  return {
    controlsVisible,
    setControlsVisible,
    showControls,
    handleMouseMove,
    handleMouseLeave,
    splashAction,
    triggerSplash,
    handleTogglePlay,
    handleToggleMute,
    handleVolumeChange,
    handleSeekRelative,
    handleClose,
    toggleZoom,
    toggleTheater,
    toggleFullscreen,
    isFullscreen,
    showVolumeSlider,
    setShowVolumeSlider,
    showQualityMenu,
    setShowQualityMenu,
    showShortcutsModal,
    setShowShortcutsModal,
    progressBarRef,
    volumeContainerRef,
    isDraggingProgress,
    handleProgressMouseDown,
  }
}
