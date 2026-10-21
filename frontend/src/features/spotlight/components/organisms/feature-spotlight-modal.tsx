import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  ArrowRight,
  Command,
  Lightbulb,
} from 'lucide-react'
import { useFeatureSpotlight } from '../../hooks/use-feature-spotlight'

export interface FeatureSpotlightModalProps {
  initialTipId?: string
  onClose: () => void
  isExiting?: boolean
}

export const FeatureSpotlightModal = ({
  initialTipId,
  onClose,
  isExiting = false,
}: FeatureSpotlightModalProps) => {
  const {
    currentTip,
    currentIndex,
    totalTips,
    isAutoEnabled,
    setAutoEnabled,
    goToNext,
    goToPrevious,
    goToRandom,
    executeAction,
  } = useFeatureSpotlight({ initialTipId })

  const Icon = currentTip.icon || Lightbulb

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="flex flex-col min-h-0 flex-1 space-y-5 pt-1 pb-1">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl glass-inset shadow-inner"
            style={{
              color: currentTip.colorToken || 'var(--primary)',
              backgroundColor: `color-mix(in srgb, ${currentTip.colorToken || 'var(--primary)'} 16%, transparent)`,
            }}
          >
            <Icon className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full glass-inset px-2.5 py-0.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                {currentTip.categoryLabel}
              </span>
              <span className="rounded-full glass-inset px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                Tip {currentIndex + 1} of {totalTips}
              </span>
            </div>

            <h2 className="text-lg font-bold tracking-tight text-foreground leading-snug">
              {currentTip.title}
            </h2>
          </div>
        </div>

        {/* Content Body */}
        <div className="space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-foreground/80 leading-relaxed">
            {currentTip.description}
          </p>

          {/* Shortcut callout pod if present */}
          {currentTip.shortcut && (
            <div className="rounded-2xl glass-inset p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Command className="h-4 w-4 text-primary" />
                <span>Keyboard Shortcut</span>
              </div>
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-xl bg-[var(--dk-surface-ghost)] text-primary">
                {currentTip.shortcut}
              </span>
            </div>
          )}
        </div>

        {/* Navigation & Actions Footer */}
        <div className="space-y-4 pt-3 border-t border-[var(--dk-separator)]">
          {/* Sub-bar: cycling controls and auto-prompt toggle */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={goToPrevious}
                leftIcon={ChevronLeft}
                className="rounded-xl px-2.5 text-xs"
                title="Previous Tip"
              >
                Previous
              </DkButton>

              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={goToRandom}
                leftIcon={Dices}
                className="rounded-xl px-2.5 text-xs"
                title="Random Tip"
              >
                Random
              </DkButton>

              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={goToNext}
                rightIcon={ChevronRight}
                className="rounded-xl px-2.5 text-xs"
                title="Next Tip"
              >
                Next
              </DkButton>
            </div>

            <DkSwitch
              checked={isAutoEnabled}
              onCheckedChange={setAutoEnabled}
              label="Auto-suggestions"
              className="text-xs text-muted-foreground"
            />
          </div>

          {/* Primary Action bar */}
          <div className="flex items-center justify-end gap-2.5">
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
              onClick={() => executeAction(currentTip, onClose)}
              rightIcon={ArrowRight}
              className="px-5 rounded-xl text-xs font-semibold shadow-[var(--dk-shadow-sm)]"
            >
              {currentTip.actionLabel || 'Try it now'}
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}
