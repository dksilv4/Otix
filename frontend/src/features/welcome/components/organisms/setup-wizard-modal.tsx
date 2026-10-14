import { useNavigate } from '@tanstack/react-router'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSetupWizard } from '../../hooks/use-setup-wizard'
import { SetupStepWelcome } from '../molecules/setup-steps/setup-step-welcome'
import { SetupStepNode } from '../molecules/setup-steps/setup-step-node'
import { SetupStepLibraries } from '../molecules/setup-steps/setup-step-libraries'
import { SetupStepFeatures } from '../molecules/setup-steps/setup-step-features'
import { SetupStepCompletion } from '../molecules/setup-steps/setup-step-completion'

export interface SetupWizardModalProps {
  isOpen: boolean
  onClose: () => void
  onCompleted?: () => void
}

export const SetupWizardModal = ({
  isOpen,
  onClose,
  onCompleted,
}: SetupWizardModalProps) => {
  const navigate = useNavigate()
  const {
    step,
    totalSteps,
    mode,
    setMode,
    node,
    isProbingNode,
    probeNode,
    claimPin,
    setClaimPin,
    claimStatus,
    claimError,
    handleClaimNode,
    gamePath,
    setGamePath,
    isSelectingPath,
    handleSelectGamePath,
    telemetryEnabled,
    setTelemetryEnabled,
    freeGamesAlerts,
    setFreeGamesAlerts,
    isFinishing,
    nextStep,
    prevStep,
    finishSetup,
  } = useSetupWizard()

  const handleFinishDiscover = () => {
    void finishSetup(() => {
      onCompleted?.()
      onClose()
      void navigate({ to: '/' })
    })
  }

  const handleFinishLauncher = () => {
    void finishSetup(() => {
      onCompleted?.()
      onClose()
      void navigate({ to: '/launcher' })
    })
  }

  const stepLabels = ['Welcome', 'Node', 'Library', 'Features', 'Ready']

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-6 sm:p-8"
    >
      <div className="flex flex-col min-h-0 flex-1 space-y-6">
        {/* Header: Title & Step Indicator (close button rendered by DkDialog at top-right) */}
        <div className="flex items-center justify-between gap-4 pr-10">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Setup Wizard
            </span>
            <h2 className="text-sm font-semibold text-foreground/80">
              Step {step} of {totalSteps}: {stepLabels[step - 1]}
            </h2>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="flex items-center gap-1.5 w-full">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                idx + 1 === step
                  ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                  : idx + 1 < step
                  ? 'bg-primary/50'
                  : 'bg-white/[0.08]'
              }`}
            />
          ))}
        </div>

        {/* Dynamic Step Body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {step === 1 && (
            <SetupStepWelcome selectedMode={mode} onSelectMode={setMode} />
          )}

          {step === 2 && (
            <SetupStepNode
              node={node}
              isProbing={isProbingNode}
              onProbe={probeNode}
              claimPin={claimPin}
              onChangePin={setClaimPin}
              claimStatus={claimStatus}
              claimError={claimError}
              onClaim={handleClaimNode}
              onSkip={nextStep}
            />
          )}

          {step === 3 && (
            <SetupStepLibraries
              gamePath={gamePath}
              onChangePath={setGamePath}
              onSelectPath={handleSelectGamePath}
              isSelecting={isSelectingPath}
            />
          )}

          {step === 4 && (
            <SetupStepFeatures
              telemetryEnabled={telemetryEnabled}
              onToggleTelemetry={setTelemetryEnabled}
              freeGamesAlerts={freeGamesAlerts}
              onToggleFreeGames={setFreeGamesAlerts}
            />
          )}

          {step === 5 && (
            <SetupStepCompletion
              mode={mode}
              hasNode={Boolean(node) || claimStatus === 'success'}
              hasGamePath={Boolean(gamePath)}
              onFinishDiscover={handleFinishDiscover}
              onFinishLauncher={handleFinishLauncher}
              isFinishing={isFinishing}
            />
          )}
        </div>

        {/* Navigation Footer (for steps 1 to 4) */}
        {step < 5 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={prevStep}
              disabled={step === 1}
              leftIcon={ChevronLeft}
              className="text-xs"
            >
              Back
            </DkButton>

            <div className="flex items-center gap-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={nextStep}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip
              </DkButton>

              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={nextStep}
                rightIcon={ChevronRight}
                className="text-xs font-semibold px-4"
              >
                Continue
              </DkButton>
            </div>
          </div>
        )}
      </div>
    </DkDialog>
  )
}
