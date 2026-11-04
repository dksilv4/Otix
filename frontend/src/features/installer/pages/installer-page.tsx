import { useCallback } from 'react'
import { useModal } from '@/lib/modals'
import { InstallerWindowFrame } from '../components/installer-window-frame'
import { InstallerWelcomeStep } from '../components/installer-welcome-step'
import { InstallerConfigStep } from '../components/installer-config-step'
import { InstallerProgressStep } from '../components/installer-progress-step'
import { InstallerCompleteStep } from '../components/installer-complete-step'
import { InstallerCancelModal } from '../components/installer-cancel-modal'
import { InstallerErrorStep } from '../components/installer-error-step'
import { useInstaller } from '../hooks/use-installer'

export const InstallerPage = () => {
  const {
    step,
    handleGoToConfig,
    handleGoBackToWelcome,
    handleRelaunchElevated,
    handleInstallToUserFolder,
    version,
    installPath,
    setInstallPath,
    createDesktopShortcut,
    setCreateDesktopShortcut,
    createStartMenuShortcut,
    setCreateStartMenuShortcut,
    startOnBoot,
    setStartOnBoot,
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

  const { openModal, closeAll } = useModal()

  const handleRequestClose = useCallback(() => {
    if (step === 'installing') {
      openModal(
        <InstallerCancelModal
          onConfirm={() => {
            closeAll()
            handleCancel()
          }}
          onClose={() => closeAll()}
        />,
      )
    } else {
      handleCancel()
    }
  }, [step, openModal, closeAll, handleCancel])

  return (
    <InstallerWindowFrame>
      {step === 'welcome' && (
        <InstallerWelcomeStep
          version={version}
          installPath={installPath}
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
          onFinish={handleFinishAndLaunch}
          onClose={handleRequestClose}
        />
      )}

      {step === 'error' && (
        <InstallerErrorStep
          error={error}
          installPath={installPath}
          onRetry={handleStartInstall}
          onRelaunchElevated={handleRelaunchElevated}
          onInstallToUserFolder={handleInstallToUserFolder}
          onGoToConfig={handleGoToConfig}
          onExit={handleRequestClose}
        />
      )}
    </InstallerWindowFrame>
  )
}
