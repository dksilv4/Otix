import { Clapperboard, X } from 'lucide-react'

export interface PlayerHeaderProps {
  title: string
  source?: string
  isTrailer: boolean
  onClose: () => void
}

export const PlayerHeader = ({
  title,
  source,
  isTrailer,
  onClose,
}: PlayerHeaderProps) => {
  return (
    <div className="flex items-center justify-between w-full px-1">
      {/* Title pill */}
      <div className="flex h-9 items-center gap-2 pl-2 pr-3.5 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-lg border-0 min-w-0">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clapperboard className="h-3 w-3" />
        </span>
        <span className="truncate text-xs sm:text-sm font-medium text-primary-foreground max-w-[200px] sm:max-w-md">
          {title}
        </span>
        {!isTrailer && source && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold uppercase tracking-wider">
            {source}
          </span>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] hover:bg-white/15 text-muted-foreground hover:text-primary-foreground backdrop-blur-xl shadow-lg transition-all border-0 pointer-events-auto cursor-pointer"
        aria-label={isTrailer ? 'Close trailer' : 'Close (Esc)'}
        title={isTrailer ? 'Close trailer' : 'Close (Esc)'}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
