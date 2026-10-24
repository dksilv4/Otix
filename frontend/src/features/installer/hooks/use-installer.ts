import { useState, useEffect, useCallback } from 'react'
import type {
  DiskSpaceInfo,
  InstallStepProgress,
  InstallerStep,
} from '../types'
import { REQUIRED_DISK_SPACE_BYTES } from '../constants'
import { getDriveLetter } from '../utils/installer-utils'
import { getDesktopAPI } from '@/lib/desktop/api'

export const useInstaller = () => {
  const [step, setStep] = useState<InstallerStep>('welcome')
  const [version, setVersion] = useState<string>('0.1.25')
  const [installPath, setInstallPath] = useState<string>('C:\\Program Files\\Otix')
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState<boolean>(true)
  const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState<boolean>(true)
  const [startOnBoot, setStartOnBoot] = useState<boolean>(false)
  const [launchOnExit, setLaunchOnExit] = useState<boolean>(true)
  const [isElevated, setIsElevated] = useState<boolean>(true)
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo>({
    freeBytes: 120 * 1024 * 1024 * 1024,
    totalBytes: 500 * 1024 * 1024 * 1024,
    drive: 'C:',
  })
  const [progress, setProgress] = useState<InstallStepProgress>({
    percent: 0,
    status: 'Ready to install',
  })
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Fetch initial info from backend
  useEffect(() => {
    const api = getDesktopAPI()
    if (api?.installerGetInfo) {
      api.installerGetInfo().then((info) => {
        if (info.version) setVersion(info.version)
        if (info.defaultInstallPath) setInstallPath(info.defaultInstallPath)
        setIsElevated(Boolean(info.isElevated))
      }).catch((err) => {
        console.warn('[useInstaller] Failed to load installer info:', err)
      })
    }
  }, [])

  // Check disk space whenever install path changes
  useEffect(() => {
    const api = getDesktopAPI()
    if (api?.installerGetDiskSpace) {
      api.installerGetDiskSpace(installPath).then((info) => {
        if (info) setDiskSpace(info)
      }).catch((err) => {
        console.warn('[useInstaller] Failed to get disk space:', err)
      })
    } else {
      setDiskSpace((prev) => ({
        ...prev,
        drive: getDriveLetter(installPath),
      }))
    }
  }, [installPath])

  // Subscribe to progress events
  useEffect(() => {
    const api = getDesktopAPI()
    if (api?.installerOnProgress) {
      const unsubscribe = api.installerOnProgress((p) => {
        setProgress(p)
        if (p.percent >= 100) {
          setStep('complete')
          setIsSubmitting(false)
        }
      })
      return unsubscribe
    }
  }, [])

  const handleBrowseFolder = useCallback(async () => {
    const api = getDesktopAPI()
    if (api?.installerBrowseDirectory) {
      const selected = await api.installerBrowseDirectory(installPath)
      if (selected) {
        setInstallPath(selected)
      }
    }
  }, [installPath])

  const handleStartInstall = useCallback(async () => {
    setIsSubmitting(true)
    setError(null)
    setStep('installing')
    setProgress({ percent: 5, status: 'Preparing installation...' })

    const api = getDesktopAPI()
    if (api?.installerStartInstall) {
      try {
        const result = await api.installerStartInstall({
          installPath,
          createDesktopShortcut,
          createStartMenuShortcut,
          startOnBoot,
        })
        if (!result.success) {
          setError(result.error || 'Installation encountered an error.')
          setStep('error')
          setIsSubmitting(false)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown installation error'
        setError(message)
        setStep('error')
        setIsSubmitting(false)
      }
    } else {
      // Mock browser simulation for dev preview
      let current = 5
      const timer = setInterval(() => {
        current += 15
        if (current >= 100) {
          clearInterval(timer)
          setProgress({ percent: 100, status: 'Installation completed!' })
          setStep('complete')
          setIsSubmitting(false)
        } else {
          setProgress({
            percent: current,
            status: current < 40 ? 'Extracting Otix files...' : current < 75 ? 'Configuring components...' : 'Creating shortcuts...',
          })
        }
      }, 600)
    }
  }, [installPath, createDesktopShortcut, createStartMenuShortcut, startOnBoot])

  const handleFinishAndLaunch = useCallback(async () => {
    const api = getDesktopAPI()
    if (launchOnExit && api?.installerFinishAndLaunch) {
      await api.installerFinishAndLaunch()
    } else if (api?.closeWindow) {
      await api.closeWindow()
    } else {
      console.log('[useInstaller] Finished install, launchOnExit:', launchOnExit)
    }
  }, [launchOnExit])

  const handleCancel = useCallback(async () => {
    const api = getDesktopAPI()
    if (api?.installerCancel) {
      await api.installerCancel()
    } else if (api?.closeWindow) {
      await api.closeWindow()
    }
  }, [])

  const handleMinimize = useCallback(async () => {
    const api = getDesktopAPI()
    if (api?.minimizeWindow) {
      await api.minimizeWindow()
    }
  }, [])

  const handleGoToConfig = useCallback(() => {
    setStep('config')
  }, [])

  const handleGoBackToWelcome = useCallback(() => {
    setStep('welcome')
  }, [])

  const hasSpace = diskSpace.freeBytes >= REQUIRED_DISK_SPACE_BYTES

  return {
    step,
    setStep,
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
    handleMinimize,
  }
}
