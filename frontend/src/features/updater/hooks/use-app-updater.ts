import { useState, useEffect, useCallback, useRef } from 'react'
import { getDesktopAPI, isDesktop, type UpdateStatus, type UpdateProgress, type UpdateStatePayload } from '@/lib/desktop/api'
import type { AppUpdaterState } from '../types'
import {
  readAutoCheckPreference,
  saveAutoCheckPreference,
  readAutoDownloadPreference,
  saveAutoDownloadPreference,
} from '../utils/updater-utils'

const FALLBACK_VERSION = '0.1.22'

let globalIsModalOpen = false
const modalSubscribers = new Set<(open: boolean) => void>()

export const resetUpdateModalStateForTesting = (): void => {
  globalIsModalOpen = false
  modalSubscribers.clear()
}

export const useAppUpdater = (): AppUpdaterState => {
  const desktop = isDesktop()
  const [currentVersion, setCurrentVersion] = useState<string>(FALLBACK_VERSION)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDismissed, setIsDismissed] = useState<boolean>(false)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(globalIsModalOpen)
  const [autoCheck, setAutoCheckState] = useState<boolean>(readAutoCheckPreference)
  const [autoDownload, setAutoDownloadState] = useState<boolean>(readAutoDownloadPreference)

  const apiRef = useRef(getDesktopAPI()?.updater)

  useEffect(() => {
    const handler = (open: boolean) => setIsModalOpen(open)
    modalSubscribers.add(handler)
    return () => {
      modalSubscribers.delete(handler)
    }
  }, [])

  useEffect(() => {
    const api = getDesktopAPI()
    const updaterApi = api?.updater
    apiRef.current = updaterApi

    // Sync desktop settings if available
    if (api?.getDesktopSettings) {
      api.getDesktopSettings()
        .then((s) => {
          if (s?.autoCheckUpdates !== undefined) {
            setAutoCheckState(s.autoCheckUpdates)
            saveAutoCheckPreference(s.autoCheckUpdates)
          }
          if (s?.autoDownloadUpdates !== undefined) {
            setAutoDownloadState(s.autoDownloadUpdates)
            saveAutoDownloadPreference(s.autoDownloadUpdates)
          }
        })
        .catch(() => {})
    }

    if (!updaterApi) return

    // 1. Fetch current app version
    updaterApi.getVersion()
      .then((ver) => {
        if (ver) setCurrentVersion(ver)
      })
      .catch(() => {})

    // 2. Fetch current updater state
    updaterApi.getStatus()
      .then((initialState: UpdateStatePayload) => {
        if (!initialState) return
        setStatus(initialState.status)
        if (initialState.version) setAvailableVersion(initialState.version)
        if (initialState.releaseNotes) setReleaseNotes(initialState.releaseNotes)
        if (initialState.progress) setProgress(initialState.progress)
        if (initialState.error) setError(initialState.error)
      })
      .catch(() => {})

    // 3. Listen to live updates
    const unsubscribe = updaterApi.onStatusChanged((payload: UpdateStatePayload) => {
      setStatus(payload.status)
      if (payload.version) setAvailableVersion(payload.version)
      if (payload.releaseNotes !== undefined) setReleaseNotes(payload.releaseNotes ?? null)
      if (payload.progress) setProgress(payload.progress)
      if (payload.error !== undefined) setError(payload.error ?? null)
      if (payload.status === 'downloaded') {
        setIsDismissed(false)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [desktop])

  const checkForUpdates = useCallback(async () => {
    const api = apiRef.current ?? getDesktopAPI()?.updater
    if (!api) return
    setError(null)
    setStatus('checking')
    try {
      const res = await api.checkForUpdates()
      if (res?.error) {
        setError(res.error)
        setStatus('error')
      } else if (res?.status === 'not-available') {
        setStatus('not-available')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
    }
  }, [])

  const downloadUpdate = useCallback(async () => {
    const api = apiRef.current ?? getDesktopAPI()?.updater
    if (!api) return
    setError(null)
    setStatus('downloading')
    try {
      const res = await api.downloadUpdate()
      if (res?.error) {
        setError(res.error)
        setStatus('error')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
    }
  }, [])

  const installUpdate = useCallback(async () => {
    const api = apiRef.current ?? getDesktopAPI()?.updater
    if (!api) return
    try {
      await api.installUpdate()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }, [])

  const dismissNotification = useCallback(() => {
    setIsDismissed(true)
  }, [])

  const openUpdateModal = useCallback(() => {
    globalIsModalOpen = true
    modalSubscribers.forEach((fn) => fn(true))
  }, [])

  const closeUpdateModal = useCallback(() => {
    globalIsModalOpen = false
    modalSubscribers.forEach((fn) => fn(false))
  }, [])

  const setAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheckState(enabled)
    saveAutoCheckPreference(enabled)
    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      api.setDesktopSettings({ autoCheckUpdates: enabled }).catch(() => {})
    }
  }, [])

  const setAutoDownload = useCallback((enabled: boolean) => {
    setAutoDownloadState(enabled)
    saveAutoDownloadPreference(enabled)
    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      api.setDesktopSettings({ autoDownloadUpdates: enabled }).catch(() => {})
    }
  }, [])

  return {
    status,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress,
    error,
    isChecking: status === 'checking',
    isDownloading: status === 'downloading',
    isDownloaded: status === 'downloaded',
    isUpdateAvailable: status === 'available' || status === 'downloading' || status === 'downloaded',
    isDesktop: desktop,
    isDismissed,
    isModalOpen,
    autoCheck,
    autoDownload,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissNotification,
    openUpdateModal,
    closeUpdateModal,
    setAutoCheck,
    setAutoDownload,
  }
}

