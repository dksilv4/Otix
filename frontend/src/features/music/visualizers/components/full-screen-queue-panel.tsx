import { motion } from 'framer-motion'
import { X, Play, Music, Trash2, Shuffle, Repeat, Repeat1 } from 'lucide-react'
import type { PlayerTrackInfo, RepeatMode } from '@/lib/player/types'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { formatVisualizerTime } from '../utils/visualizer-helpers'
import { cn } from '@/lib/utils'

export interface FullScreenQueuePanelProps {
  isOpen: boolean
  onClose: () => void
  queue: any[]
  currentTrack: PlayerTrackInfo | null
  theme: MusicPlayerTheme
  repeatMode: RepeatMode
  isShuffled: boolean
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onSelectTrack: (index: number) => void
  onRemoveTrack: (index: number) => void
}

export const FullScreenQueuePanel = ({
  isOpen,
  onClose,
  queue,
  currentTrack,
  theme,
  repeatMode,
  isShuffled,
  onToggleShuffle,
  onCycleRepeat,
  onSelectTrack,
  onRemoveTrack,
}: FullScreenQueuePanelProps) => {
  if (!isOpen) return null

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <motion.aside
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-0 right-0 bottom-0 z-30 w-full max-w-md backdrop-blur-2xl p-6 flex flex-col shadow-2xl border-l border-white/[0.06]"
      style={{
        background: theme.podBackground,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Play Queue</h2>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)]">
            {queue.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleShuffle}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
              isShuffled
                ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
            )}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
              repeatMode !== 'off'
                ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
            )}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            <RepeatIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
            aria-label="Close Queue"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Now playing item */}
      {currentTrack && (
        <div className="mt-4 p-3 rounded-xl bg-[var(--dk-surface-raised)]/70 flex items-center gap-3">
          {currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt={currentTrack.title}
              className="h-12 w-12 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-[var(--dk-surface-overlay)] flex items-center justify-center text-muted-foreground shrink-0">
              <Music className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="text-[11px] uppercase tracking-wider text-primary font-semibold block">
              Now Playing
            </span>
            <span className="text-sm font-semibold text-foreground truncate block">
              {currentTrack.title}
            </span>
            <span className="text-xs text-muted-foreground truncate block">
              {currentTrack.artist}
            </span>
          </div>
        </div>
      )}

      {/* Queue items list */}
      <div className="flex-1 overflow-y-auto mt-4 space-y-1 pr-1 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-muted-foreground text-sm">
            <Music className="h-8 w-8 mb-2 opacity-40" />
            <p>Queue is empty</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Upcoming songs will appear here
            </p>
          </div>
        ) : (
          queue.map((item, idx) => {
            const title = item.title || item.name || 'Unknown Track'
            const artist = item.artist || item.subtitle || 'Unknown Artist'
            const art = item.albumArt || item.artworkUrl || null
            const duration = item.durationMs || (item.duration ? item.duration * 1000 : 0)

            return (
              <div
                key={`${item.id || idx}-${idx}`}
                className="group flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer"
                onClick={() => onSelectTrack(idx)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xs font-mono text-muted-foreground/60 w-5 text-right shrink-0">
                    {idx + 1}
                  </span>
                  {art ? (
                    <img
                      src={art}
                      alt={title}
                      className="h-9 w-9 rounded-md object-cover shrink-0 bg-[var(--dk-surface-raised)]"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-md bg-[var(--dk-surface-raised)] flex items-center justify-center text-muted-foreground shrink-0">
                      <Music className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground truncate block group-hover:text-primary transition-colors">
                      {title}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {artist}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatVisualizerTime(duration)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveTrack(idx)
                    }}
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-ghost)] transition-colors"
                    title="Remove from queue"
                    aria-label="Remove from queue"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </motion.aside>
  )
}
