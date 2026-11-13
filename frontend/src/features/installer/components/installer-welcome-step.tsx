import { ArrowRight } from 'lucide-react'
import { DkLogo } from '@/components/ui/atoms/logo'
import { DkButton } from '@/components/ui/atoms/button'

interface InstallerWelcomeStepProps {
  version: string
  installPath?: string
  onGetStarted: () => void
  onQuickInstall: () => void
  onExit: () => void
  isSubmitting?: boolean
}

export const InstallerWelcomeStep = ({
  version,
  installPath = 'C:\\Program Files\\Otix',
  onGetStarted,
  onQuickInstall,
  onExit,
  isSubmitting = false,
}: InstallerWelcomeStepProps) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-8 select-none relative overflow-hidden text-center">
      {/* Spacer for optical vertical centering */}
      <div className="h-4" />

      {/* Ultra Minimalist Center Pod */}
      <div className="flex flex-col items-center justify-center space-y-7 max-w-sm mx-auto my-auto">
        {/* Floating Glowing Brand Logo - Commandingly Scaled */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute -inset-14 rounded-full bg-[var(--primary)]/[0.32] blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <DkLogo className="h-28 sm:h-32 w-auto text-foreground relative z-10" animateInfinity />
        </div>

        {/* Brand Name & Version */}
        <div className="space-y-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Otix
          </h1>
          <p className="text-xs text-muted-foreground font-medium tracking-wide">
            v{version}
          </p>
        </div>

        {/* Action Center */}
        <div className="flex flex-col items-center space-y-3.5 w-full">
          <DkButton
            type="button"
            variant="default"
            size="lg"
            onClick={onQuickInstall}
            disabled={isSubmitting}
            className="w-full py-3.5 px-8 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_0_36px_rgba(var(--primary-rgb),0.42)] active:scale-[0.98] transition-colors cursor-pointer border-none"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span>Install Now</span>
            <ArrowRight className="h-4 w-4" />
          </DkButton>

          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onGetStarted}
              disabled={isSubmitting}
              className="hover:text-foreground transition-colors cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              Options
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={onExit}
              disabled={isSubmitting}
              className="hover:text-foreground transition-colors cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* Clean Borderless Micro-Footer */}
      <div className="flex items-center justify-center text-xs text-muted-foreground pt-4 mt-auto">
        <span className="flex items-center gap-1.5">
          <span>Installs to</span>
          <code className="text-foreground/90 font-mono text-xs bg-white/[0.04] px-2.5 py-1 rounded-lg">
            {installPath}
          </code>
        </span>
      </div>
    </div>
  )
}
