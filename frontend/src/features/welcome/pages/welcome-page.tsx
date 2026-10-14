import { useCallback, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useModal } from '@/lib/modals'
import { WELCOME_FEATURES, type WelcomeFeature } from '../constants/welcome-features'
import { WelcomeHero } from '../components/molecules/welcome-hero'
import { WelcomeCommandPaletteBar } from '../components/molecules/welcome-command-palette-bar'
import { WelcomeGettingStartedSteps } from '../components/molecules/welcome-getting-started-steps'
import { FeatureIntroCard } from '../components/molecules/feature-intro-card'
import { WelcomeVisibilityControls } from '../components/molecules/welcome-visibility-controls'
import { FeatureGuideModal } from '../components/organisms/feature-guide-modal'
import { SetupWizardModal } from '../components/organisms/setup-wizard-modal'

export const WelcomePage = () => {
  const { openModal } = useModal()
  const closeCurrentModalRef = useRef<(() => void) | null>(null)

  const openSetupWizard = useCallback(() => {
    closeCurrentModalRef.current?.()
    const close = openModal(
      <SetupWizardModal
        isOpen={true}
        onClose={() => {
          close()
          closeCurrentModalRef.current = null
        }}
        onCompleted={() => {
          close()
          closeCurrentModalRef.current = null
        }}
      />,
    )
    closeCurrentModalRef.current = close
  }, [openModal])

  const openFeatureModal = useCallback(
    (feature: WelcomeFeature, tourIndex?: number) => {
      // Close previous modal instance if switching in tour
      closeCurrentModalRef.current?.()

      const hasTour = typeof tourIndex === 'number'

      const close = openModal(
        <FeatureGuideModal
          feature={feature}
          currentIndex={tourIndex}
          totalFeatures={WELCOME_FEATURES.length}
          onNext={
            hasTour && tourIndex < WELCOME_FEATURES.length - 1
              ? () => openFeatureModal(WELCOME_FEATURES[tourIndex + 1], tourIndex + 1)
              : undefined
          }
          onPrevious={
            hasTour && tourIndex > 0
              ? () => openFeatureModal(WELCOME_FEATURES[tourIndex - 1], tourIndex - 1)
              : undefined
          }
          onClose={() => {
            close()
            closeCurrentModalRef.current = null
          }}
        />,
      )

      closeCurrentModalRef.current = close
    },
    [openModal],
  )

  const handleStartTour = useCallback(() => {
    openFeatureModal(WELCOME_FEATURES[0], 0)
  }, [openFeatureModal])

  return (
    <>
      <Helmet>
        <title>Welcome to Otix</title>
        <meta
          name="description"
          content="Explore what Otix can do: discover media, launch games, sync libraries, and earn progression XP."
        />
      </Helmet>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero Greeting */}
        <WelcomeHero onStartTour={handleStartTour} onStartSetup={openSetupWizard} />

        {/* Command Palette Interactive Showcase */}
        <WelcomeCommandPaletteBar />

        {/* 3 Actionable Getting Started Steps */}
        <WelcomeGettingStartedSteps />

        {/* Feature Grid Section */}
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Explore the Otix Ecosystem
            </h2>
            <p className="text-xs text-muted-foreground">
              Click on any feature below to see what it does, view pro-tips, or jump directly to it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {WELCOME_FEATURES.map((feature) => (
              <FeatureIntroCard
                key={feature.id}
                feature={feature}
                onLearnMore={(f) => openFeatureModal(f)}
              />
            ))}
          </div>
        </div>

        {/* Visibility & Settings Pod */}
        <WelcomeVisibilityControls />
      </div>
    </>
  )
}
