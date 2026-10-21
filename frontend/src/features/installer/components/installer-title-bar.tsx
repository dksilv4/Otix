import { Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import OtixLogoSvg from '@/assets/otix-logo.svg?react'

interface InstallerTitleBarProps {
  title?: string
  onMinimize: () => void
  onClose: () => void
  className?: string
}

export const InstallerTitleBar = ({
  title = 'Otix Setup',
  onMinimize,
  onClose,
  className,
}: InstallerTitleBarProps) => {
  return (
    <div
      className={cn(
        'h-10 w-full flex items-center justify-between px-4 select-none',
        'border-b border-white/[0.04] bg-white/[0.02]',
        className,
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Brand mark & title */}
      <div className="flex items-center gap-2.5">
        <OtixLogoSvg className="h-4 w-4 text-[var(--foreground)] opacity-90" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center gap-1 -mr-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onMinimize}
          className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          title="Minimize"
          aria-label="Minimize window"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors"
          title="Close"
          aria-label="Close window"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
