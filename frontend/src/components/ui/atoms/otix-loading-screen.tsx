import { Logo } from '@ui/atoms/logo'
import { cn } from '@/lib/utils'

/** Full-viewport Otix loading mark (animated ∞ snake). */
export const OtixLoadingScreen = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn('flex items-center justify-center bg-background', className)}
      aria-label="Loading Otix…"
      aria-live="polite"
    >
      <Logo
        className="h-16 sm:h-20 drop-shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
        animateInfinity
      />
    </div>
  )
};
