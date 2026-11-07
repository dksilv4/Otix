import { useState } from 'react'
import { useToast } from '@ui/molecules/toast'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useScanProgress } from './use-scan-progress'
import { formatScanError } from '@/lib/utils/scan-errors'
import { uploadNodeManifestInChunks, uploadScannedGamesManifest } from '@/lib/utils/manifest'
import { getBaseFolderName, type ScanPathItem } from '../utils/paths'
import { saveStoredScannedSummary, type ScannedFilesSummaryData } from '../utils/scanned-summary'

export const usePathsScan = ({
  remoteNodeId,
  scanPaths,
  gamesInstallPath,
  writeOtixAfterScan,
  downloadOtixImages,
  matching,
  loadSummary,
  setSummary,
  onScanComplete,
}: {
  remoteNodeId: number | null
  scanPaths: ScanPathItem[]
  gamesInstallPath: string
  writeOtixAfterScan: boolean
  downloadOtixImages: boolean
  matching: any
  loadSummary: () => Promise<void>
  setSummary: (summary: ScannedFilesSummaryData) => void
  onScanComplete?: () => void
}) => {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isScanning, setIsScanning] = useState(false)
  const scanProgress = useScanProgress()
  const [isClearingScan, setIsClearingScan] = useState(false)
  const [isSyncingOtix, setIsSyncingOtix] = useState(false)

  // ── Trigger Scan Handler ──
  const handleTriggerScan = async (targetPath?: string | unknown) => {
    const specificPath = typeof targetPath === 'string' ? targetPath : undefined
    setIsScanning(true)
    scanProgress.startScan(
      specificPath
        ? `Scanning ${getBaseFolderName(specificPath)}...`
        : remoteNodeId
          ? 'Connecting to node...'
          : 'Scanning library paths...',
    )
    try {
      if (remoteNodeId) {
        scanProgress.reportProgress(10, 'Starting library scan on node...', 'scanning')
        // Trigger scan start
        await apiClient.post<{ count?: number; status?: string }>(
          `/library/nodes/${remoteNodeId}/scan`,
          specificPath ? { path: specificPath } : undefined,
        )

        // Poll for real-time progress from node
        let scannedCount = 0
        for (let i = 0; i < 60; i++) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          try {
            const { data } = await apiClient.get<{
              phase?: string
              percentage?: number
              files_scanned?: number
              filesScanned?: number
              total_files?: number
              totalFiles?: number
              current_directory?: string
              currentDirectory?: string
              is_scanning?: boolean
              isScanning?: boolean
            }>(`/library/nodes/${remoteNodeId}/scan`)

            const count = data?.totalFiles || data?.total_files || data?.filesScanned || data?.files_scanned || 0
            if (count > 0) scannedCount = count
            const pct = typeof data?.percentage === 'number' ? Math.max(15, Math.min(95, data.percentage)) : 30
            const dir = data?.currentDirectory || data?.current_directory || `Indexing files (${count} found)...`

            const scanning = data?.isScanning ?? (data?.phase === 'scanning' || data?.phase === 'running')
            if (scanning) {
              scanProgress.reportProgress(pct, dir, 'scanning')
            } else if (data?.phase === 'completed' || data?.phase === 'idle' || data?.phase === 'complete') {
              break
            }
          } catch (pollErr: any) {
            const { isUnreachable } = formatScanError(pollErr)
            if (isUnreachable || (pollErr?.response?.status && pollErr.response.status >= 400)) {
              throw pollErr
            }
            break
          }
        }

        if (writeOtixAfterScan || specificPath) {
          setIsSyncingOtix(true)
          scanProgress.reportProgress(65, 'Writing .otix metadata sidecars...', 'matching')
          try {
            const { data } = await apiClient.post<{
              written?: number
              matched?: number
              status?: string
              reason?: string
            }>(`/library/nodes/${remoteNodeId}/otix/sync`, {
              writeOtix: true,
              downloadImages: downloadOtixImages,
              path: specificPath,
            })
            scanProgress.reportProgress(85, 'Writing .otix metadata sidecars...', 'matching')
            const written = data?.written ?? 0
            const matched = data?.matched ?? written
            scanProgress.finishScan(
              `Found ${scannedCount} files. Matched ${matched} game${matched === 1 ? '' : 's'}, wrote ${written} .otix sidecar${written === 1 ? '' : 's'}.`,
            )
            toast({
              title: 'Library scanned',
              description:
                data?.status === 'skipped'
                  ? `Scan finished. Found ${scannedCount} files. Sidecar write is disabled on this node.`
                  : `Indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'}. Matched ${matched} game${matched === 1 ? '' : 's'}, wrote ${written} .otix sidecar${written === 1 ? '' : 's'}.`,
              variant: 'success',
            })
          } catch (syncErr: any) {
            console.error('Otix sync failed:', syncErr)
            scanProgress.finishScan(
              `Found ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
            )
            toast({
              title: 'Scan Complete',
              description: `Indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node. Sidecar sync encountered an issue.`,
              variant: 'warning',
            })
          } finally {
            setIsSyncingOtix(false)
          }
        } else {
          scanProgress.finishScan(
            `Found ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
          )
          toast({
            title: 'Library Scanned',
            description: `Successfully indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
            variant: 'success',
          })
        }
        // Ingest latest node files into Match Review Center manifest
        try {
          const { data: serverFiles } = await apiClient.get<any[]>(`/library/nodes/${remoteNodeId}/files`)
          if (Array.isArray(serverFiles) && serverFiles.length > 0) {
            await uploadNodeManifestInChunks(remoteNodeId, serverFiles)
          }
        } catch {
          // non-fatal
        }
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.scanPaths) {
          const isIsoPath = specificPath && scanPaths.some((p) => p.path === specificPath && p.type === 'iso')
          const configuredGameDirs = scanPaths.filter((p) => p.type === 'game').map((p) => p.path)
          const allGameDirs = Array.from(
            new Set([
              ...configuredGameDirs,
              ...(gamesInstallPath ? [gamesInstallPath] : []),
            ]),
          )
          const gameDirs = specificPath
            ? isIsoPath
              ? []
              : [specificPath]
            : allGameDirs
          const isoDirs = specificPath
            ? isIsoPath
              ? [specificPath]
              : []
            : scanPaths.filter((p) => p.type === 'iso').map((p) => p.path)
          scanProgress.reportProgress(15, `Scanning ${specificPath ? getBaseFolderName(specificPath) : 'configured local directories'}...`, 'scanning')
          const clientToken = localStorage.getItem('otix-access-token') || localStorage.getItem('otix_access_token') || ''
          const scanned = clientToken
            ? await api.scanPaths(gameDirs, isoDirs, clientToken)
            : await api.scanPaths(gameDirs, isoDirs)
          const foundCount = Array.isArray(scanned) ? scanned.length : 0
          if (Array.isArray(scanned) && scanned.length > 0) {
            try {
              await uploadScannedGamesManifest(0, scanned)
            } catch {
              // non-fatal
            }
          }
          scanProgress.finishScan(
            specificPath
              ? `Scanned ${getBaseFolderName(specificPath)}: found ${foundCount} game${foundCount === 1 ? '' : 's'}`
              : `Local library scan complete: found ${foundCount} game${foundCount === 1 ? '' : 's'}`
          )
          toast({
            title: 'Library Scanned',
            description: specificPath
              ? `Completed scanning ${getBaseFolderName(specificPath)}: found ${foundCount} game${foundCount === 1 ? '' : 's'}.`
              : `Completed scanning library paths: found ${foundCount} game${foundCount === 1 ? '' : 's'}.`,
            variant: 'success',
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['local-games'] })
      queryClient.invalidateQueries({ queryKey: ['server-games'] })
      queryClient.invalidateQueries({ queryKey: ['node-games'] })
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
      window.dispatchEvent(new Event('scanned-games-updated'))
      onScanComplete?.()
      await loadSummary()
    } catch (err: any) {
      console.error('Library scan failed:', err)
      const { message, isUnreachable } = formatScanError(err)
      scanProgress.errorScan(isUnreachable ? 'Node unreachable' : 'Library scan failed')
      toast({
        title: 'Scan Failed',
        description: message,
        variant: 'error',
      })
      if (remoteNodeId || isUnreachable) {
        queryClient.invalidateQueries({ queryKey: ['game-servers'] })
        queryClient.invalidateQueries({ queryKey: ['library', 'servers'] })
      }
    } finally {
      setIsScanning(false)
      setIsSyncingOtix(false)
    }
  }

  // ── Clear Indexed Scan List ──
  const handleClearScannedList = async () => {
    setIsClearingScan(true)
    try {
      if (remoteNodeId) {
        await apiClient.post(`/library/nodes/${remoteNodeId}/scan/clear`)
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.resetGameData) {
          await api.resetGameData()
        }
      }
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
      queryClient.invalidateQueries({ queryKey: ['library', 'server-games'] })
      queryClient.invalidateQueries({ queryKey: ['local-games'] })
      onScanComplete?.()
      const emptySummary: ScannedFilesSummaryData = {
        totalCount: 0,
        organizedCount: 0,
        unorganizedCount: 0,
        matchedCount: 0,
        isoCount: 0,
        installedCount: 0,
        organizedPercentage: 0,
        lastScannedAt: new Date().toISOString(),
      }
      setSummary(emptySummary)
      saveStoredScannedSummary(emptySummary, remoteNodeId)
      window.dispatchEvent(new Event('scanned-games-updated'))
      toast({
        title: 'Scan list cleared',
        description: 'Indexed files were cleared. Files on disk were not deleted.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Clear scan list failed:', err)
      const { message, isUnreachable } = formatScanError(err)
      toast({
        title: 'Clear failed',
        description: message,
        variant: 'error',
      })
      if (remoteNodeId || isUnreachable) {
        queryClient.invalidateQueries({ queryKey: ['game-servers'] })
        queryClient.invalidateQueries({ queryKey: ['library', 'servers'] })
      }
    } finally {
      setIsClearingScan(false)
    }
  }

  // ── Run Catalog Matching ──
  const handleRunCatalogMatching = async () => {
    if (remoteNodeId) {
      setIsSyncingOtix(true)
      try {
        await apiClient.post(`/library/nodes/${remoteNodeId}/otix/sync`, {
          writeOtix: true,
          downloadImages: downloadOtixImages,
        })
        toast({
          title: 'Matching started',
          description: 'Catalog metadata sync initiated on node.',
          variant: 'success',
        })
      } catch (err: unknown) {
        toast({
          title: 'Matching failed',
          description: (err as { message?: string })?.message || 'Could not start matching on node.',
          variant: 'error',
        })
      } finally {
        setIsSyncingOtix(false)
      }
    } else {
      try {
        await matching.startMatching({ forceAll: false })
        toast({
          title: 'Matching started',
          description: 'Running catalog matching in the background…',
          variant: 'success',
        })
      } catch (err: unknown) {
        toast({
          title: 'Matching failed',
          description: (err as { message?: string })?.message || 'Could not start matching.',
          variant: 'error',
        })
      }
    }
  }

  return {
    isScanning,
    scanProgress,
    isClearingScan,
    isSyncingOtix,
    handleTriggerScan,
    handleClearScannedList,
    handleRunCatalogMatching,
  }
}
