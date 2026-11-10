import { useState, useEffect, useRef } from 'react'
import { isDesktop, getDesktopAPI } from '@/lib/desktop/api'
import { useAuth } from '@auth/hooks/use-auth'
import { useAppUpdater } from './use-app-updater'
import {
  getLoadingStatusMessage,
  formatTransferProgress,
  dismissInitialLoadingScreen,
  type FormattedProgress,
} from '../utils/loading-screen-utils'

const DEFAULT_MIN_DISPLAY_MS = 600
const EXIT_ANIMATION_MS = 500
const MAX_IPC_WAIT_MS = 2500
const MAX_UPDATE_CHECK_WAIT_MS = 2500

export interface AppLoadingState {
  isMounted: boolean
  isReady: boolean
  isExiting: boolean
  statusMessage: string
  progress: FormattedProgress
  isDownloadingUpdate: boolean
}

export const useAppLoadingState = (minDisplayMs = DEFAULT_MIN_DISPLAY_MS): AppLoadingState => {
  const { isLoading: isAuthLoading } = useAuth()
  const updater = useAppUpdater()
  const desktop = isDesktop()

  const [minDisplayTimeDone, setMinDisplayTimeDone] = useState(false)
  const [ipcReady, setIpcReady] = useState(!desktop)
  const [updaterCheckDone, setUpdaterCheckDone] = useState(!desktop)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [isMounted, setIsMounted] = useState(true)

  const downloadTriggeredRef = useRef(false)
  const installTriggeredRef = useRef(false)

  // 1. Dismiss pre-hydration static HTML loading screen on mount
  useEffect(() => {
    dismissInitialLoadingScreen()
  }, [])

  // 2. Minimum screen display duration to ensure smooth, non-jarring visuals
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinDisplayTimeDone(true)
    }, minDisplayMs)
    return () => clearTimeout(timer)
  }, [minDisplayMs])

  // 3. Desktop IPC readiness check
  useEffect(() => {
    if (!desktop) {
      setIpcReady(true)
      return
    }

    let isCancelled = false
    const api = getDesktopAPI()

    if (typeof (api as Record<string, any>)?.onMainIpcReady === 'function') {
      const waitPromise = (api as Record<string, any>).onMainIpcReady()
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, MAX_IPC_WAIT_MS)
      })

      Promise.race([waitPromise, timeoutPromise])
        .catch(() => {})
        .finally(() => {
          if (!isCancelled) {
            setIpcReady(true)
          }
        })
    } else {
      setIpcReady(true)
    }

    return () => {
      isCancelled = true
    }
  }, [desktop])

  // 4. Update check timeout safeguard: don't hang if offline or GitHub rate limited
  useEffect(() => {
    if (!desktop) {
      setUpdaterCheckDone(true)
      return
    }

    const timer = setTimeout(() => {
      setUpdaterCheckDone(true)
    }, MAX_UPDATE_CHECK_WAIT_MS)

    return () => clearTimeout(timer)
  }, [desktop])

  // 5. React to updater status changes
  useEffect(() => {
    if (!desktop) return

    const { status, downloadUpdate, installUpdate } = updater

    if (status === 'not-available' || status === 'error') {
      setUpdaterCheckDone(true)
      return
    }

    if (status === 'available') {
      setUpdaterCheckDone(false)
      if (!downloadTriggeredRef.current) {
        downloadTriggeredRef.current = true
        void downloadUpdate()
      }
      return
    }

    if (status === 'downloading') {
      setUpdaterCheckDone(false)
      return
    }

    if (status === 'downloaded') {
      setUpdaterCheckDone(false)
      if (!installTriggeredRef.current) {
        installTriggeredRef.current = true
        setIsInstalling(true)
        void installUpdate()
      }
    }
  }, [desktop, updater])

  // 6. Readiness evaluation
  const isDownloadingUpdate = updater.status === 'downloading' || updater.status === 'available'
  const isWaitingOnUpdater = desktop && (isDownloadingUpdate || isInstalling || !updaterCheckDone)

  useEffect(() => {
    if (isReady) return

    const authResolved = !isAuthLoading
    const canComplete = minDisplayTimeDone && ipcReady && authResolved && !isWaitingOnUpdater

    if (canComplete) {
      setIsReady(true)
      setIsExiting(true)
    }
  }, [isReady, minDisplayTimeDone, ipcReady, isAuthLoading, isWaitingOnUpdater])

  // 7. Tear down loading screen once fade-out exit animation finishes
  useEffect(() => {
    if (!isExiting) return

    const exitTimer = setTimeout(() => {
      setIsMounted(false)
    }, EXIT_ANIMATION_MS)

    return () => clearTimeout(exitTimer)
  }, [isExiting])

  const statusMessage = getLoadingStatusMessage(
    updater.status,
    updater.availableVersion,
    isAuthLoading,
    isInstalling,
  )

  const progress = formatTransferProgress(updater.progress)

  return {
    isMounted,
    isReady,
    isExiting,
    statusMessage,
    progress,
    isDownloadingUpdate,
  }
}
