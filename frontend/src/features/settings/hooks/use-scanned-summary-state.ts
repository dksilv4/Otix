import { useState, useEffect, useCallback } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import {
  type ScannedFilesSummaryData,
  fetchDesktopScannedSummary,
  fetchNodeScannedSummary,
  loadStoredScannedSummary,
  saveStoredScannedSummary,
} from '../utils/scanned-summary'

export const useScannedSummaryState = (
  remoteNodeId: number | null,
  serverDownloadPath: string,
  gamesInstallPath: string,
) => {
  const [summary, setSummary] = useState<ScannedFilesSummaryData | null>(() => {
    return loadStoredScannedSummary(remoteNodeId)
  })
  const [isSummaryLoading, setIsSummaryLoading] = useState(false)

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true)
    try {
      if (remoteNodeId) {
        const data = await fetchNodeScannedSummary(remoteNodeId, serverDownloadPath, gamesInstallPath)
        if (data) {
          setSummary(data)
          saveStoredScannedSummary(data, remoteNodeId)
        }
      } else {
        const data = await fetchDesktopScannedSummary(gamesInstallPath, serverDownloadPath)
        setSummary(data)
        saveStoredScannedSummary(data, null)
      }
    } catch {
      // ignore
    } finally {
      setIsSummaryLoading(false)
    }
  }, [remoteNodeId, serverDownloadPath, gamesInstallPath])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    const handleUpdated = () => void loadSummary()
    window.addEventListener('scanned-games-updated', handleUpdated)
    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    const unsub = api?.onGamesUpdated?.(() => void loadSummary())
    const unsubDb = api?.onGamesDbChanged?.(() => void loadSummary())
    return () => {
      window.removeEventListener('scanned-games-updated', handleUpdated)
      unsub?.()
      unsubDb?.()
    }
  }, [loadSummary])

  return {
    summary,
    setSummary,
    isSummaryLoading,
    loadSummary,
  }
}
