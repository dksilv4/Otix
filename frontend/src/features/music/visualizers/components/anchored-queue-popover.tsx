import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Music, Trash2, Shuffle, Repeat, Repeat1 } from 'lucide-react'
import type { PlayerTrackInfo, RepeatMode } from '@/lib/player/types'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { formatVisualizerTime } from '../utils/visualizer-helpers'
import { cn } from '@/lib/utils'

export interface AnchoredQueuePopoverProps {
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

export const AnchoredQueuePopover = ({
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
}: AnchoredQueuePopoverProps) => {
  if (!isOpen) return null

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <AnimatePresence>
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        className="fixed inset-0 z-30 pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="anchored-queue-popover"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-full mb-3 right-0 sm:right-4 z-40 w-[calc(100vw-2rem)] sm:w-96 max-h-[440px] rounded-2xl backdrop-blur-2xl p-4 flex flex-col shadow-2xl select-none"
        style={{
          background: theme.podBackground,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Next in Queue</h3>
            <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)]">
              {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-lg transition-colors',
                isShuffled
                  ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
              title="Shuffle"
              aria-label="Shuffle"
            >
              <Shuffle className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onCycleRepeat}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-lg transition-colors',
                repeatMode !== 'off'
                  ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
              title={`Repeat: ${repeatMode}`}
              aria-label={`Repeat: ${repeatMode}`}
            >
              <RepeatIcon className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              aria-label="Close Queue"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto mt-2 space-y-1 pr-1 custom-scrollbar max-h-72">
          {queue.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-xs">
              <Music className="h-6 w-6 mx-auto mb-2 opacity-40" />
              <p>Queue is empty</p>
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
                  onClick={() => onSelectTrack(idx)}
                  className="group flex items-center justify-between gap-2.5 p-2 rounded-xl hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-muted-foreground/50 w-4 text-right shrink-0">
                      {idx + 1}
                    </span>
                    {art ? (
                      <img
                        src={art}
                        alt={title}
                        className="h-8 w-8 rounded-lg object-cover shrink-0 bg-[var(--dk-surface-raised)]"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-[var(--dk-surface-raised)] flex items-center justify-center text-muted-foreground shrink-0">
                        <Music className="h-3.5 w-3.5" />
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {formatVisualizerTime(duration)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveTrack(idx)
                      }}
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-ghost)] transition-all"
                      title="Remove"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
