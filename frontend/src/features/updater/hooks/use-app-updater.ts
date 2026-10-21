import { useState, useEffect, useCallback, useRef } from 'react'
import { getDesktopAPI, isDesktop, type UpdateStatus, type UpdateProgress, type UpdateStatePayload } from '@/lib/desktop/api'
import type { AppUpdaterState } from '../types'
import {
  readAutoCheckPreference,
  saveAutoCheckPreference,
  readAutoDownloadPreference,
  saveAutoDownloadPreference,
  readAllowPrereleasePreference,
  saveAllowPrereleasePreference,
  fetchLatestReleaseNotes,
} from '../utils/updater-utils'

const FALLBACK_VERSION = '0.1.24'

let globalIsModalOpen = false
const modalSubscribers = new Set<(open: boolean) => void>()

let globalIsReleaseNotesOpen = false
const releaseNotesSubscribers = new Set<(open: boolean) => void>()

export const resetUpdateModalStateForTesting = (): void => {
  globalIsModalOpen = false
  modalSubscribers.clear()
  globalIsReleaseNotesOpen = false
  releaseNotesSubscribers.clear()
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
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState<boolean>(globalIsReleaseNotesOpen)
  const [autoCheck, setAutoCheckState] = useState<boolean>(readAutoCheckPreference)
  const [autoDownload, setAutoDownloadState] = useState<boolean>(readAutoDownloadPreference)
  const [allowPrerelease, setAllowPrereleaseState] = useState<boolean>(readAllowPrereleasePreference)
  const [githubToken, setGithubTokenState] = useState<string>('')

  const apiRef = useRef(getDesktopAPI()?.updater)
  const hasCheckedOnLaunchRef = useRef(false)

  useEffect(() => {
    const handler = (open: boolean) => setIsModalOpen(open)
    modalSubscribers.add(handler)
    return () => {
      modalSubscribers.delete(handler)
    }
  }, [])

  useEffect(() => {
    const handler = (open: boolean) => setIsReleaseNotesOpen(open)
    releaseNotesSubscribers.add(handler)
    return () => {
      releaseNotesSubscribers.delete(handler)
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
          if (s?.allowPrerelease !== undefined) {
            setAllowPrereleaseState(s.allowPrerelease)
            saveAllowPrereleasePreference(s.allowPrerelease)
          }
          if (s?.githubToken !== undefined) {
            setGithubTokenState(s.githubToken)
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

    // 2. Fetch current updater state and check for updates on app launch
    updaterApi.getStatus()
      .then((initialState: UpdateStatePayload) => {
        if (initialState) {
          setStatus(initialState.status)
          if (initialState.version) setAvailableVersion(initialState.version)
          if (initialState.releaseNotes) setReleaseNotes(initialState.releaseNotes)
          if (initialState.progress) setProgress(initialState.progress)
          if (initialState.error) setError(initialState.error)
        }

        if (!hasCheckedOnLaunchRef.current && (initialState?.status === 'idle' || !initialState)) {
          hasCheckedOnLaunchRef.current = true
          updaterApi.checkForUpdates().catch(() => {})
        }
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

    if (!releaseNotes) {
      fetchLatestReleaseNotes()
        .then((latest) => {
          if (latest?.notes) {
            setReleaseNotes(latest.notes)
            if (!availableVersion && latest.version) {
              setAvailableVersion(latest.version)
            }
          }
        })
        .catch(() => {})
    }
  }, [releaseNotes, availableVersion])

  const closeUpdateModal = useCallback(() => {
    globalIsModalOpen = false
    modalSubscribers.forEach((fn) => fn(false))
  }, [])

  const openReleaseNotesModal = useCallback(() => {
    globalIsReleaseNotesOpen = true
    releaseNotesSubscribers.forEach((fn) => fn(true))

    if (!releaseNotes) {
      fetchLatestReleaseNotes()
        .then((latest) => {
          if (latest?.notes) {
            setReleaseNotes(latest.notes)
            if (!availableVersion && latest.version) {
              setAvailableVersion(latest.version)
            }
          }
        })
        .catch(() => {})
    }
  }, [releaseNotes, availableVersion])

  const closeReleaseNotesModal = useCallback(() => {
    globalIsReleaseNotesOpen = false
    releaseNotesSubscribers.forEach((fn) => fn(false))
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

  const setAllowPrerelease = useCallback((enabled: boolean) => {
    setAllowPrereleaseState(enabled)
    saveAllowPrereleasePreference(enabled)
    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      api.setDesktopSettings({ allowPrerelease: enabled }).catch(() => {})
    }
  }, [])

  const setGithubToken = useCallback(async (token: string) => {
    const trimmed = token.trim()
    setGithubTokenState(trimmed)
    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      await api.setDesktopSettings({ githubToken: trimmed }).catch(() => {})
    }
  }, [])

  const validateToken = useCallback(async (token?: string) => {
    const api = apiRef.current ?? getDesktopAPI()?.updater
    if (api?.validateToken) {
      return await api.validateToken(token)
    }
    return { valid: false, error: 'Token validation is only supported in Desktop mode.' }
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
    allowPrerelease,
    githubToken,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissNotification,
    openUpdateModal,
    closeUpdateModal,
    isReleaseNotesOpen,
    openReleaseNotesModal,
    closeReleaseNotesModal,
    setAutoCheck,
    setAutoDownload,
    setAllowPrerelease,
    setGithubToken,
    validateToken,
  }
}
