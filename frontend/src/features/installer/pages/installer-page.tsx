import { useCallback } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { useModal } from '@/lib/modals'
import { DkButton } from '@/components/ui/atoms/button'
import { InstallerWindowFrame } from '../components/installer-window-frame'
import { InstallerWelcomeStep } from '../components/installer-welcome-step'
import { InstallerConfigStep } from '../components/installer-config-step'
import { InstallerProgressStep } from '../components/installer-progress-step'
import { InstallerCompleteStep } from '../components/installer-complete-step'
import { InstallerCancelModal } from '../components/installer-cancel-modal'
import { useInstaller } from '../hooks/use-installer'

export const InstallerPage = () => {
  const {
    step,
    handleGoToConfig,
    handleGoBackToWelcome,
    version,
    installPath,
    setInstallPath,
    createDesktopShortcut,
    setCreateDesktopShortcut,
    createStartMenuShortcut,
    setCreateStartMenuShortcut,
    startOnBoot,
    setStartOnBoot,
    launchOnExit,
    setLaunchOnExit,
    isElevated,
    diskSpace,
    hasSpace,
    progress,
    error,
    isSubmitting,
    handleBrowseFolder,
    handleStartInstall,
    handleFinishAndLaunch,
    handleCancel,
  } = useInstaller()

  const { openModal } = useModal()

  const handleRequestClose = useCallback(() => {
    if (step === 'installing') {
      openModal(
        <InstallerCancelModal
          onConfirm={() => {
            handleCancel()
          }}
          onClose={() => {}}
        />,
      )
    } else {
      handleCancel()
    }
  }, [step, openModal, handleCancel])

  return (
    <InstallerWindowFrame>
      {step === 'welcome' && (
        <InstallerWelcomeStep
          version={version}
          onGetStarted={handleGoToConfig}
          onQuickInstall={handleStartInstall}
          onExit={handleRequestClose}
          isSubmitting={isSubmitting}
        />
      )}

      {step === 'config' && (
        <InstallerConfigStep
          version={version}
          installPath={installPath}
          onInstallPathChange={setInstallPath}
          onBrowse={handleBrowseFolder}
          createDesktopShortcut={createDesktopShortcut}
          onCreateDesktopShortcutChange={setCreateDesktopShortcut}
          createStartMenuShortcut={createStartMenuShortcut}
          onCreateStartMenuShortcutChange={setCreateStartMenuShortcut}
          startOnBoot={startOnBoot}
          onStartOnBootChange={setStartOnBoot}
          diskSpace={diskSpace}
          hasSpace={hasSpace}
          isElevated={isElevated}
          onStartInstall={handleStartInstall}
          onBack={handleGoBackToWelcome}
          onCancel={handleRequestClose}
          isSubmitting={isSubmitting}
        />
      )}

      {step === 'installing' && (
        <InstallerProgressStep
          progress={progress}
          onCancel={handleRequestClose}
        />
      )}

      {step === 'complete' && (
        <InstallerCompleteStep
          version={version}
          launchOnExit={launchOnExit}
          onLaunchOnExitChange={setLaunchOnExit}
          onFinish={handleFinishAndLaunch}
        />
      )}

      {step === 'error' && (
        <div className="flex-1 flex flex-col justify-between p-6">
          <div className="my-auto text-center flex flex-col items-center justify-center space-y-3 py-4">
            <div className="p-3 rounded-2xl bg-destructive/15 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="text-xl font-bold text-foreground">
                Installation Failed
              </h2>
              <p className="text-xs text-destructive/90 leading-relaxed">
                {error || 'An error occurred during installation. Please check permissions and try again.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.04]">
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestClose}
              className="text-xs"
            >
              Exit
            </DkButton>
            <DkButton
              type="button"
              variant="default"
              size="sm"
              onClick={handleStartInstall}
              className="text-xs px-5 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try Again
            </DkButton>
          </div>
        </div>
      )}
    </InstallerWindowFrame>
  )
}
