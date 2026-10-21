import { Film, Tv, Gamepad2, Gift, SlidersHorizontal, Compass, Play } from 'lucide-react'
import { type DiscoverIntent } from '../../utils/sections'

interface DiscoverIntentBarProps {
  activeIntent: DiscoverIntent
  onSelectIntent: (intent: DiscoverIntent) => void
  onOpenCustomize: () => void
  className?: string
}

export const DiscoverIntentBar = ({
  activeIntent,
  onSelectIntent,
  onOpenCustomize,
  className,
}: DiscoverIntentBarProps) => {
  return (
    <div
      id="discover-intent-bar"
      className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${className || ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        {/* Floating Category Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectIntent('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'all'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            All Media
          </button>

          <button
            type="button"
            onClick={() => onSelectIntent('streamable')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'streamable'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Streamable
          </button>

          <button
            type="button"
            onClick={() => onSelectIntent('movies')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'movies'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Movies
          </button>

          <button
            type="button"
            onClick={() => onSelectIntent('shows')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'shows'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tv className="h-3.5 w-3.5" />
            TV Shows
          </button>

          <button
            type="button"
            onClick={() => onSelectIntent('games')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'games'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            Games
          </button>

          <button
            type="button"
            onClick={() => onSelectIntent('free_games')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl shadow-sm ${
              activeIntent === 'free_games'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Gift className="h-3.5 w-3.5" />
            Free Deals
          </button>
        </div>

        {/* Floating Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCustomize}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] backdrop-blur-xl border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground shadow-sm transition-all cursor-pointer"
            aria-label="Customize Discover Sections"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Customize Feed
          </button>
        </div>
      </div>
    </div>
  )
};
