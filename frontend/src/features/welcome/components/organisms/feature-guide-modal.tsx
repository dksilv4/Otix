import { useNavigate } from '@tanstack/react-router'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { ChevronLeft, ChevronRight, ExternalLink, Lightbulb } from 'lucide-react'
import type { WelcomeFeature } from '../../constants/welcome-features'

export interface FeatureGuideModalProps {
  feature: WelcomeFeature
  onClose: () => void
  isExiting?: boolean
  currentIndex?: number
  totalFeatures?: number
  onNext?: () => void
  onPrevious?: () => void
}

export const FeatureGuideModal = ({
  feature,
  onClose,
  isExiting = false,
  currentIndex,
  totalFeatures,
  onNext,
  onPrevious,
}: FeatureGuideModalProps) => {
  const navigate = useNavigate()
  const Icon = feature.icon

  const handleNavigateToFeature = () => {
    onClose()
    void navigate({ to: feature.route })
  }

  const hasTourPagination =
    typeof currentIndex === 'number' && typeof totalFeatures === 'number' && totalFeatures > 1

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="flex flex-col min-h-0 flex-1 space-y-6 pt-1 pb-1">
        {/* Header: Icon, Title & Tour Step */}
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl glass-inset shadow-inner"
            style={{
              color: feature.colorToken,
              backgroundColor: `color-mix(in srgb, ${feature.colorToken} 16%, transparent)`,
            }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {feature.title}
              </h2>
              {hasTourPagination && (
                <span className="rounded-full glass-inset px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {currentIndex + 1} of {totalFeatures}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-primary">
              {feature.tagline}
            </p>
          </div>
        </div>

        {/* Content Body: Clean glass-inset pods without harsh borders */}
        <div className="space-y-5 overflow-y-auto pr-1">
          <p className="text-sm text-foreground/80 leading-relaxed">
            {feature.fullDescription}
          </p>

          {/* Key Highlights */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Core Capabilities
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {feature.highlights.map((highlight) => (
                <div
                  key={highlight.title}
                  className="rounded-2xl glass-inset p-4 space-y-1"
                >
                  <p className="text-xs font-semibold text-foreground">
                    {highlight.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {highlight.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Pro Tip Callout */}
          <div className="rounded-2xl glass-inset p-4 flex items-start gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Lightbulb className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Pro Tip</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {feature.proTip}
              </p>
              {feature.shortcutHint && (
                <p className="mt-1 font-mono text-[11px] text-primary">
                  {feature.shortcutHint}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions: Generous sizing and backgrounds on all buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4">
          {hasTourPagination ? (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <DkButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onPrevious}
                disabled={currentIndex === 0}
                leftIcon={ChevronLeft}
                className="px-4 rounded-xl text-xs font-medium"
              >
                Previous
              </DkButton>
              <DkButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onNext}
                disabled={currentIndex === totalFeatures - 1}
                rightIcon={ChevronRight}
                className="px-4 rounded-xl text-xs font-medium"
              >
                Next
              </DkButton>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <DkButton
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              className="px-4 rounded-xl text-xs font-medium"
            >
              Close
            </DkButton>
            <DkButton
              type="button"
              variant="primary"
              size="md"
              onClick={handleNavigateToFeature}
              rightIcon={ExternalLink}
              className="px-5 rounded-xl text-xs font-semibold shadow-[var(--dk-shadow-sm)]"
            >
              {feature.routeLabel}
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}
