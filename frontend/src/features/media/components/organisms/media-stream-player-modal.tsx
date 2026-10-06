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
  Subtitles,
  AudioLines,
  Tv,
  AlertTriangle,
  Loader2,
  HelpCircle,
  Gauge,
  PictureInPicture2,
  Check,
  Keyboard,
} from 'lucide-react'
import { useMediaStreamPlayer } from '../../hooks/use-media-stream-player'
import { cn } from '@/lib/utils'

import { safePlay, safePause, formatSeconds } from '../../utils/player'

export const MediaStreamPlayerModal = () => {
  const {
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
    activeSubtitle,
    activeAudio,
    playbackMethod,
    error,
    closeStream,
    togglePlay,
    seek,
    setVolume,
    setPlaybackSpeed,
    toggleMute,
    setTheater,
    setActiveSubtitle,
    setActiveAudio,
    onTimeUpdate,
    onBufferedUpdate,
    onBuffering,
    onError,
    fallbackToHls,
  } = useMediaStreamPlayer()

  const [controlsVisible, setControlsVisible] = useState(true)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showRemainingTime, setShowRemainingTime] = useState(false)

  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [dragTime, setDragTime] = useState(0)
  const [hoverScrubTime, setHoverScrubTime] = useState<number | null>(null)
  const [hoverScrubPercent, setHoverScrubPercent] = useState<number>(0)

  const [splashAction, setSplashAction] = useState<'play' | 'pause' | 'skip-fwd' | 'skip-back' | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickTimeRef = useRef<number>(0)

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        if (
          !showVolumeSlider &&
          !showSubtitleMenu &&
          !showAudioMenu &&
          !showSpeedMenu &&
          !showShortcutsModal &&
          !isDraggingProgress
        ) {
          setControlsVisible(false)
        }
      }, 2800)
    }
  }, [
    isPlaying,
    showVolumeSlider,
    showSubtitleMenu,
    showAudioMenu,
    showSpeedMenu,
    showShortcutsModal,
    isDraggingProgress,
  ])

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  // Picture in Picture
  const togglePiP = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture()
      }
    } catch (err) {
      console.warn('[StreamPlayer] PiP toggle failed:', err)
    }
  }, [])

  // Splash trigger
  const triggerSplash = (action: 'play' | 'pause' | 'skip-fwd' | 'skip-back') => {
    setSplashAction(action)
    if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
    splashTimeoutRef.current = setTimeout(() => setSplashAction(null), 650)
  }

  const handleTogglePlay = useCallback(() => {
    triggerSplash(isPlaying ? 'pause' : 'play')
    togglePlay()
    showControls()
  }, [isPlaying, togglePlay, showControls])

  // Skip handlers
  const handleSkipBack = useCallback(() => {
    const newTime = Math.max(0, currentTime - 10)
    seek(newTime)
    if (videoRef.current) videoRef.current.currentTime = newTime
    triggerSplash('skip-back')
    showControls()
  }, [currentTime, seek, showControls])

  const handleSkipForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 10)
    seek(newTime)
    if (videoRef.current) videoRef.current.currentTime = newTime
    triggerSplash('skip-fwd')
    showControls()
  }, [currentTime, duration, seek, showControls])

  const initialSeekDoneRef = useRef(false)
  const targetSeekTime = (session?.startPositionMs || 0) / 1000

  // Reset initial seek state when session changes
  useEffect(() => {
    initialSeekDoneRef.current = false
  }, [session?.itemId])

  const applyInitialSeek = useCallback(() => {
    const video = videoRef.current
    if (!video || initialSeekDoneRef.current) return
    if (targetSeekTime > 0) {
      initialSeekDoneRef.current = true
      try {
        video.currentTime = targetSeekTime
      } catch (err) {
        console.warn('[StreamPlayer] Seek on metadata failed:', err)
      }
      seek(targetSeekTime)
    }
  }, [targetSeekTime, seek])

  // Sync playback rate / speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Mount media stream (Direct Play or HLS)
  useEffect(() => {
    const video = videoRef.current
    if (!isOpen || !session || !video) return

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const useDirect = playbackMethod === 'direct-play' && !!session.directUrl

    if (useDirect) {
      video.src = session.directUrl!
      video.playbackRate = playbackSpeed
      if (isPlaying) {
        safePlay(video)
      }
    } else {
      // HLS Transcode / Remux
      if (Hls.isSupported()) {
        const hls = new Hls({
          startPosition: targetSeekTime > 0 ? targetSeekTime : -1,
          enableWorker: true,
          lowLatencyMode: true,
        })
        hlsRef.current = hls
        hls.loadSource(session.hlsUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          applyInitialSeek()
          video.playbackRate = playbackSpeed
          if (isPlaying) {
            safePlay(video)
          }
        })

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[StreamPlayer] HLS network error, recovering...', data)
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[StreamPlayer] HLS media error, recovering...', data)
                hls.recoverMediaError()
                break
              default:
                onError(`HLS playback error: ${data.details}`)
                hls.destroy()
                break
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        video.src = session.hlsUrl
        video.currentTime = currentTime
        video.playbackRate = playbackSpeed
        if (isPlaying) {
          safePlay(video)
        }
      } else {
        onError('Your browser does not support HLS adaptive video playback.')
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.itemId, playbackMethod])

  // Sync isPlaying state with video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying && video.paused) {
      safePlay(video)
    } else if (!isPlaying && !video.paused) {
      safePause(video)
    }
  }, [isPlaying])

  // Sync volume / mute with video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = isMuted
  }, [volume, isMuted])

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === ' ' || e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        handleTogglePlay()
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        handleSkipBack()
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        handleSkipForward()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setVolume(volume + 0.05)
        showControls()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setVolume(volume - 0.05)
        showControls()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMute()
        showControls()
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setTheater(!isTheater)
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        togglePiP()
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        if (session && session.subtitles.length > 0) {
          if (activeSubtitle) {
            setActiveSubtitle(null)
          } else {
            setActiveSubtitle(session.subtitles[0].id || String(session.subtitles[0].index))
          }
        }
      } else if (e.key === '?') {
        e.preventDefault()
        setShowShortcutsModal((v) => !v)
      } else if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false)
        } else if (!document.fullscreenElement) {
          closeStream()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    handleTogglePlay,
    handleSkipBack,
    handleSkipForward,
    volume,
    toggleFullscreen,
    toggleMute,
    togglePiP,
    setVolume,
    setTheater,
    isTheater,
    session,
    activeSubtitle,
    setActiveSubtitle,
    closeStream,
    showControls,
    showShortcutsModal,
  ])

  // Track buffered ranges
  const updateBufferedRanges = () => {
    const video = videoRef.current
    if (!video || !video.buffered.length) return
    try {
      const end = video.buffered.end(video.buffered.length - 1)
      onBufferedUpdate(end)
    } catch {
      // Ignore buffer index out of range
    }
  }

  // Scrubber dragging
  const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return
    setIsDraggingProgress(true)
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setDragTime(fraction * duration)
  }

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverScrubTime(fraction * duration)
    setHoverScrubPercent(fraction * 100)
  }

  const handleScrubberMouseLeave = () => {
    setHoverScrubTime(null)
  }

  useEffect(() => {
    if (!isDraggingProgress) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressBarRef.current || duration <= 0) return
      const rect = progressBarRef.current.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      setDragTime(fraction * duration)
    }

    const handleMouseUp = () => {
      setIsDraggingProgress(false)
      seek(dragTime)
      if (videoRef.current) {
        videoRef.current.currentTime = dragTime
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingProgress, dragTime, duration, seek])

  // Double-click to seek left / right gesture on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now()
    const diff = now - lastClickTimeRef.current
    lastClickTimeRef.current = now

    if (diff < 280) {
      // Double click detected: determine if clicked left or right half
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      if (clickX < rect.width * 0.35) {
        handleSkipBack()
      } else if (clickX > rect.width * 0.65) {
        handleSkipForward()
      } else {
        handleTogglePlay()
      }
    } else {
      // Single click: toggle play
      handleTogglePlay()
    }
  }

  if (!isOpen || !session || typeof document === 'undefined') return null

  const progressTime = isDraggingProgress ? dragTime : currentTime
  const progressPercent = duration > 0 ? (progressTime / duration) * 100 : 0
  const bufferedPercent = duration > 0 ? (bufferedTime / duration) * 100 : 0
  const isShow = !!session.episodeContext

  return createPortal(
    <AnimatePresence>
      <div
        ref={containerRef}
        className={cn(
          'fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 select-none font-sans transition-all duration-300',
          !controlsVisible && isPlaying ? 'cursor-none' : 'cursor-default'
        )}
        onMouseMove={showControls}
        onClick={() => {
          setShowSubtitleMenu(false)
          setShowAudioMenu(false)
          setShowSpeedMenu(false)
        }}
      >
        {/* Subtle Ambient Glow Behind Video */}
        <div className="absolute inset-0 max-w-5xl max-h-[75vh] m-auto bg-primary/10 rounded-full blur-[140px] pointer-events-none opacity-60" />

        {/* Video Surface Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={cn(
            'relative overflow-hidden flex items-center justify-center bg-black transition-all duration-300 shadow-[0_32px_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)]',
            isFullscreen
              ? 'w-full h-full rounded-none'
              : isTheater
              ? 'w-full max-w-6xl aspect-video rounded-3xl'
              : 'w-full max-w-5xl aspect-video rounded-3xl'
          )}
        >
          {/* HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            className="w-full h-full object-contain"
            onLoadedMetadata={() => {
              applyInitialSeek()
              updateBufferedRanges()
            }}
            onCanPlay={applyInitialSeek}
            onTimeUpdate={() => {
              if (videoRef.current && !isDraggingProgress) {
                if (targetSeekTime > 0 && !initialSeekDoneRef.current) {
                  if (videoRef.current.currentTime < 1) {
                    applyInitialSeek()
                    return
                  }
                  initialSeekDoneRef.current = true
                }
                onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || duration)
                updateBufferedRanges()
              }
            }}
            onProgress={updateBufferedRanges}
            onWaiting={() => onBuffering(true)}
            onPlaying={() => onBuffering(false)}
            onError={() => {
              if (playbackMethod === 'direct-play') {
                fallbackToHls()
              } else {
                onError('Video playback error encountered')
              }
            }}
          >
            {activeSubtitle?.url && (
              <track
                kind="subtitles"
                src={activeSubtitle.url}
                label={activeSubtitle.label || 'Subtitles'}
                srcLang={activeSubtitle.language && activeSubtitle.language !== 'und' ? activeSubtitle.language : 'en'}
                default
              />
            )}
          </video>

          {/* Interactive Click Surface for Gestures */}
          <div
            className="absolute inset-0 z-10"
            onClick={handleCanvasClick}
          />

          {/* Buffering Indicator */}
          {isBuffering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none z-20">
              <div className="p-4 rounded-2xl bg-black/70 border border-white/10 shadow-2xl flex flex-col items-center gap-3">
                <Loader2 className="h-9 w-9 text-brand-primary animate-spin" />
                <span className="text-xs font-semibold tracking-wide text-white/90 uppercase">Buffering</span>
              </div>
            </div>
          )}

          {/* Splash Action Micro-animation */}
          <AnimatePresence>
            {splashAction && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.35 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
              >
                <div className="h-20 w-20 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-[0_16px_40px_rgba(0,0,0,0.8)]">
                  {splashAction === 'play' && <Play className="h-9 w-9 fill-current ml-1" />}
                  {splashAction === 'pause' && <Pause className="h-9 w-9 fill-current" />}
                  {splashAction === 'skip-back' && (
                    <div className="flex flex-col items-center">
                      <RotateCcw className="h-7 w-7" />
                      <span className="text-[10px] font-bold mt-0.5">-10s</span>
                    </div>
                  )}
                  {splashAction === 'skip-fwd' && (
                    <div className="flex flex-col items-center">
                      <RotateCw className="h-7 w-7" />
                      <span className="text-[10px] font-bold mt-0.5">+10s</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fatal Error Overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-8 text-center z-50">
              <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4 shadow-xl">
                <AlertTriangle className="h-10 w-10" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Playback Stalled</h3>
              <p className="text-sm text-white/65 max-w-md mb-6 leading-relaxed">{error}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={fallbackToHls}
                  className="px-5 py-2.5 rounded-full bg-brand-primary text-white font-semibold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg"
                >
                  Retry with Transcode
                </button>
                <button
                  type="button"
                  onClick={closeStream}
                  className="px-5 py-2.5 rounded-full bg-white/10 text-white font-medium text-xs hover:bg-white/20 active:scale-95 transition-all"
                >
                  Close Player
                </button>
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts Sheet Overlay */}
          <AnimatePresence>
            {showShortcutsModal && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 z-50"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowShortcutsModal(false)
                }}
              >
                <div
                  className="w-full max-w-md rounded-3xl bg-[var(--dk-surface-glass)] border border-white/15 p-6 shadow-2xl space-y-4 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Keyboard className="w-4 h-4 text-brand-primary" />
                      <span>Keyboard Shortcuts</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowShortcutsModal(false)}
                      className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Play / Pause</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Space / K</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Seek 10s</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">← / →</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Volume</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">↑ / ↓</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Mute</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">M</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Fullscreen</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">F</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Theater</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">T</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Picture in Pic</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">P</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                      <span className="text-white/70">Subtitles</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">C</kbd>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Overlay Controls */}
          <div
            className={cn(
              'absolute inset-0 z-30 flex flex-col justify-between p-5 pointer-events-none transition-opacity duration-300 bg-gradient-to-t from-black/85 via-transparent to-black/70',
              controlsVisible ? 'opacity-100' : 'opacity-0'
            )}
          >
            {/* Top Bar: Floating Glass Header */}
            <div className="flex items-center justify-between gap-4 pointer-events-auto">
              <div className="flex items-center gap-3 min-w-0 max-w-[80%]">
                <div className="h-9 w-9 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 shadow-lg text-brand-primary">
                  <Clapperboard className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-bold truncate text-white drop-shadow-sm">{session.title}</span>

                    {/* Server & Live status badge */}
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {session.source}
                    </span>

                    {/* Stream method chip */}
                    <span
                      className={cn(
                        'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border',
                        playbackMethod === 'direct-play'
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : playbackMethod === 'direct-stream'
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      )}
                    >
                      {playbackMethod === 'direct-play'
                        ? 'Direct Play'
                        : playbackMethod === 'direct-stream'
                        ? 'Remux'
                        : 'Transcode'}
                    </span>

                    {/* Codec info */}
                    {session.videoCodec && (
                      <span className="text-[10px] uppercase font-semibold text-white/50 px-1.5 py-0.5 rounded bg-white/5">
                        {session.videoCodec}
                      </span>
                    )}
                  </div>

                  {session.subtitle && (
                    <div className="text-xs text-white/60 truncate mt-0.5">{session.subtitle}</div>
                  )}

                  {isShow && session.episodeContext && (
                    <div className="text-xs text-brand-primary font-semibold truncate flex items-center gap-1.5 mt-0.5">
                      <Tv className="h-3 w-3" />
                      <span>
                        S{String(session.episodeContext.seasonNumber).padStart(2, '0')}:E
                        {String(session.episodeContext.episodeNumber).padStart(2, '0')} ·{' '}
                        {session.episodeContext.episodeTitle}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Right Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center transition-all border border-white/10 shadow-sm"
                  title="Keyboard shortcuts (?)"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={closeStream}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all border border-white/10 shadow-sm"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Bottom Controls Capsule */}
            <div className="space-y-3 pointer-events-auto">
              {/* Scrubber / Progress Bar with Buffered Range & Hover Tooltip */}
              <div
                ref={progressBarRef}
                onMouseDown={handleScrubberMouseDown}
                onMouseMove={handleScrubberMouseMove}
                onMouseLeave={handleScrubberMouseLeave}
                className="group/scrub relative h-4 flex items-center cursor-pointer select-none"
              >
                {/* Hover Time Tooltip */}
                {hoverScrubTime !== null && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-black/90 backdrop-blur-md border border-white/20 text-white font-mono text-[10px] font-bold shadow-xl pointer-events-none z-30"
                    style={{ left: `${hoverScrubPercent}%` }}
                  >
                    {formatSeconds(hoverScrubTime)}
                  </div>
                )}

                {/* Track Background */}
                <div className="w-full h-1.5 group-hover/scrub:h-2.5 rounded-full bg-white/20 overflow-hidden transition-all relative">
                  {/* Buffered Progress */}
                  <div
                    className="h-full bg-white/25 absolute left-0 top-0 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, bufferedPercent))}%` }}
                  />
                  {/* Played Progress */}
                  <div
                    className="h-full bg-gradient-to-r from-brand-primary to-amber-400 absolute left-0 top-0 transition-all shadow-[0_0_12px_rgba(249,115,22,0.6)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Scrubber Knob */}
                <div
                  className="absolute h-3.5 w-3.5 rounded-full bg-white shadow-lg border-2 border-brand-primary -translate-x-1/2 opacity-0 group-hover/scrub:opacity-100 transition-opacity scale-90 group-hover/scrub:scale-100"
                  style={{ left: `${progressPercent}%` }}
                />
              </div>

              {/* Floating Bottom Control Dock */}
              <div className="rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/12 px-4 py-2 shadow-2xl flex items-center justify-between gap-3 text-white">
                {/* Left Cluster: Play/Pause, Skips, Volume, Time */}
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="h-9 w-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0"
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  </button>

                  {/* Skip -10s */}
                  <button
                    type="button"
                    onClick={handleSkipBack}
                    className="h-8 w-8 rounded-full text-white/75 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-all relative"
                    title="Skip back 10s (←)"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="absolute text-[8px] font-bold bottom-1.5">10</span>
                  </button>

                  {/* Skip +10s */}
                  <button
                    type="button"
                    onClick={handleSkipForward}
                    className="h-8 w-8 rounded-full text-white/75 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-all relative"
                    title="Skip forward 10s (→)"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span className="absolute text-[8px] font-bold bottom-1.5">10</span>
                  </button>

                  {/* Volume Slider with percentage */}
                  <div
                    className="relative flex items-center gap-2 group/vol"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="h-8 w-8 rounded-full text-white/75 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-all"
                      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="h-4 w-4 text-amber-400" />
                      ) : volume < 0.5 ? (
                        <Volume1 className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                    {showVolumeSlider && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-150">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => setVolume(parseFloat(e.target.value))}
                          className="w-18 h-1 rounded-full accent-brand-primary cursor-pointer bg-white/20"
                        />
                        <span className="text-[10px] font-mono text-white/60 w-7">
                          {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Time Elapsed / Total (click to toggle remaining) */}
                  <button
                    type="button"
                    onClick={() => setShowRemainingTime((v) => !v)}
                    className="font-mono text-white/80 hover:text-white text-xs select-none px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                    title="Toggle remaining time"
                  >
                    <span>{formatSeconds(progressTime)}</span>
                    <span className="mx-1 text-white/30">/</span>
                    <span>
                      {showRemainingTime && duration > progressTime
                        ? `-${formatSeconds(duration - progressTime)}`
                        : formatSeconds(duration)}
                    </span>
                  </button>
                </div>

                {/* Right Cluster: Speed, Audio, Subtitles, PiP, Theater, Fullscreen */}
                <div className="flex items-center gap-1.5 relative">
                  {/* Playback Speed Popover */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowSpeedMenu((v) => !v)
                        setShowAudioMenu(false)
                        setShowSubtitleMenu(false)
                      }}
                      className={cn(
                        'h-8 px-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1',
                        playbackSpeed !== 1
                          ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40'
                          : 'text-white/70 border-transparent hover:bg-white/10 hover:text-white'
                      )}
                      title="Playback Speed"
                    >
                      <Gauge className="h-3.5 w-3.5" />
                      <span>{playbackSpeed}x</span>
                    </button>

                    {showSpeedMenu && (
                      <div
                        className="absolute bottom-full right-0 mb-2.5 w-36 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-white/40">Speed</div>
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => {
                              setPlaybackSpeed(spd)
                              setShowSpeedMenu(false)
                            }}
                            className={cn(
                              'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between',
                              playbackSpeed === spd
                                ? 'bg-brand-primary/20 text-brand-primary font-bold'
                                : 'text-white/80 hover:bg-white/10'
                            )}
                          >
                            <span>{spd}x</span>
                            {playbackSpeed === spd && <Check className="h-3.5 w-3.5" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Audio Track Selector */}
                  {session.audioTracks.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAudioMenu((v) => !v)
                          setShowSubtitleMenu(false)
                          setShowSpeedMenu(false)
                        }}
                        className={cn(
                          'h-8 px-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5',
                          activeAudio
                            ? 'bg-white/15 text-white border-white/20'
                            : 'text-white/70 border-transparent hover:bg-white/10 hover:text-white'
                        )}
                        title="Audio Track"
                      >
                        <AudioLines className="h-4 w-4" />
                        {activeAudio && (
                          <span className="text-[10px] uppercase font-bold tracking-wide">
                            {activeAudio.language !== 'und' ? activeAudio.language : 'Audio'}
                          </span>
                        )}
                      </button>

                      {showAudioMenu && (
                        <div
                          className="absolute bottom-full right-0 mb-2.5 w-52 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left animate-in fade-in zoom-in-95 duration-150"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40">Select Audio</div>
                          {session.audioTracks.map((audio) => (
                            <button
                              key={audio.id || audio.index}
                              type="button"
                              onClick={() => {
                                setActiveAudio(audio.index)
                                setShowAudioMenu(false)
                              }}
                              className={cn(
                                'w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex items-center justify-between',
                                activeAudio?.index === audio.index
                                  ? 'bg-brand-primary/20 text-brand-primary font-bold'
                                  : 'text-white/80 hover:bg-white/10'
                              )}
                            >
                              <div className="truncate min-w-0 pr-2">
                                <div className="truncate font-medium">{audio.label || audio.language || 'Audio Track'}</div>
                                <div className="text-[10px] text-white/50">
                                  {audio.codec ? audio.codec.toUpperCase() : ''}{' '}
                                  {audio.channels === 6 ? '5.1 Surround' : audio.channels === 2 ? 'Stereo' : ''}
                                </div>
                              </div>
                              {activeAudio?.index === audio.index && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subtitle Track Selector */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowSubtitleMenu((v) => !v)
                        setShowAudioMenu(false)
                        setShowSpeedMenu(false)
                      }}
                      className={cn(
                        'h-8 px-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5',
                        activeSubtitle
                          ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40'
                          : 'text-white/70 border-transparent hover:bg-white/10 hover:text-white'
                      )}
                      title="Subtitles (C)"
                    >
                      <Subtitles className="h-4 w-4" />
                      {activeSubtitle && (
                        <span className="text-[10px] uppercase font-bold tracking-wide">
                          {activeSubtitle.language !== 'und' ? activeSubtitle.language : 'CC'}
                        </span>
                      )}
                    </button>

                    {showSubtitleMenu && (
                      <div
                        className="absolute bottom-full right-0 mb-2.5 w-52 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-white/40">Subtitles</div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubtitle(null)
                            setShowSubtitleMenu(false)
                          }}
                          className={cn(
                            'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between',
                            !activeSubtitle ? 'bg-brand-primary/20 text-brand-primary font-bold' : 'text-white/80 hover:bg-white/10'
                          )}
                        >
                          <span>Off</span>
                          {!activeSubtitle && <Check className="h-3.5 w-3.5" />}
                        </button>
                        {session.subtitles.map((sub) => (
                          <button
                            key={sub.id || sub.index}
                            type="button"
                            onClick={() => {
                              setActiveSubtitle(sub.id || String(sub.index))
                              setShowSubtitleMenu(false)
                            }}
                            className={cn(
                              'w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex items-center justify-between',
                              activeSubtitle?.id === sub.id || String(activeSubtitle?.index) === String(sub.index)
                                ? 'bg-brand-primary/20 text-brand-primary font-bold'
                                : 'text-white/80 hover:bg-white/10'
                            )}
                          >
                            <div className="truncate min-w-0 pr-2">
                              <div className="truncate font-medium">{sub.label || sub.language || 'Subtitles'}</div>
                              {sub.format && (
                                <div className="text-[10px] text-white/50 uppercase">{sub.format}</div>
                              )}
                            </div>
                            {(activeSubtitle?.id === sub.id ||
                              String(activeSubtitle?.index) === String(sub.index)) && (
                              <Check className="h-3.5 w-3.5 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Picture in Picture */}
                  <button
                    type="button"
                    onClick={togglePiP}
                    className="h-8 w-8 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-all"
                    title="Picture-in-Picture (P)"
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>

                  {/* Theater Mode */}
                  {!isFullscreen && (
                    <button
                      type="button"
                      onClick={() => setTheater(!isTheater)}
                      className={cn(
                        'h-8 w-8 rounded-xl flex items-center justify-center transition-all active:scale-95',
                        isTheater
                          ? 'bg-brand-primary/20 text-brand-primary'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      )}
                      title="Theater mode (T)"
                    >
                      <Tv className="h-4 w-4" />
                    </button>
                  )}

                  {/* Fullscreen */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="h-8 w-8 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-all"
                    title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  )
};
