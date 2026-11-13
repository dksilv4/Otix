import { useState } from 'react'
import { ListVideo, Play, X, Film, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlayableMediaItem } from '@/features/player/types/item'
import { formatSeconds, getQueueItemEpisodeTitle, getQueueItemEpisodeSubtitle } from '../../../utils/player'

export interface PlayerQueuePanelProps {
  queue: PlayableMediaItem[]
  onPlayItem: (index: number) => void
  onRemoveItem: (index: number) => void
  onClearQueue?: () => void
  onClose?: () => void
  className?: string
}

export const PlayerQueuePanel = ({
  queue,
  onPlayItem,
  onRemoveItem,
  onClearQueue,
  onClose,
  className,
}: PlayerQueuePanelProps) => {
  const [failedArtIds, setFailedArtIds] = useState<Record<string, boolean>>({})

  return (
    <aside
      aria-label="Upcoming Queue"
      className={cn(
        'w-full rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-2xl border border-white/[0.06] p-4 flex flex-col min-h-0 select-none overflow-hidden transition-all duration-200',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListVideo className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
            Up Next
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-mono font-bold shrink-0">
            {queue.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onClearQueue && queue.length > 0 && (
            <button
              type="button"
              onClick={onClearQueue}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer"
              title="Clear all queued items"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer"
              aria-label="Close queue"
              title="Close queue"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Queue Items List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pt-3 pr-1 min-h-0 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
        {queue.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Film className="h-6 w-6 opacity-30 text-muted-foreground" />
            <span>No upcoming episodes queued</span>
          </div>
        ) : (
          queue.map((item, index) => {
            const epTitle = getQueueItemEpisodeTitle(item)
            const epSubtitle = getQueueItemEpisodeSubtitle(item)
            const hasArt = Boolean(item.artworkUrl) && !failedArtIds[item.id]

            return (
              <div
                key={item.id || `queue-item-${index}`}
                onClick={() => onPlayItem(index)}
                className="group relative flex items-center gap-3 p-2 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-white/10 transition-all text-left border border-transparent hover:border-white/[0.04] cursor-pointer w-full select-none"
              >
                {/* Artwork / Thumbnail with Hover Play Indicator */}
                <div className="relative h-12 w-16 sm:h-14 sm:w-20 rounded-xl overflow-hidden shrink-0 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
                  {hasArt ? (
                    <img
                      src={item.artworkUrl!}
                      alt={epTitle}
                      onError={() =>
                        setFailedArtIds((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground bg-white/[0.02]">
                      <Film className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                      <Play className="h-3 w-3 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {epTitle}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {epSubtitle}
                  </p>
                  {typeof item.duration === 'number' && item.duration > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground/70 mt-1 block">
                      {formatSeconds(item.duration)}
                    </span>
                  )}
                </div>

                {/* Remove from queue button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveItem(index)
                  }}
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 text-muted-foreground hover:text-foreground transition-all shrink-0 border-0 bg-transparent cursor-pointer"
                  title="Remove from queue"
                  aria-label={`Remove ${epTitle} from queue`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Subtle Bottom Footer Info */}
      {queue.length > 0 && (
        <div className="pt-2.5 mt-1 border-t border-white/[0.04] text-[10px] text-muted-foreground/60 text-center shrink-0">
          Next episode plays automatically
        </div>
      )}
    </aside>
  )
}
