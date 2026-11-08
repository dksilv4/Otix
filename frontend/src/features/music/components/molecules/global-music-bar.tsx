import { useState, useRef, useCallback } from 'react'
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
  X,
  ListMusic,
} from 'lucide-react'
import { usePlayer } from '@/lib/player/use-player'
import { usePlayerProgress } from '@/lib/player/use-player-progress'
import { cn } from '@/lib/utils'
import { formatTrackDuration } from '../../utils/music-helpers'
import { useMusicPalette } from '../../hooks/use-music-palette'
import { MusicQueueDrawer } from '../organisms/music-queue-drawer'

export const GlobalMusicBar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    source,
    isPlaying,
    currentTrack,
    volume,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    stop,
  } = usePlayer()
  const { position, duration } = usePlayerProgress()

  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [prevVolume, setPrevVolume] = useState(0.7)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const isVisible = source !== 'none' && currentTrack !== null
  const theme = useMusicPalette(currentTrack?.albumArt)

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0

  const handleProgressBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = progressBarRef.current?.getBoundingClientRect()
      if (!rect || duration <= 0) return
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      void seek(ratio * duration)
    },
    [duration, seek],
  )

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume)
      setVolume(0)
    } else {
      setVolume(prevVolume || 0.7)
    }
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            key="global-music-bar"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] w-[calc(100%-2rem)] max-w-xl md:max-w-2xl rounded-2xl backdrop-blur-2xl p-2 sm:px-4 sm:py-2.5 select-none transition-[background,box-shadow,border-color] duration-500 ease-out"
            style={{
              background: theme.containerBackground,
              boxShadow: theme.glowShadow,
              border: `1px solid ${theme.borderColor}`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Left: Track info + album art */}
              <div
                onClick={() => setIsQueueOpen(true)}
                className="flex items-center gap-3 min-w-0 max-w-[35%] cursor-pointer group"
                title="Open Now Playing & Queue"
              >
                {currentTrack.albumArt ? (
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.title}
                    className="h-10 w-10 shrink-0 rounded-xl object-cover bg-[var(--dk-surface-raised)] group-hover:scale-105 transition-all"
                    style={theme.hasArtwork ? { boxShadow: `0 4px 12px ${theme.accentRgba(0.3)}` } : undefined}
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dk-surface-raised)] text-muted-foreground group-hover:scale-105 transition-transform">
                    <Disc3 className="h-5 w-5" />
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {currentTrack.title}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {currentTrack.artist}
                  </span>
                </div>
              </div>

              {/* Center: Playback controls + scrubber */}
              <div className="flex flex-col items-center flex-1 max-w-xs gap-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => void skipPrevious()}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                    aria-label="Previous track"
                  >
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void togglePlay()}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all',
                      !theme.hasArtwork && 'bg-primary text-primary-foreground',
                    )}
                    style={
                      theme.hasArtwork
                        ? {
                            backgroundColor: theme.accentRgb,
                            color: theme.accentText,
                            boxShadow: `0 2px 10px ${theme.accentRgba(0.35)}`,
                          }
                        : undefined
                    }
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                    aria-label="Next track"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-7 text-right">
                    {formatTrackDuration(position)}
                  </span>
                  <div
                    ref={progressBarRef}
                    onClick={handleProgressBarClick}
                    className="relative h-1.5 flex-1 rounded-full bg-[var(--dk-surface-raised)] cursor-pointer overflow-hidden group/bar"
                  >
                    <div
                      className={cn(
                        'h-full transition-all duration-150',
                        !theme.hasArtwork && 'bg-primary',
                      )}
                      style={{
                        width: `${progressPercent}%`,
                        ...(theme.hasArtwork
                          ? {
                              backgroundColor: theme.accentRgb,
                              boxShadow: `0 0 10px ${theme.accentRgba(0.6)}`,
                            }
                          : {}),
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-7">
                    {formatTrackDuration(duration)}
                  </span>
                </div>
              </div>

              {/* Right: Volume & actions */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <div
                  className="flex items-center group/volume"
                  onWheel={(e) => {
                    e.preventDefault()
                    setVolume(Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? 0.05 : -0.05))))
                  }}
                >
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                    aria-label="Volume"
                    title={volume === 0 ? 'Unmute' : `Volume: ${Math.round(volume * 100)}% (scroll to adjust)`}
                  >
                    <VolumeIcon className="h-3.5 w-3.5" />
                  </button>

                  <div className="flex items-center w-14 sm:w-20 px-1">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      aria-label="Volume slider"
                      className={cn(
                        'w-full h-1.5 cursor-pointer rounded-full accent-primary bg-[var(--dk-surface-raised)]',
                        !theme.hasArtwork && 'accent-primary',
                      )}
                      style={theme.hasArtwork ? { accentColor: theme.accentRgb } : undefined}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsQueueOpen((prev) => !prev)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                    isQueueOpen
                      ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                  )}
                  title="Now Playing & Queue"
                  aria-label="Now Playing & Queue"
                >
                  <ListMusic className="h-3.5 w-3.5" />
                </button>

                {location.pathname !== '/music' && (
                  <button
                    type="button"
                    onClick={() => void navigate({ to: '/music' })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                    title="Open Music Hub"
                    aria-label="Go to Music"
                  >
                    <Music className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => stop()}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  title="Stop playback"
                  aria-label="Stop playback"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>

          <MusicQueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
        </>
      )}
    </AnimatePresence>
  )
}
