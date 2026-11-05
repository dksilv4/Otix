import { useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { uploadScannedGamesManifest } from '@/lib/utils/manifest'
import { fetchIsoPaths } from '@/features/launcher/data/storage'
import { useScanProgress } from '@/features/settings/hooks/use-scan-progress'
import { useGameMatches } from '@/features/settings/hooks/use-node-paths'
import { useSettingsNode } from '@/features/settings/context/settings-node-context'
import { formatScanError } from '@/lib/utils/scan-errors'
import { localGameKeys } from '@/features/launcher/data/game-queries'

export interface LibraryScanSummary {
  totalCount: number
  matchedCount: number
  needsReviewCount: number
  unmatchedCount: number
  devicesCount: number
}

const SUMMARY_DISMISSED_KEY = 'otix:library-scan-banner-dismissed'

export const useLibraryScanner = () => {
  const queryClient = useQueryClient()
  const { servers = [] } = useSettingsNode()
  const scanProgressState = useScanProgress()
  const { data: matches = [], refetch: refetchMatches } = useGameMatches()

  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SUMMARY_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [isMatchCenterOpen, setIsMatchCenterOpen] = useState(false)
  const [lastScanFinishedAt, setLastScanFinishedAt] = useState<number | null>(null)

  const summary = useMemo<LibraryScanSummary>(() => {
    const list = Array.isArray(matches) ? matches : []
    const needsReview = list.filter((m) => m?.matchStatus === 'needs_review').length
    const unmatched = list.filter((m) => m?.matchStatus === 'unmatched').length
    const matched = list.filter((m) => m?.matchStatus === 'matched').length
    const devices = new Set<string>()
    devices.add('This PC')
    for (const m of list) {
      if ((m as any)?.serverName) devices.add((m as any).serverName)
    }
    for (const s of servers) {
      if (s?.name) devices.add(s.name)
    }

    return {
      totalCount: list.length,
      matchedCount: matched,
      needsReviewCount: needsReview,
      unmatchedCount: unmatched,
      devicesCount: devices.size,
    }
  }, [matches, servers])

  const dismissBanner = useCallback(() => {
    setIsBannerDismissed(true)
    try {
      sessionStorage.setItem(SUMMARY_DISMISSED_KEY, 'true')
    } catch {
      // ignore
    }
  }, [])

  const triggerScan = useCallback(async () => {
    setIsBannerDismissed(false)
    try {
      sessionStorage.removeItem(SUMMARY_DISMISSED_KEY)
    } catch {
      // ignore
    }

    scanProgressState.startScan('Scanning monitored game drives...')

    try {
      const desktop = hasDesktopAPI()
      if (desktop) {
        const api = getDesktopAPI()!
        const paths = await api.getScanPaths()
        const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
        const isoPaths = await fetchIsoPaths()
        const scanned = await api.scanPaths(gamePaths, isoPaths)
        if (scanned?.length) {
          try {
            await uploadScannedGamesManifest(0, scanned)
          } catch {
            // non-fatal
          }
        }
      }

      // Trigger scan on connected companion nodes/servers in parallel
      if (servers.length > 0) {
        await Promise.allSettled(
          servers.map(async (server) => {
            try {
              await apiClient.post(`/library/servers/${server.id}/scan`)
            } catch {
              // node might be offline
            }
          }),
        )
      }

      await refetchMatches()
      queryClient.invalidateQueries({ queryKey: localGameKeys.all })
      scanProgressState.finishScan('Library scan complete')
      setLastScanFinishedAt(Date.now())
    } catch (err) {
      const { message } = formatScanError(err)
      scanProgressState.errorScan(message)
    }
  }, [scanProgressState, servers, refetchMatches, queryClient])

  return {
    isScanning: scanProgressState.isScanning,
    scanProgress: scanProgressState.progress,
    scanPhase: scanProgressState.phase,
    scanMessage: scanProgressState.currentDir,
    summary,
    isBannerVisible:
      !isBannerDismissed &&
      (Boolean(lastScanFinishedAt) || summary.needsReviewCount > 0 || summary.unmatchedCount > 0),
    dismissBanner,
    triggerScan,
    isMatchCenterOpen,
    setIsMatchCenterOpen,
  }
}
