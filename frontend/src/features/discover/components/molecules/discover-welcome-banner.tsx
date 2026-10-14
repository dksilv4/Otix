import { useNavigate } from '@tanstack/react-router'
import { Sparkles, Compass, Wand2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useWelcomePreferences, SetupWizardModal } from '@/features/welcome'
import { useModal } from '@/lib/modals'

export const DiscoverWelcomeBanner = () => {
  const navigate = useNavigate()
  const { isWelcomeBannerVisible, setWelcomeBannerVisible } = useWelcomePreferences()
  const { openModal } = useModal()

  if (!isWelcomeBannerVisible) return null

  const handleOpenWelcome = () => {
    void navigate({ to: '/welcome' })
  }

  const handleOpenSetup = () => {
    const close = openModal(
      <SetupWizardModal
        isOpen={true}
        onClose={() => close()}
        onCompleted={() => close()}
      />,
    )
  }

  const handleDismiss = () => {
    setWelcomeBannerVisible(false)
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] glass-card p-6 sm:p-7 shadow-[var(--dk-shadow-glass)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl glass-inset text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1 max-w-xl">
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Welcome to Otix
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Explore cinema and gaming, sync your collections across linked services and media servers, and track your entertainment progression in one place.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <DkButton
            type="button"
            variant="primary"
            size="md"
            onClick={handleOpenSetup}
            leftIcon={Wand2}
            className="px-5 rounded-xl font-semibold"
          >
            Setup Wizard
          </DkButton>
          <DkButton
            type="button"
            variant="secondary"
            size="md"
            onClick={handleOpenWelcome}
            leftIcon={Compass}
            className="px-4 rounded-xl text-xs font-medium"
          >
            Explore Features
          </DkButton>
          <DkButton
            type="button"
            variant="ghost"
            size="md"
            onClick={handleDismiss}
            className="px-3 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </DkButton>
        </div>
      </div>
    </div>
  )
}
