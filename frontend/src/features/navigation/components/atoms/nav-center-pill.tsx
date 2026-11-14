import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface NavCenterPillProps {
  /** Title text displayed in the pill */
  title: string
  /** Secondary subtitle or year, e.g. "2026" or "Episode 4" */
  subtitle?: string
  /** Optional thumbnail poster / cover image URL */
  thumbnailUrl?: string
  /** Fallback placeholder string if thumbnailUrl is missing (e.g. initials or "IMG") */
  thumbnailPlaceholder?: string
  /** Optional badge component (e.g. Otix score badge, status tag) */
  badge?: ReactNode
  /** Optional right action cluster (e.g. Play CTA, Wishlist button, Trailer trigger) */
  actions?: ReactNode
  /** Optional click handler for the title/thumbnail cluster (e.g. scroll to top or view details) */
  onTitleClick?: () => void
  /** Optional additional className */
  className?: string
}

/**
 * Standardized, production-grade visual center pill for the Otix floating navigation bar.
 * Follows the borderless, soft-glassmorphic Otix visual design language.
 */
export const NavCenterPill = ({
  title,
  subtitle,
  thumbnailUrl,
  thumbnailPlaceholder,
  badge,
  actions,
  onTitleClick,
  className,
}: NavCenterPillProps) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2.5 sm:gap-3.5 w-full min-w-0 select-none text-xs',
        className,
      )}
    >
      {/* ── Left Cluster: Thumbnail + Title + Subtitle ── */}
      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          aria-label={subtitle ? `${title} (${subtitle})` : title}
          className={cn(
            'flex items-center gap-2 sm:gap-2.5 min-w-0 shrink text-left cursor-pointer',
            'hover:opacity-90 active:scale-[0.98] transition-all rounded-lg',
            'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none'
          )}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-7 w-5 sm:h-7 sm:w-5 rounded-md object-cover shrink-0 shadow-sm border border-white/[0.04]"
            />
          ) : thumbnailPlaceholder ? (
            <div className="h-7 w-6 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
              {thumbnailPlaceholder}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-bold text-xs sm:text-sm text-foreground tracking-tight">
              {title}
            </span>
            {subtitle && (
              <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0 font-medium hidden sm:inline">
                ({subtitle})
              </span>
            )}
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-7 w-5 sm:h-7 sm:w-5 rounded-md object-cover shrink-0 shadow-sm border border-white/[0.04]"
            />
          ) : thumbnailPlaceholder ? (
            <div className="h-7 w-6 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
              {thumbnailPlaceholder}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-bold text-xs sm:text-sm text-foreground tracking-tight">
              {title}
            </span>
            {subtitle && (
              <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0 font-medium hidden sm:inline">
                ({subtitle})
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Right Cluster: Optional Badge + Action Buttons ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
        {badge && <div className="shrink-0">{badge}</div>}
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
