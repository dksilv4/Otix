import logoSvg from '@/assets/otix-logo.svg?raw'
import { cn } from '@/lib/utils'

const strokeSvg = logoSvg.replace(
  /fill="currentColor"/g,
  'fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"',
)

export function InfinitySpinner({ className }: { className?: string }) {
  return (
    <div className={cn('relative animate-infinity-spin', className)}>
      {/* Filled logo — static base */}
      <div
        className="[&_svg]:h-full [&_svg]:w-auto text-foreground/20"
        dangerouslySetInnerHTML={{ __html: logoSvg }}
      />

      {/* Stroked overlay — animated dash tracing the logo outline */}
      <div
        className="absolute inset-0 [&_svg]:h-full [&_svg]:w-auto text-primary animate-infinity-dash-glow"
        style={{
          filter: 'drop-shadow(0 0 6px var(--primary))',
        }}
        dangerouslySetInnerHTML={{ __html: strokeSvg }}
      />
    </div>
  )
}
