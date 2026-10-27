import { Sparkles, Dices, Film, Tv, Gamepad2 } from 'lucide-react'
import { openDecideWatch } from '@discover/open-decide-watch'

interface DiscoverDecideSectionProps {
  className?: string
}

export const DiscoverDecideSection = ({ className }: DiscoverDecideSectionProps) => {
  return (
    <section
      id="discover-decide-section"
      aria-label="Decide for Me"
      className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${className || ''}`}
    >
      <div className="relative rounded-3xl overflow-hidden bg-[var(--dk-surface-base)] p-6 sm:p-8 md:p-10 shadow-xl">
        {/* Ambient radial accent lighting */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Heading and Prompt */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Recommendation Roulette
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Can't Decide What to Watch or Play?
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl">
                Skip the endless scrolling. Let Otix roll the dice and pick tailored titles from your
                watchlist, popular releases, and top-rated games based on your available time and mood.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => openDecideWatch()}
                className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-xs sm:text-sm bg-primary text-primary-foreground shadow-lg hover:opacity-95 transition-all cursor-pointer"
              >
                <Dices className="h-4 w-4" />
                Roll the Dice
              </button>

              <button
                type="button"
                onClick={() => openDecideWatch()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground shadow-xs transition-all cursor-pointer"
              >
                <Film className="h-3.5 w-3.5 text-primary" />
                Movie Night
              </button>

              <button
                type="button"
                onClick={() => openDecideWatch()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground shadow-xs transition-all cursor-pointer"
              >
                <Tv className="h-3.5 w-3.5 text-primary" />
                Binge Series
              </button>

              <button
                type="button"
                onClick={() => openDecideWatch()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground shadow-xs transition-all cursor-pointer"
              >
                <Gamepad2 className="h-3.5 w-3.5 text-primary" />
                Next Game
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Dice Visual Callout */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <button
              type="button"
              onClick={() => openDecideWatch()}
              className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-lg transition-all w-full max-w-xs cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="relative mb-3 flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                  <Dices className="h-8 w-8 text-primary group-hover:rotate-12 transition-transform" />
                </div>
              </div>
              <span className="text-sm font-bold text-foreground mb-1">
                Surprise Me
              </span>
              <span className="text-[11px] text-muted-foreground text-center">
                Instant smart pick across all supported media
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
