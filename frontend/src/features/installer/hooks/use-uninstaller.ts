import { useState, useEffect, useCallback } from 'react'
import type { UninstallerStep, UninstallerStepProgress } from '../types'
import { getDesktopAPI } from '@/lib/desktop/api'

export const useUninstaller = () => {
  const [step, setStep] = useState<UninstallerStep>('confirm')
  const [removeUserData, setRemoveUserData] = useState<boolean>(false)
  const [progress, setProgress] = useState<UninstallerStepProgress>({
    percent: 0,
    status: 'Ready to uninstall',
  })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  useEffect(() => {
    const api = getDesktopAPI()
    if (api?.uninstallerOnProgress) {
      const unsubscribe = api.uninstallerOnProgress((p) => {
        setProgress(p)
        if (p.percent >= 100) {
          setStep('complete')
          setIsSubmitting(false)
        }
      })
      return unsubscribe
    }
  }, [])

  const handleConfirmUninstall = useCallback(async () => {
    setIsSubmitting(true)
    setError(null)
    setStep('uninstalling')
    setProgress({ percent: 10, status: 'Removing shortcuts and registry entries...' })

    const api = getDesktopAPI()
    if (api?.uninstallerConfirm) {
      try {
        const result = await api.uninstallerConfirm({ removeUserData })
        if (!result.success) {
          setError(result.error || 'Uninstallation encountered an error.')
          setStep('error')
          setIsSubmitting(false)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown uninstallation error'
        setError(message)
        setStep('error')
        setIsSubmitting(false)
      }
    } else {
      // Mock for browser dev preview
      let current = 10
      const timer = setInterval(() => {
        current += 25
        if (current >= 100) {
          clearInterval(timer)
          setProgress({ percent: 100, status: 'Otix uninstalled successfully.' })
          setStep('complete')
          setIsSubmitting(false)
        } else {
          setProgress({
            percent: current,
            status: 'Cleaning up Otix components...',
          })
        }
      }, 500)
    }
  }, [removeUserData])

  const handleClose = useCallback(async () => {
    const api = getDesktopAPI()
    if (api?.closeWindow) {
      await api.closeWindow()
    }
  }, [])

  const handleMinimize = useCallback(async () => {
    const api = getDesktopAPI()
    if (api?.minimizeWindow) {
      await api.minimizeWindow()
    }
  }, [])

  return {
    step,
    removeUserData,
    setRemoveUserData,
    progress,
    error,
    isSubmitting,
    handleConfirmUninstall,
    handleClose,
    handleMinimize,
  }
}
