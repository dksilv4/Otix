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
} from 'lucide-react'
import { useMediaStreamPlayer } from '../../hooks/use-media-stream-player'
import { cn, formatTime } from '@/lib/utils'

function safePlay(el: HTMLVideoElement | null) {
  if (!el) return
  try {
    const res = el.play()
    if (res && typeof res.catch === 'function') {
      res.catch(() => {})
    }
  } catch {
    // Ignore error
  }
}

function safePause(el: HTMLVideoElement | null) {
  if (!el) return
  try {
    el.pause()
  } catch {
    // Ignore error
  }
}

export function MediaStreamPlayerModal() {
  const {
    session,
    isOpen,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
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
    toggleMute,
    setTheater,
    setActiveSubtitle,
    setActiveAudio,
    onTimeUpdate,
    onBuffering,
    onError,
    fallbackToHls,
  } = useMediaStreamPlayer()

  const [controlsVisible, setControlsVisible] = useState(true)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [dragTime, setDragTime] = useState(0)
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        if (!showVolumeSlider && !showSubtitleMenu && !showAudioMenu && !isDraggingProgress) {
          setControlsVisible(false)
        }
      }, 2500)
    }
  }, [isPlaying, showVolumeSlider, showSubtitleMenu, showAudioMenu, isDraggingProgress])

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
      video.currentTime = currentTime
      if (isPlaying) {
        safePlay(video)
      }
    } else {
      // HLS Transcode / Remux
      if (Hls.isSupported()) {
        const hls = new Hls({
          startPosition: currentTime > 0 ? currentTime : -1,
          enableWorker: true,
          lowLatencyMode: true,
        })
        hlsRef.current = hls
        hls.loadSource(session.hlsUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
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
                onError(`HLS fatal playback error: ${data.details}`)
                hls.destroy()
                break
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        video.src = session.hlsUrl
        video.currentTime = currentTime
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

  // Splash trigger
  const triggerSplash = (action: 'play' | 'pause') => {
    setSplashAction(action)
    if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current)
    splashTimeoutRef.current = setTimeout(() => setSplashAction(null), 600)
  }

  const handleTogglePlay = useCallback(() => {
    triggerSplash(isPlaying ? 'pause' : 'play')
    togglePlay()
    showControls()
  }, [isPlaying, togglePlay, showControls])

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const newTime = Math.max(0, currentTime - 10)
        seek(newTime)
        if (videoRef.current) videoRef.current.currentTime = newTime
        showControls()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const newTime = Math.min(duration, currentTime + 10)
        seek(newTime)
        if (videoRef.current) videoRef.current.currentTime = newTime
        showControls()
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
      } else if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          closeStream()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    handleTogglePlay,
    currentTime,
    duration,
    volume,
    toggleFullscreen,
    toggleMute,
    setVolume,
    seek,
    closeStream,
    showControls,
  ])

  // Scrubber dragging
  const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return
    setIsDraggingProgress(true)
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setDragTime(fraction * duration)
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

  if (!isOpen || !session || typeof document === 'undefined') return null

  const progressTime = isDraggingProgress ? dragTime : currentTime
  const progressPercent = duration > 0 ? (progressTime / duration) * 100 : 0
  const isShow = !!session.episodeContext

  return createPortal(
    <AnimatePresence>
      <div
        ref={containerRef}
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md overflow-hidden select-none"
        onMouseMove={showControls}
        onClick={() => {
          setShowSubtitleMenu(false)
          setShowAudioMenu(false)
        }}
      >
        {/* Video Surface Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'relative overflow-hidden flex items-center justify-center bg-black transition-all duration-300 shadow-2xl',
            isFullscreen
              ? 'w-full h-full'
              : isTheater
              ? 'w-full max-w-6xl aspect-video rounded-2xl border border-white/10'
              : 'w-full max-w-4xl aspect-video rounded-2xl border border-white/10'
          )}
        >
          {/* HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            className="w-full h-full object-contain"
            onTimeUpdate={() => {
              if (videoRef.current && !isDraggingProgress) {
                onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || duration)
              }
            }}
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
                label={activeSubtitle.label}
                srcLang={activeSubtitle.language}
                default
              />
            )}
          </video>

          {/* Buffering Indicator */}
          {isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
          )}

          {/* Splash Action Animation */}
          <AnimatePresence>
            {splashAction && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.4 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="h-20 w-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl">
                  {splashAction === 'play' ? (
                    <Play className="h-10 w-10 fill-current ml-1" />
                  ) : (
                    <Pause className="h-10 w-10 fill-current" />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fatal Error Overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center z-50">
              <AlertTriangle className="h-12 w-12 text-amber-400 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Playback Error</h3>
              <p className="text-sm text-white/60 max-w-md mb-4">{error}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fallbackToHls}
                  className="px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary/90 transition-colors"
                >
                  Retry with Transcode
                </button>
                <button
                  type="button"
                  onClick={closeStream}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white font-medium text-xs hover:bg-white/20 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Overlay Controls */}
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-t from-black/80 via-transparent to-black/60 transition-opacity duration-300',
              controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none cursor-none'
            )}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleTogglePlay()
              }
            }}
          >
            {/* Top Bar: Title & Server Badge & Close Button */}
            <div className="flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Clapperboard className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate text-white">{session.title}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {session.source}
                    </span>
                    {playbackMethod !== 'direct-play' && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                        {playbackMethod === 'direct-stream' ? 'Remux' : 'Transcode'}
                      </span>
                    )}
                  </div>
                  {session.subtitle && (
                    <div className="text-xs text-white/50 truncate">{session.subtitle}</div>
                  )}
                  {isShow && session.episodeContext && (
                    <div className="text-xs text-primary/80 font-medium truncate flex items-center gap-1">
                      <Tv className="h-3 w-3" />
                      <span>
                        S{String(session.episodeContext.seasonNumber).padStart(2, '0')}E
                        {String(session.episodeContext.episodeNumber).padStart(2, '0')}: {session.episodeContext.episodeTitle}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={closeStream}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Bottom Controls Bar */}
            <div className="space-y-2 text-white">
              {/* Scrubber Progress Bar */}
              <div
                ref={progressBarRef}
                onMouseDown={handleScrubberMouseDown}
                className="group/scrub relative h-3 flex items-center cursor-pointer"
              >
                <div className="w-full h-1 group-hover/scrub:h-2 rounded-full bg-white/20 overflow-hidden transition-all">
                  <div
                    className="h-full bg-primary relative transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div
                  className="absolute h-3 w-3 rounded-full bg-white shadow-md -translate-x-1/2 opacity-0 group-hover/scrub:opacity-100 transition-opacity"
                  style={{ left: `${progressPercent}%` }}
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between gap-3 text-xs">
                {/* Left: Play/Pause, Skips, Time */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const newTime = Math.max(0, currentTime - 10)
                      seek(newTime)
                      if (videoRef.current) videoRef.current.currentTime = newTime
                    }}
                    className="p-1 text-white/70 hover:text-white transition-colors"
                    title="Skip back 10s (Left Arrow)"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const newTime = Math.min(duration, currentTime + 10)
                      seek(newTime)
                      if (videoRef.current) videoRef.current.currentTime = newTime
                    }}
                    className="p-1 text-white/70 hover:text-white transition-colors"
                    title="Skip forward 10s (Right Arrow)"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>

                  {/* Volume Slider */}
                  <div
                    className="relative flex items-center gap-1.5"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-1 text-white/70 hover:text-white transition-colors"
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
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-16 h-1 rounded-full accent-primary cursor-pointer"
                      />
                    )}
                  </div>

                  {/* Time Elapsed / Total */}
                  <div className="font-mono text-white/70 text-[11px]">
                    <span>{formatTime(progressTime)}</span>
                    <span className="mx-1 text-white/30">/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Right: Audio Tracks, Subtitles, Theater Mode, Fullscreen */}
                <div className="flex items-center gap-2 relative">
                  {/* Audio Track Selector */}
                  {session.audioTracks.length > 1 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAudioMenu((v) => !v)
                          setShowSubtitleMenu(false)
                        }}
                        className={cn(
                          'p-1.5 rounded-lg border transition-all flex items-center gap-1',
                          activeAudio
                            ? 'bg-white/10 text-white border-white/20'
                            : 'text-white/60 border-transparent hover:text-white'
                        )}
                        title="Audio Track"
                      >
                        <AudioLines className="h-4 w-4" />
                        {activeAudio && (
                          <span className="text-[10px] uppercase font-bold">{activeAudio.language || 'Audio'}</span>
                        )}
                      </button>

                      {showAudioMenu && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-white/15 bg-black/90 backdrop-blur-xl p-1 shadow-2xl z-50 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-2 py-1 text-[10px] uppercase font-bold text-white/40">Select Audio</div>
                          {session.audioTracks.map((audio) => (
                            <button
                              key={audio.id || audio.index}
                              type="button"
                              onClick={() => {
                                setActiveAudio(audio.index)
                                setShowAudioMenu(false)
                              }}
                              className={cn(
                                'w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                                activeAudio?.index === audio.index
                                  ? 'bg-primary/20 text-primary font-medium'
                                  : 'text-white/80 hover:bg-white/10'
                              )}
                            >
                              <span className="truncate">{audio.label || `${audio.language} (${audio.codec})`}</span>
                              {activeAudio?.index === audio.index && <span>✓</span>}
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
                      }}
                      className={cn(
                        'p-1.5 rounded-lg border transition-all flex items-center gap-1',
                        activeSubtitle
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'text-white/60 border-transparent hover:text-white'
                      )}
                      title="Subtitles"
                    >
                      <Subtitles className="h-4 w-4" />
                    </button>

                    {showSubtitleMenu && (
                      <div
                        className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-white/15 bg-black/90 backdrop-blur-xl p-1 shadow-2xl z-50 text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-white/40">Subtitles</div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubtitle(null)
                            setShowSubtitleMenu(false)
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                            !activeSubtitle ? 'bg-primary/20 text-primary font-medium' : 'text-white/80 hover:bg-white/10'
                          )}
                        >
                          <span>Off</span>
                          {!activeSubtitle && <span>✓</span>}
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
                              'w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                              activeSubtitle?.id === sub.id || String(activeSubtitle?.index) === String(sub.index)
                                ? 'bg-primary/20 text-primary font-medium'
                                : 'text-white/80 hover:bg-white/10'
                            )}
                          >
                            <span className="truncate">{sub.label || sub.language}</span>
                            {(activeSubtitle?.id === sub.id ||
                              String(activeSubtitle?.index) === String(sub.index)) && (
                              <span>✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Theater Mode */}
                  {!isFullscreen && (
                    <button
                      type="button"
                      onClick={() => setTheater(!isTheater)}
                      className={cn(
                        'p-1.5 rounded-lg text-white/70 hover:text-white transition-colors',
                        isTheater && 'text-primary'
                      )}
                      title="Theater mode"
                    >
                      <Tv className="h-4 w-4" />
                    </button>
                  )}

                  {/* Fullscreen */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg text-white/70 hover:text-white transition-colors"
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
}
