import { useState, useEffect, useCallback, useRef } from 'react'
import { loadPlayerSettings } from '@/features/discover/utils/trailer'
import { useMediaStreamPlayer } from './use-media-stream-player'
import { useUnifiedPlayerEngine } from './use-unified-player-engine'
import { useUnifiedPlayerControls } from './use-unified-player-controls'
import type { UnifiedMediaPlayerModalProps } from '../types/unified-player'

export const useUnifiedPlayerState = ({
  mode: propMode,
  youtubeId,
  title: propTitle,
  streamSession,
  isExiting: propIsExiting,
  onClose: propOnClose,
}: UnifiedMediaPlayerModalProps = {}) => {
  const isTrailer = propMode === 'trailer' || Boolean(youtubeId)

  // Stream Player context
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
    setQuality,
    setInAppPip,
    toggleInAppPip,
    toggleOverallPip,
    onTimeUpdate,
    onBufferedUpdate,
    onBuffering,
    onError: onStreamError,
    fallbackToHls,
  } = streamPlayer

  const activeStreamSession = streamSession ?? contextSession

  // Initial persisted player settings
  const [initialSettings] = useState(loadPlayerSettings)
  const [isZoomedOut, setIsZoomedOutState] = useState(initialSettings.isZoomedOut)
  const [trailerIsTheater, setTrailerIsTheaterState] = useState(initialSettings.isTheater)
  const [trailerIsMuted, setTrailerIsMutedState] = useState(initialSettings.isMuted)
  const [trailerVolume, setTrailerVolumeState] = useState(initialSettings.volume)
  const [hasExternalSpace, setHasExternalSpace] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // External space detection
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

  // Dragging progress ref passed to engine
  const isDraggingProgressRef = useRef(false)

  // Video / Audio Playback Engine
  const engine = useUnifiedPlayerEngine({
    isTrailer,
    youtubeId,
    activeStreamSession,
    streamPlayer,
    trailerIsMuted,
    trailerVolume,
    isDraggingProgress: isDraggingProgressRef.current,
    setTrailerIsMutedState,
  })

  // Effective values
  const effectiveIsTheater = isTrailer ? trailerIsTheater : streamIsTheater
  const effectiveIsPlaying = isTrailer ? engine.trailerIsPlaying : streamIsPlaying
  const effectiveIsMuted = isTrailer ? trailerIsMuted : streamIsMuted
  const effectiveVolume = isTrailer ? trailerVolume : streamVolume
  const effectiveCurrentTime = isTrailer ? engine.trailerCurrentTime : streamCurrentTime
  const effectiveDuration = isTrailer ? engine.trailerDuration : streamDuration
  const effectiveTitle = isTrailer
    ? propTitle
      ? `${propTitle} — Trailer`
      : 'Trailer'
    : activeStreamSession?.title || 'Video Player'

  const isVisible = isTrailer ? !propIsExiting : streamIsOpen

  // Controls & Interactions
  const controls = useUnifiedPlayerControls({
    isTrailer,
    streamPlayer,
    engine,
    effectiveIsPlaying,
    effectiveIsMuted,
    effectiveVolume,
    effectiveDuration,
    effectiveCurrentTime,
    trailerVolume,
    setTrailerVolumeState,
    trailerIsMuted,
    setTrailerIsMutedState,
    isZoomedOut,
    setIsZoomedOutState,
    trailerIsTheater,
    setTrailerIsTheaterState,
    onClose: propOnClose,
    isVisible,
  })

  isDraggingProgressRef.current = controls.isDraggingProgress

  // Metrics calculation
  const progressPercent = effectiveDuration > 0 ? (effectiveCurrentTime / effectiveDuration) * 100 : 0
  const bufferedPercent = isTrailer
    ? Math.min(100, Math.max(0, engine.trailerBufferedFraction * 100))
    : effectiveDuration > 0
    ? (bufferedTime / effectiveDuration) * 100
    : 0

  const currentAspectRatio = isTrailer ? 16 / 9 : engine.videoAspectRatio || 16 / 9
  const maxVideoHeight = controls.isFullscreen
    ? '100vh'
    : hasExternalSpace
    ? 'calc(100vh - 160px)'
    : 'calc(100vh - 32px)'

  return {
    isTrailer,
    isVisible,
    isInAppPip,
    isOverallPip,
    activeStreamSession,
    containerRef,
    hasExternalSpace,
    effectiveTitle,
    effectiveIsTheater,
    effectiveIsPlaying,
    effectiveIsMuted,
    effectiveVolume,
    effectiveCurrentTime,
    effectiveDuration,
    currentAspectRatio,
    maxVideoHeight,
    progressPercent,
    bufferedPercent,
    isZoomedOut,
    activeSubtitle,
    currentQuality,
    availableQualities,
    activeLevelHeight,
    isBuffering,
    streamCurrentTime,
    streamDuration,
    streamIsPlaying,
    streamIsMuted,
    playbackMethod,
    streamPlayer,
    setQuality,
    setInAppPip,
    toggleInAppPip: streamPlayer.toggleInAppPip,
    toggleOverallPip,
    onTimeUpdate,
    onBufferedUpdate,
    onBuffering,
    onStreamError,
    fallbackToHls,
    engine,
    controls,
  }
}
