import { useState, useRef, useCallback, useEffect, useContext } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Music,
  Disc3,
  ListMusic,
  Maximize2,
  Sparkles,
} from 'lucide-react'
import { usePlayer } from '@/lib/player/use-player'
import { usePlayerProgress } from '@/lib/player/use-player-progress'
import { UniversalPlayerContext } from '@/features/player/core/universal-player-context'
import { cn } from '@/lib/utils'
import { useMusicPalette } from '../../hooks/use-music-palette'
import { WaveformScrubber } from '../../visualizers/components/waveform-scrubber'
import { AnchoredQueuePopover } from '../../visualizers/components/anchored-queue-popover'
import { FullScreenMusicPlayer } from '../../visualizers/components/full-screen-music-player'
import { getSavedPlaybackSession } from '../../visualizers/utils/playback-persistence'
import { formatTrackDuration } from '../../utils/music-helpers'

export const GlobalMusicBar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    source,
    isPlaying,
    currentTrack,
    volume,
    repeatMode,
    isShuffled,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    toggleShuffle,
    setRepeatMode,
    removeFromQueue,
    localQueue,
    plexQueue,
    jellyfinQueue,
    skipLocalToIndex,
    skipPlexToIndex,
    skipJellyfinToIndex,
  } = usePlayer()

  const { position, duration } = usePlayerProgress()

  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false)
  const [showSmallScreenVolume, setShowSmallScreenVolume] = useState(false)
  const [resumeToastMessage, setResumeToastMessage] = useState<string | null>(null)
  const [prevVolume, setPrevVolume] = useState(0.7)
  const volumeRef = useRef<HTMLDivElement | null>(null)

  const universal = useContext(UniversalPlayerContext)
  const isVideoActive = universal?.currentItem?.mediaType === 'video'
  const isVisible = source !== 'none' && currentTrack !== null && !isVideoActive
  const theme = useMusicPalette(currentTrack?.albumArt)

  const rawQueue =
    source === 'local' ? localQueue : source === 'jellyfin' ? jellyfinQueue : plexQueue
  const activeQueue = Array.isArray(rawQueue) ? rawQueue : []

  // Detect session restoration and display subtle status pill
  useEffect(() => {
    const saved = getSavedPlaybackSession()
    if (saved && saved.track && isPlaying && saved.status === 'playing') {
      const timeStr = formatTrackDuration(saved.positionMs)
      setResumeToastMessage(`Resumed playback • ${timeStr}`)

      const timer = setTimeout(() => {
        setResumeToastMessage(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [isPlaying])

  // Global hotkey 'F' to toggle full-screen visualizer
  useEffect(() => {
    if (!isVisible && !isFullScreenOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setIsFullScreenOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isVisible, isFullScreenOpen])

  // Close small-screen volume popover when clicking outside
  useEffect(() => {
    if (!showSmallScreenVolume) return
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowSmallScreenVolume(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSmallScreenVolume])

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      setPrevVolume(volume)
      setVolume(0)
    } else {
      setVolume(prevVolume || 0.7)
    }
  }, [volume, prevVolume, setVolume])

  const cycleRepeat = useCallback(() => {
    if (repeatMode === 'off') setRepeatMode('all')
    else if (repeatMode === 'all') setRepeatMode('one')
    else setRepeatMode('off')
  }, [repeatMode, setRepeatMode])

  const handleSelectTrack = useCallback(
    (index: number) => {
      if (source === 'local') skipLocalToIndex(index)
      else if (source === 'jellyfin') skipJellyfinToIndex(index)
      else skipPlexToIndex(index)
    },
    [source, skipLocalToIndex, skipJellyfinToIndex, skipPlexToIndex],
  )

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Subtle Auto-Resume Indicator Pill */}
          {resumeToastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9995] px-3.5 py-1.5 rounded-full backdrop-blur-2xl bg-[var(--dk-surface-overlay)] text-foreground text-xs font-medium shadow-xl flex items-center gap-2 pointer-events-none select-none"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{resumeToastMessage}</span>
            </motion.div>
          )}

          {/* 3-Pod Floating Architecture: Left Identity + Center Waveform + Right Controls */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] flex items-center justify-center gap-2 sm:gap-2.5 w-[calc(100%-1.5rem)] max-w-5xl select-none">
            {/* Pod 1 (Left): Ultra-Compact Track Identity & Music Transport */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="h-13 px-2.5 sm:px-3 rounded-2xl backdrop-blur-2xl flex items-center gap-2 sm:gap-2.5 shadow-xl shrink-0 transition-[background,box-shadow] duration-500"
              style={{
                background: theme.containerBackground,
                boxShadow: theme.glowShadow,
              }}
            >
              {/* Vinyl Artwork Squircle */}
              <div
                className="relative shrink-0 flex items-center group select-none"
                title={`${currentTrack.title} • ${currentTrack.artist}`}
              >
                {currentTrack.albumArt ? (
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.title}
                    className="relative z-10 h-10 w-10 rounded-xl object-cover bg-[var(--dk-surface-raised)] shadow-sm"
                  />
                ) : (
                  <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dk-surface-raised)] text-muted-foreground shadow-sm">
                    <Disc3 className="h-5 w-5" />
                  </div>
                )}
                <div
                  className={cn(
                    'absolute -right-2 top-1 h-8 w-8 rounded-full bg-[var(--dk-surface-overlay)] flex items-center justify-center z-0 transition-transform duration-700 pointer-events-none shadow-sm',
                    isPlaying && 'animate-[spin_10s_linear_infinite]',
                  )}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: theme.hasArtwork ? theme.accentRgb : 'var(--primary)',
                    }}
                  />
                </div>
              </div>

              {/* 2-Tier / 2-Row Metadata: Legible Title & Subtitle */}
              <div
                className="flex flex-col justify-center min-w-0 max-w-[100px] sm:max-w-[140px] select-none leading-none"
                title={`${currentTrack.title} • ${currentTrack.artist}`}
              >
                <span
                  className="truncate text-xs font-semibold leading-snug transition-colors"
                  style={{ color: theme.textColor }}
                >
                  {currentTrack.title}
                </span>
                <span
                  className="truncate text-[10.5px] leading-snug transition-colors opacity-80"
                  style={{ color: theme.subtextColor }}
                >
                  {currentTrack.artist || 'Unknown Artist'}
                </span>
              </div>

              {/* Divider */}
              <div
                className="h-4 w-px shrink-0 transition-colors"
                style={{ backgroundColor: theme.dividerColor }}
              />

              {/* Transport Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void skipPrevious()}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Previous track"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full hover:scale-105 active:scale-95 transition-colors shadow-none',
                    !theme.hasArtwork && 'bg-primary text-primary-foreground',
                  )}
                  style={{
                    ...(theme.hasArtwork
                      ? {
                          backgroundColor: theme.accentRgb,
                          color: theme.accentText,
                        }
                      : {}),
                    boxShadow: 'none',
                  }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void skipNext()}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Next track"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>

            {/* Pod 2 (Center): Dominant Expansive Waveform Scrubber in its own Pill */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.22, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="relative h-13 px-3 sm:px-4 rounded-2xl backdrop-blur-2xl flex items-center shadow-xl flex-1 min-w-0 transition-[background,box-shadow] duration-500"
              style={{
                background: theme.containerBackground,
                boxShadow: theme.glowShadow,
              }}
            >
              <WaveformScrubber
                positionMs={position}
                durationMs={duration}
                isPlaying={isPlaying}
                theme={theme}
                onSeek={(ms) => void seek(ms)}
                barCount={84}
                className="flex-1 min-w-0"
              />
            </motion.div>

            {/* Pod 3 (Right): Studio & System Controls in its own Pill */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.22, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="relative h-13 px-2.5 sm:px-3 rounded-2xl backdrop-blur-2xl flex items-center gap-1.5 sm:gap-2 shadow-xl shrink-0 transition-[background,box-shadow] duration-500"
              style={{
                background: theme.containerBackground,
                boxShadow: theme.glowShadow,
              }}
            >
              {/* Volume */}
              <div
                ref={volumeRef}
                className="relative flex items-center group/volume shrink-0"
                onMouseEnter={() => setShowSmallScreenVolume(true)}
                onMouseLeave={() => setShowSmallScreenVolume(false)}
                onWheel={(e) => {
                  e.preventDefault()
                  setVolume(Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? 0.05 : -0.05))))
                }}
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Volume"
                  title={volume === 0 ? 'Unmute' : `Volume: ${Math.round(volume * 100)}%`}
                >
                  <VolumeIcon className="h-3.5 w-3.5" />
                </button>

                {/* Inline slider on desktop xl+ */}
                <div className="hidden xl:flex items-center w-14 px-1">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    aria-label="Volume slider"
                    className="w-full h-1 cursor-pointer rounded-full accent-primary bg-[var(--dk-surface-raised)]"
                    style={theme.hasArtwork ? { accentColor: theme.accentRgb } : undefined}
                  />
                </div>

                {/* Small Screen Volume Popover (< xl) */}
                <AnimatePresence>
                  {showSmallScreenVolume && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="xl:hidden absolute bottom-full right-0 mb-3 px-3 py-2.5 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-2xl flex items-center gap-2.5 border border-white/[0.06] z-50 select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Mute / Unmute"
                      >
                        <VolumeIcon className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        aria-label="Small screen volume slider"
                        className="w-24 h-1.5 accent-primary cursor-pointer rounded-full"
                        style={theme.hasArtwork ? { accentColor: theme.accentRgb } : undefined}
                      />
                      <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">
                        {Math.round(volume * 100)}%
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Queue Button */}
              <button
                type="button"
                onClick={() => setIsQueueOpen((prev) => !prev)}
                className="relative flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                style={{ color: isQueueOpen ? theme.accentRgb : theme.iconColor }}
                title="Queue & Up Next"
                aria-label="Queue & Up Next"
              >
                <ListMusic className="h-3.5 w-3.5" />
                {activeQueue.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 min-w-[12px] px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-mono flex items-center justify-center font-bold">
                    {activeQueue.length}
                  </span>
                )}
              </button>

              {/* Dedicated Visualizer Full-Screen Button */}
              <button
                type="button"
                onClick={() => setIsFullScreenOpen(true)}
                className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                style={{ color: theme.iconColor }}
                title="Full Screen Visualizer (Press F)"
                aria-label="Full Screen Visualizer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>

              {/* Music Hub Navigation */}
              {location.pathname !== '/music' && (
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/music' })}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                  style={{ color: theme.iconColor }}
                  title="Open Music Hub"
                  aria-label="Go to Music"
                >
                  <Music className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Anchored Floating Queue Popover (Anchored Above Pod 3) */}
              <AnchoredQueuePopover
                isOpen={isQueueOpen}
                onClose={() => setIsQueueOpen(false)}
                queue={activeQueue}
                currentTrack={currentTrack}
                theme={theme}
                repeatMode={repeatMode}
                isShuffled={isShuffled}
                onToggleShuffle={() => toggleShuffle()}
                onCycleRepeat={cycleRepeat}
                onSelectTrack={handleSelectTrack}
                onRemoveTrack={(idx) => removeFromQueue(idx)}
              />
            </motion.div>
          </div>
        </>
      )}

      {/* Full Screen 3D/2D Visualizer Player Overlay: stays open regardless of active playback state */}
      {isFullScreenOpen && (
        <FullScreenMusicPlayer
          key="full-screen-music-player-portal"
          isOpen={isFullScreenOpen}
          onClose={() => setIsFullScreenOpen(false)}
        />
      )}
    </AnimatePresence>
  )
}
