import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavigationScrollPillProps {
  /** Optional DOM element ID to scroll to */
  targetId?: string
  /** Explicit pixel scroll distance if targetId is omitted */
  scrollOffset?: number
  /** Label text for the pill */
  label?: string
  /** Custom click handler if caller wants bespoke scroll behavior */
  onClick?: () => void
  /** Optional extra classes */
  className?: string
}

/**
 * Universal scroll-down pill trigger.
 * Prompts user interaction to scroll down to page content, heros, or metadata sections.
 */
export const NavigationScrollPill = ({
  targetId,
  scrollOffset,
  label = 'Scroll to explore',
  onClick,
  className,
}: NavigationScrollPillProps) => {
  const handleClick = () => {
    if (onClick) {
      onClick()
      return
    }

    if (targetId) {
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }

    const offset = scrollOffset ?? (window.innerHeight * 0.65)
    window.scrollBy({ top: offset, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium',
        'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] backdrop-blur-xl',
        'text-muted-foreground hover:text-foreground shadow-[var(--dk-shadow-glass)]',
        'border border-white/[0.04] transition-all active:scale-95 cursor-pointer',
        className,
      )}
    >
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5 text-primary" />
    </button>
  )
}
