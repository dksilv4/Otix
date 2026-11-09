import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Shuffle,
  Repeat,
  Repeat1,
  Trash2,
  ListMusic,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Disc3,
} from 'lucide-react'
import { usePlayer } from '@/lib/player/use-player'
import { usePlayerProgress } from '@/lib/player/use-player-progress'
import { cn } from '@/lib/utils'
import { formatTrackDuration } from '../../utils/music-helpers'
import { useMusicPalette } from '../../hooks/use-music-palette'

export interface MusicQueueDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export const MusicQueueDrawer = ({ isOpen, onClose }: MusicQueueDrawerProps) => {
  const {
    source,
    isPlaying,
    currentTrack,
    repeatMode,
    isShuffled,
    togglePlay,
    skipNext,
    skipPrevious,
    toggleShuffle,
    setRepeatMode,
    removeFromQueue,
    localQueue,
    plexQueue,
    jellyfinQueue,
    stop,
  } = usePlayer()
  const { position, duration } = usePlayerProgress()

  const activeQueue = source === 'local' ? localQueue : source === 'jellyfin' ? jellyfinQueue : plexQueue
  const theme = useMusicPalette(currentTrack?.albumArt)
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0

  const cycleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all')
    else if (repeatMode === 'all') setRepeatMode('one')
    else setRepeatMode('off')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9995] bg-[var(--dk-surface-overlay)] backdrop-blur-sm"
          />

          {/* Drawer container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="fixed right-0 top-0 bottom-0 z-[9996] flex w-full max-w-md flex-col backdrop-blur-2xl shadow-[var(--dk-shadow-dialog)] border-l border-white/[0.05] transition-[background] duration-500"
            style={{
              background: theme.drawerBackdropGradient,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
              <div className="flex items-center gap-2">
                <ListMusic className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Play Queue</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close queue"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable queue area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Now Playing Pod */}
              {currentTrack ? (
                <div
                  className="rounded-2xl p-4 flex flex-col gap-3.5 transition-[background,border-color] duration-500"
                  style={{
                    background: theme.podBackground,
                    border: `1px solid ${theme.borderColor}`,
                  }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Now Playing
                  </span>

                  <div className="flex items-center gap-3.5">
                    {currentTrack.albumArt ? (
                      <img
                        src={currentTrack.albumArt}
                        alt={currentTrack.title}
                        className="h-14 w-14 rounded-xl object-cover bg-[var(--dk-surface-glass)] transition-all"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--dk-surface-glass)] text-muted-foreground">
                        <Disc3 className="h-7 w-7" />
                      </div>
                    )}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-sm font-bold text-foreground">
                        {currentTrack.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {currentTrack.artist}
                      </span>
                      {currentTrack.albumName && (
                        <span className="truncate text-[11px] text-muted-foreground/80">
                          {currentTrack.albumName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--dk-surface-raised)]">
                      <div
                        className={cn('h-full transition-all duration-200', !theme.hasArtwork && 'bg-primary')}
                        style={{
                          width: `${progressPercent}%`,
                          ...(theme.hasArtwork
                            ? {
                                backgroundColor: theme.accentRgb,
                              }
                            : {}),
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                      <span>{formatTrackDuration(position)}</span>
                      <span>{formatTrackDuration(duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={toggleShuffle}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                        isShuffled
                          ? !theme.hasArtwork && 'text-primary bg-primary/15'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      style={
                        isShuffled && theme.hasArtwork
                          ? { backgroundColor: theme.accentRgba(0.18), color: theme.accentRgb }
                          : undefined
                      }
                      aria-label="Toggle shuffle"
                    >
                      <Shuffle className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void skipPrevious()}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                        aria-label="Previous track"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void togglePlay()}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full shadow-none transition-transform hover:scale-105 active:scale-95',
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
                        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => void skipNext()}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                        aria-label="Next track"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={cycleRepeat}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                        repeatMode !== 'off'
                          ? !theme.hasArtwork && 'text-primary bg-primary/15'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      style={
                        repeatMode !== 'off' && theme.hasArtwork
                          ? { backgroundColor: theme.accentRgba(0.18), color: theme.accentRgb }
                          : undefined
                      }
                      aria-label="Cycle repeat mode"
                    >
                      {repeatMode === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl p-8 text-center text-muted-foreground bg-[var(--dk-surface-raised)] border border-white/[0.04]">
                  <Disc3 className="h-10 w-10 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-sm font-medium">Nothing playing right now</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    Select a track or album from Plex or Local Files to start.
                  </p>
                </div>
              )}

              {/* Up Next List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Up Next ({activeQueue.length})
                  </h4>
                  {activeQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => stop()}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {activeQueue.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic py-2">
                    Queue is empty.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {activeQueue.map((item, idx) => (
                      <div
                        key={`${item.id}-${idx}`}
                        className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 text-right font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-xs font-medium text-foreground">
                              {item.title}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {item.artist}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatTrackDuration(item.durationMs)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromQueue(idx)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                            aria-label={`Remove ${item.title} from queue`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
