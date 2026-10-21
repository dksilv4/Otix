import { Gamepad2, Zap, Cloud, Activity, ArrowRight, Settings2 } from 'lucide-react'
import { DkLogo } from '@/components/ui/atoms/logo'
import { DkButton } from '@/components/ui/atoms/button'
import { DkBadge } from '@/components/ui/atoms/badge'

interface InstallerWelcomeStepProps {
  version: string
  onGetStarted: () => void
  onQuickInstall: () => void
  onExit: () => void
  isSubmitting?: boolean
}

export const InstallerWelcomeStep = ({
  version,
  onGetStarted,
  onQuickInstall,
  onExit,
  isSubmitting = false,
}: InstallerWelcomeStepProps) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-7 select-none relative">
      {/* Upper Hero Section */}
      <div className="flex flex-col items-center text-center pt-2">
        {/* Glowing Logo & Badge */}
        <div className="relative flex flex-col items-center">
          <div className="relative mb-3 flex items-center justify-center">
            <div
              className="absolute -inset-4 rounded-full bg-[var(--primary)]/[0.18] blur-xl pointer-events-none"
              aria-hidden="true"
            />
            <DkLogo className="h-12 w-auto text-foreground relative z-10" animateInfinity />
          </div>

          <DkBadge variant="default" size="sm" className="mb-2.5 font-medium tracking-wide">
            v{version} · Public Preview
          </DkBadge>

          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl max-w-lg">
            The All-In-One Gaming Command Center
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Consolidate Steam, Epic, GOG, and emulators into one unified, lightning-fast library with zero bloat.
          </p>
        </div>

        {/* Feature Cards Grid (2x2) */}
        <div className="grid grid-cols-2 gap-2.5 w-full max-w-xl mt-5 text-left">
          {/* Feature 1 */}
          <div className="group rounded-xl p-3 bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-[var(--primary)]/[0.1] text-[var(--primary)]">
                <Gamepad2 className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-foreground">
                Unified Game Library
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal pl-8">
              Auto-detects titles and artwork across every launcher and custom folder.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="group rounded-xl p-3 bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-[var(--primary)]/[0.1] text-[var(--primary)]">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-foreground">
                CS2 & Live Game HUD
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal pl-8">
              Real-time match telemetry, kill tracker, economy radar, and XP gains.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="group rounded-xl p-3 bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-[var(--primary)]/[0.1] text-[var(--primary)]">
                <Cloud className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-foreground">
                Cloud Save Sync & Vault
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal pl-8">
              Continuous save game snapshots so you never lose progress across PCs.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="group rounded-xl p-3 bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-[var(--primary)]/[0.1] text-[var(--primary)]">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-foreground">
                Instant Native Engine
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal pl-8">
              Ultra-lightweight memory footprint and instant sub-second launch times.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] mt-4">
        <DkButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onExit}
          className="text-xs text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Exit Setup
        </DkButton>

        <div
          className="flex items-center gap-2.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onQuickInstall}
            disabled={isSubmitting}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Quick Install
          </DkButton>

          <DkButton
            type="button"
            variant="default"
            size="md"
            onClick={onGetStarted}
            disabled={isSubmitting}
            className="font-medium flex items-center gap-2 px-5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.25)]"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </DkButton>
        </div>
      </div>
    </div>
  )
}
