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
    setQuality: streamSetQuality,
    setInAppPip,
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

  const [isDraggingProgress, setIsDraggingProgress] = useState(false)

  // Video / Audio Playback Engine
  const engine = useUnifiedPlayerEngine({
    isTrailer,
    youtubeId,
    activeStreamSession,
    streamPlayer,
    trailerIsMuted,
    trailerVolume,
    isDraggingProgress,
    setTrailerIsMutedState,
  })

  // Effective values
  const effectiveIsTheater = isTrailer ? trailerIsTheater : streamIsTheater
  const effectiveIsPlaying = isTrailer ? engine.trailerIsPlaying : streamIsPlaying
  const effectiveIsMuted = isTrailer ? trailerIsMuted : streamIsMuted
  const effectiveVolume = isTrailer ? trailerVolume : streamVolume
  const effectiveCurrentTime = isTrailer ? engine.trailerCurrentTime : streamCurrentTime
  const effectiveDuration = isTrailer ? engine.trailerDuration : streamDuration
  const episodeName =
    activeStreamSession?.episodeContext?.episodeTitle ||
    (activeStreamSession?.episodeContext?.episodeNumber != null
      ? `Episode ${activeStreamSession.episodeContext.episodeNumber}`
      : null) ||
    (() => {
      if (!activeStreamSession?.subtitle) return null
      const match = activeStreamSession.subtitle.match(/(?:S\d+[:E]\d+|\bE\d+\b)\s*[-·•:]\s*(.+)/i)
      return match?.[1]?.trim() || null
    })()

  const effectiveTitle = isTrailer
    ? propTitle
      ? `${propTitle} — Trailer`
      : 'Trailer'
    : episodeName || activeStreamSession?.title || 'Video Player'

  const effectiveSubtitle = isTrailer
    ? 'Trailer'
    : activeStreamSession?.episodeContext?.seriesTitle
    ? `${activeStreamSession.episodeContext.seriesTitle} · S${activeStreamSession.episodeContext.seasonNumber}:E${activeStreamSession.episodeContext.episodeNumber}`
    : activeStreamSession?.subtitle

  const isVisible = isTrailer ? !propIsExiting : streamIsOpen

  // Controls & Interactions
  const controls = useUnifiedPlayerControls({
    isTrailer,
    streamPlayer,
    engine,
    effectiveIsPlaying,
    effectiveDuration,
    effectiveCurrentTime,
    trailerVolume,
    setTrailerVolumeState,
    trailerIsMuted,
    setTrailerIsMutedState,
    setIsZoomedOutState,
    setTrailerIsTheaterState,
    onClose: propOnClose,
    isVisible,
    isDraggingProgress,
    setIsDraggingProgress,
    subtitles: activeStreamSession?.subtitles || [],
    activeSubtitle,
    onSelectSubtitleTrack: streamPlayer.setActiveSubtitle,
  })

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
    : effectiveIsTheater
    ? '100vh'
    : hasExternalSpace
    ? 'calc(100vh - 160px)'
    : 'calc(100vh - 32px)'

  const setQuality = useCallback(
    (qualityId: string) => {
      const hls = engine.hlsRef.current
      const qual = availableQualities.find((q) => q.id === qualityId)
      if (hls && qual?.hlsLevelIndex !== undefined) {
        hls.currentLevel = qual.hlsLevelIndex
      } else if (hls && qualityId === 'auto') {
        hls.currentLevel = -1
      }
      streamSetQuality(qualityId)
      if (qual) {
        streamPlayer.updateSessionQuality(qual)
      }
    },
    [availableQualities, engine.hlsRef, streamPlayer, streamSetQuality],
  )

  return {
    isTrailer,
    isVisible,
    isInAppPip,
    isOverallPip,
    activeStreamSession,
    containerRef,
    hasExternalSpace,
    effectiveTitle,
    effectiveSubtitle,
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
    subtitles: activeStreamSession?.subtitles || [],
    activeAudio: streamPlayer.activeAudio,
    audioTracks: activeStreamSession?.audioTracks || [],
    currentQuality,
    availableQualities,
    activeLevelHeight,
    queue: streamPlayer.queue || [],
    skipToIndex: streamPlayer.skipToIndex,
    removeFromQueue: streamPlayer.removeFromQueue,
    clearQueue: streamPlayer.clearQueue,
    isBuffering,
    streamCurrentTime,
    streamDuration,
    streamIsPlaying,
    streamIsMuted,
    playbackMethod,
    streamPlayer,
    setQuality,
    setActiveAudio: streamPlayer.setActiveAudio,
    setActiveSubtitle: streamPlayer.setActiveSubtitle,
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
