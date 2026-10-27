import { useNavigate } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { Sparkles, Compass, Wand2 } from 'lucide-react'

export interface WelcomeHeroProps {
  onStartTour: () => void
  onStartSetup?: () => void
}

export const WelcomeHero = ({ onStartTour, onStartSetup }: WelcomeHeroProps) => {
  const navigate = useNavigate()

  const handleGoToDiscover = () => {
    void navigate({ to: '/' })
  }

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-[var(--dk-surface-glass)] backdrop-blur-xl p-8 sm:p-10 shadow-[var(--dk-shadow-glass)]">
      <div className="relative z-10 max-w-3xl space-y-5">
        {/* Subtle badge */}
        <div className="inline-flex items-center gap-2 rounded-full glass-inset px-3.5 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Welcome & Guide</span>
        </div>

        {/* Hero Title */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
            Welcome to Otix
          </h1>
          <p className="text-base sm:text-lg font-medium text-foreground/80">
            Your Entertainment, <span className="text-primary font-semibold">Unified</span> & In Sync
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl pt-0.5">
            Discover cinema and television tailored to your taste, launch your PC games with live telemetry, orchestrate downloads, and earn progression XP across your collection.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {onStartSetup && (
            <DkButton
              type="button"
              variant="primary"
              size="md"
              onClick={onStartSetup}
              leftIcon={Wand2}
              className="px-5 rounded-xl font-semibold shadow-[var(--dk-shadow-sm)]"
            >
              Launch Setup Wizard
            </DkButton>
          )}

          <DkButton
            type="button"
            variant={onStartSetup ? 'secondary' : 'primary'}
            size="md"
            onClick={onStartTour}
            leftIcon={Sparkles}
            className="px-5 rounded-xl font-semibold shadow-[var(--dk-shadow-sm)]"
          >
            Start Feature Tour
          </DkButton>

          <DkButton
            type="button"
            variant="secondary"
            size="md"
            onClick={handleGoToDiscover}
            leftIcon={Compass}
            className="px-5 rounded-xl font-semibold shadow-[var(--dk-shadow-sm)]"
          >
            Explore Discover
          </DkButton>
        </div>
      </div>
    </div>
  )
}
