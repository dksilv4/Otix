import { useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clapperboard,
  X,
  Volume2,
  Volume1,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Play,
  Pause,
} from 'lucide-react'

interface TrailerVideoModalProps {
  youtubeId: string
  title: string
  isExiting?: boolean
  onClose: () => void
}

const SETTINGS_KEY = 'otix:video-player-settings'

export interface VideoPlayerSettings {
  volume: number
  isMuted: boolean
  isZoomedOut: boolean
  isTheater: boolean
}

export function loadPlayerSettings(): VideoPlayerSettings {
  const defaults: VideoPlayerSettings = {
    volume: 1,
    isMuted: false,
    isZoomedOut: false,
    isTheater: false,
  }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : defaults.volume,
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : defaults.isMuted,
      isZoomedOut: typeof parsed.isZoomedOut === 'boolean' ? parsed.isZoomedOut : defaults.isZoomedOut,
      isTheater: typeof parsed.isTheater === 'boolean' ? parsed.isTheater : defaults.isTheater,
    }
  } catch {
    return defaults
  }
}

export function savePlayerSettings(partial: Partial<VideoPlayerSettings>) {
  if (typeof window === 'undefined') return
  try {
    const current = loadPlayerSettings()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // Ignore storage quota errors
  }
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export function TrailerVideoModal({ youtubeId, title, isExiting, onClose }: TrailerVideoModalProps) {
  const [initialSettings] = useState(loadPlayerSettings)

  const [isZoomedOut, setIsZoomedOutState] = useState(initialSettings.isZoomedOut)
  const [isTheater, setIsTheaterState] = useState(initialSettings.isTheater)
  const [isMuted, setIsMutedState] = useState(initialSettings.isMuted)
  const [volume, setVolumeState] = useState(initialSettings.volume)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

  // Playback & progress tracking
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedFraction, setBufferedFraction] = useState(0)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | null>(null)

  // Auto-hide controls & external space detection
  const [controlsVisible, setControlsVisible] = useState(true)
  const [hasExternalSpace, setHasExternalSpace] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const volumeContainerRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const dragTimeRef = useRef<number>(0)
  const lastUserActionRef = useRef<number>(0)
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if there is enough space outside the modal
  const checkExternalSpace = useCallback(() => {
    if (typeof window === 'undefined') return
    const vh = window.innerHeight
    const vw = window.innerWidth
    const maxWidth = isTheater ? 1152 : 896
    const modalWidth = Math.min(vw - 32, maxWidth)
    const videoHeight = (modalWidth * 9) / 16
    // Need ~130px total vertical space around the video (top title ~40px + bottom controls ~60px + margins ~30px)
    const neededTotalHeight = videoHeight + 130
    setHasExternalSpace(vh >= neededTotalHeight)
  }, [isTheater])

  useEffect(() => {
    checkExternalSpace()
    window.addEventListener('resize', checkExternalSpace)
    return () => window.removeEventListener('resize', checkExternalSpace)
  }, [checkExternalSpace])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        if (!showVolumeSlider && !isDraggingProgress) {
          setControlsVisible(false)
        }
      }, 2500)
    }
  }, [isDraggingProgress, isPlaying, showVolumeSlider])

  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  const handleMouseLeave = useCallback(() => {
    if (isPlaying && !showVolumeSlider && !isDraggingProgress) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, 600)
    }
  }, [isDraggingProgress, isPlaying, showVolumeSlider])

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      showControls()
    }
  }, [isPlaying, showControls])

  const postToPlayer = useCallback((command: string, args: unknown[] = []) => {
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

  const sendListening = useCallback(() => {
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

  const triggerSplash = useCallback((action: 'play' | 'pause') => {
    setSplashAction(action)
    if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
    splashTimeoutRef.current = setTimeout(() => {
      setSplashAction(null)
    }, 450)
  }, [])

  const setIsZoomedOut = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setIsZoomedOutState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isZoomedOut: next })
      return next
    })
  }, [])

  const setIsTheater = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setIsTheaterState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      savePlayerSettings({ isTheater: next })
      return next
    })
  }, [])

  const toggleMute = useCallback(() => {
    showControls()
    setIsMutedState((prev) => {
      const next = !prev
      savePlayerSettings({ isMuted: next })
      if (next) {
        postToPlayer('mute')
      } else {
        postToPlayer('unMute')
        if (volume === 0) {
          setVolumeState(0.5)
          savePlayerSettings({ volume: 0.5, isMuted: false })
          postToPlayer('setVolume', [50])
        }
      }
      return next
    })
  }, [postToPlayer, showControls, volume])

  const handleVolumeChange = useCallback(
    (newVol: number) => {
      showControls()
      const clamped = Math.max(0, Math.min(1, newVol))
      setVolumeState(clamped)
      const nextMuted = clamped === 0
      setIsMutedState(nextMuted)
      savePlayerSettings({ volume: clamped, isMuted: nextMuted })

      if (clamped === 0) {
        postToPlayer('mute')
      } else {
        if (isMuted) {
          postToPlayer('unMute')
        }
        postToPlayer('setVolume', [Math.round(clamped * 100)])
      }
    },
    [isMuted, postToPlayer, showControls],
  )

  const togglePlay = useCallback(() => {
    showControls()
    lastUserActionRef.current = Date.now()
    setIsPlaying((prev) => {
      const next = !prev
      postToPlayer(next ? 'playVideo' : 'pauseVideo')
      triggerSplash(next ? 'play' : 'pause')
      return next
    })
  }, [postToPlayer, showControls, triggerSplash])

  const toggleZoom = useCallback(() => {
    showControls()
    setIsZoomedOut((prev) => !prev)
  }, [setIsZoomedOut, showControls])

  const toggleTheater = useCallback(() => {
    showControls()
    setIsTheater((prev) => !prev)
  }, [setIsTheater, showControls])

  const seekRelative = useCallback(
    (delta: number) => {
      showControls()
      if (duration <= 0) return
      const newTime = Math.min(duration, Math.max(0, currentTime + delta))
      setCurrentTime(newTime)
      postToPlayer('seekTo', [newTime, true])
    },
    [currentTime, duration, postToPlayer, showControls],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      showControls()
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute()
      } else if (e.key === 'z' || e.key === 'Z') {
        toggleZoom()
      } else if (e.key === 't' || e.key === 'T') {
        toggleTheater()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekRelative(-5)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekRelative(5)
      }
    },
    [onClose, seekRelative, showControls, toggleMute, togglePlay, toggleTheater, toggleZoom],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [handleKeyDown])

  // Handle YouTube iframe messages
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      let data: any
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }

      if (!data) return

      if (data.event === 'onReady' || data.event === 'initialDelivery') {
        sendListening()
        if (isMuted) {
          postToPlayer('mute')
        } else {
          postToPlayer('unMute')
          postToPlayer('setVolume', [Math.round(volume * 100)])
        }
      }

      if (data.event === 'infoDelivery' && data.info) {
        if (typeof data.info.currentTime === 'number' && !isDraggingProgress) {
          setCurrentTime(data.info.currentTime)
        }
        if (typeof data.info.duration === 'number' && data.info.duration > 0) {
          setDuration(data.info.duration)
        }
        // Only accept playerState from YouTube if user hasn't recently clicked play/pause (800ms buffer)
        if (typeof data.info.playerState === 'number' && Date.now() - lastUserActionRef.current > 800) {
          // 1: playing, 2: paused, 0: ended
          setIsPlaying(data.info.playerState === 1)
        }
        if (typeof data.info.videoLoadedFraction === 'number') {
          setBufferedFraction(data.info.videoLoadedFraction)
        }
        if (typeof data.info.muted === 'boolean') {
          setIsMutedState(data.info.muted)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isDraggingProgress, isMuted, postToPlayer, sendListening, volume])

  const handleIframeLoad = useCallback(() => {
    sendListening()
    if (isMuted) {
      postToPlayer('mute')
    } else {
      postToPlayer('unMute')
      postToPlayer('setVolume', [Math.round(volume * 100)])
    }
  }, [isMuted, postToPlayer, sendListening, volume])

  // Close volume popover when clicking outside
  useEffect(() => {
    if (!showVolumeSlider) return
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showVolumeSlider])

  // Progress scrubbing
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return
    showControls()
    setIsDraggingProgress(true)
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const target = fraction * duration
    dragTimeRef.current = target
    setCurrentTime(target)
    postToPlayer('seekTo', [target, true])

    const handleMouseMoveWindow = (moveEvent: MouseEvent) => {
      if (!progressBarRef.current) return
      const moveRect = progressBarRef.current.getBoundingClientRect()
      const moveFraction = Math.min(1, Math.max(0, (moveEvent.clientX - moveRect.left) / moveRect.width))
      const moveTarget = moveFraction * duration
      dragTimeRef.current = moveTarget
      setCurrentTime(moveTarget)
    }

    const handleMouseUpWindow = () => {
      setIsDraggingProgress(false)
      postToPlayer('seekTo', [dragTimeRef.current, true])
      window.removeEventListener('mousemove', handleMouseMoveWindow)
      window.removeEventListener('mouseup', handleMouseUpWindow)
    }

    window.addEventListener('mousemove', handleMouseMoveWindow)
    window.addEventListener('mouseup', handleMouseUpWindow)
  }

  const visible = !isExiting
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iframeSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&disablekb=1&playsinline=1&iv_load_policy=3${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPercent = Math.min(100, Math.max(0, bufferedFraction * 100))

  // Render Title pill
  const renderTitle = () => (
    <div className="flex h-9 items-center gap-2 pl-2 pr-3.5 rounded-full bg-black/60 backdrop-blur-xl shadow-lg border-0 min-w-0">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-red-400">
        <Clapperboard className="h-3 w-3" />
      </span>
      <span className="truncate text-xs sm:text-sm font-medium text-white/90 max-w-[200px] sm:max-w-md">
        {title ? `${title} — Trailer` : 'Trailer'}
      </span>
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
      aria-valuemax={duration || 100}
      aria-valuenow={currentTime}
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
          className="h-full rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-75 border-0"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {(progressPercent > 0 || isDraggingProgress) && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)] transition-opacity duration-150 border-0 ${
            isDraggingProgress ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${progressPercent}%` }}
        />
      )}
    </div>
  )

  // Render Controls row (Play, Volume, Time, Zoom, Theater, Close)
  const renderControlsRow = () => (
    <div className="flex items-center justify-between gap-2 pointer-events-auto">
      {/* Left controls: Play/Pause, Volume, and Timestamps */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/60 hover:bg-white/15 text-white/90 hover:text-white backdrop-blur-xl shadow-lg transition-all border-0"
          aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        <div
          ref={volumeContainerRef}
          className="relative flex items-center shrink-0"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white/15 backdrop-blur-xl text-white/80 hover:text-white shadow-lg transition-all border-0"
            aria-label={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            <VolumeIcon className="h-4 w-4" />
          </button>

          <AnimatePresence>
            {showVolumeSlider && (
              <motion.div
                initial={{ opacity: 0, width: 0, scale: 0.95 }}
                animate={{ opacity: 1, width: 'auto', scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden flex items-center ml-1.5"
              >
                <div className="flex items-center h-9 px-3 rounded-full bg-black/60 backdrop-blur-xl shadow-lg border-0">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-16 sm:w-20 h-1.5 appearance-none rounded-full bg-white/20 accent-red-500 cursor-pointer focus:outline-none"
                    aria-label="Volume slider"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center text-xs font-mono tabular-nums text-white/80 bg-black/60 backdrop-blur-xl px-2.5 h-9 rounded-full shadow-lg border-0 shrink-0">
          <span>{formatTime(currentTime)}</span>
          <span className="text-white/30 mx-1.5">/</span>
          <span className="text-white/50">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right controls: Zoom, Theater, and Close */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleZoom}
          className={`flex h-9 items-center gap-1.5 px-2.5 sm:px-3 rounded-full backdrop-blur-xl shadow-lg transition-all text-xs font-medium border-0 ${
            isZoomedOut
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-black/60 text-white/80 hover:bg-white/15 hover:text-white'
          }`}
          aria-label={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
          title={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
        >
          {isZoomedOut ? (
            <>
              <ZoomIn className="h-4 w-4" />
              <span className="hidden sm:inline">Zoom In</span>
            </>
          ) : (
            <>
              <ZoomOut className="h-4 w-4" />
              <span className="hidden sm:inline">Zoom Out</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleTheater}
          className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white/15 backdrop-blur-xl text-white/80 hover:text-white shadow-lg transition-all border-0"
          aria-label={isTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
          title={isTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
        >
          {isTheater ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white/15 backdrop-blur-xl text-white/80 hover:text-white shadow-lg transition-all border-0"
          aria-label="Close trailer"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md border-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className={`relative w-full ${
            isTheater ? 'max-w-6xl' : 'max-w-4xl'
          } flex flex-col gap-2.5 transition-all duration-300 ease-out`}
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: visible ? 1 : 0.94, opacity: visible ? 1 : 0, y: visible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* EXTERNAL MODE: Title rendered above the video when there's enough space */}
          {hasExternalSpace && (
            <div className="flex items-center justify-between w-full px-1">
              {renderTitle()}
            </div>
          )}

          {/* Video Container */}
          <div
            className={`relative aspect-video w-full rounded-3xl sm:rounded-[32px] overflow-hidden bg-black shadow-2xl select-none border-0 ${
              controlsVisible ? 'cursor-default' : 'cursor-none'
            }`}
          >
            {/* OVERLAY MODE: Top vignette & Title rendered inside when space is constrained */}
            {!hasExternalSpace && (
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
                  className={`absolute top-4 left-4 z-20 ${
                    controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  {renderTitle()}
                </motion.div>
              </>
            )}

            {/* YouTube Embed */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title={title ? `${title} trailer` : 'Trailer'}
              onLoad={handleIframeLoad}
              frameBorder="0"
              className={`w-full h-full origin-center transition-transform duration-300 ease-out pointer-events-none border-0 ${
                isZoomedOut ? 'scale-100' : 'scale-[1.35]'
              }`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />

            {/* Click-to-Play/Pause interactive overlay */}
            <div
              className="absolute inset-0 cursor-pointer z-10 flex items-center justify-center border-0"
              onClick={togglePlay}
              onDoubleClick={toggleZoom}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
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
                    className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black/65 backdrop-blur-md text-white shadow-2xl pointer-events-none border-0"
                  >
                    {splashAction === 'play' ? (
                      <Play className="h-8 w-8 sm:h-10 sm:w-10 fill-current ml-1 text-white" />
                    ) : (
                      <Pause className="h-8 w-8 sm:h-10 sm:w-10 fill-current text-white" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* OVERLAY MODE: Bottom vignette & Controls rendered inside when space is constrained */}
            {!hasExternalSpace && (
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
                  className={`absolute bottom-3 sm:bottom-4 inset-x-4 sm:inset-x-6 z-20 flex flex-col gap-2.5 ${
                    controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  {renderProgressBar()}
                  {renderControlsRow()}
                </motion.div>
              </>
            )}
          </div>

          {/* EXTERNAL MODE: Controls rendered outside below the video when there's enough space */}
          {hasExternalSpace && (
            <div className="w-full flex flex-col gap-2.5 px-1 pointer-events-auto">
              {renderProgressBar()}
              {renderControlsRow()}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
