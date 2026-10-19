import { useState, useEffect, useCallback, useRef } from 'react'
import { getDesktopAPI, isDesktop, type UpdateStatus, type UpdateProgress, type UpdateStatePayload } from '@/lib/desktop/api'
import type { AppUpdaterState } from '../types'

const FALLBACK_VERSION = '0.1.20'

export const useAppUpdater = (): AppUpdaterState => {
  const desktop = isDesktop()
  const [currentVersion, setCurrentVersion] = useState<string>(FALLBACK_VERSION)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDismissed, setIsDismissed] = useState<boolean>(false)

  const apiRef = useRef(getDesktopAPI()?.updater)

  useEffect(() => {
    const api = getDesktopAPI()?.updater
    apiRef.current = api
    if (!api) return

    // 1. Fetch current app version
    api.getVersion()
      .then((ver) => {
        if (ver) setCurrentVersion(ver)
      })
      .catch(() => {})

    // 2. Fetch current updater state
    api.getStatus()
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
    const unsubscribe = api.onStatusChanged((payload: UpdateStatePayload) => {
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
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissNotification,
  }
}
