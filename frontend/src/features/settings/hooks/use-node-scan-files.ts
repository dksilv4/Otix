import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@ui/molecules/toast'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useSettingsNode } from '../context/settings-node-context'
import { isLocalDesktopNode, isLocalDesktopNodeId, LOCAL_DESKTOP_NODE_ID } from '../local-desktop-node'
import { useScanProgress } from './use-scan-progress'
import {
  fetchScannedGamesList,
  unlinkSourcePair,
} from '../utils/scanned-summary'
import {
  type ScanPathItem,
  type PathType,
  normalizePath,
  normalizeScanPathItems,
  getBaseFolderName,
} from '../utils/paths'
import {
  type NodeScanFilterTab,
  type NodeScanSortOption,
  computeNodeScanStats,
  filterAndSortScannedFiles,
  paginateScannedFiles,
  groupGamesAndUpdates,
} from '../utils/node-scan-files'
import { formatScanError } from '@/lib/utils/scan-errors'
import { uploadNodeManifestInChunks, uploadScannedGamesManifest } from '@/lib/utils/manifest'

export const NODE_SCANNED_FILES_QUERY_KEY = (nodeId?: number | string | null) =>
  ['node-scanned-files', nodeId ?? 'local'] as const

export const useNodeScanFiles = () => {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { servers, selectedNode, selectedNodeId, setSelectedNodeId, isLoading: isNodesLoading } =
    useSettingsNode()

  const desktop = isDesktop()
  const effectiveNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? null)

  const activeNode =
    servers?.find((s) => s.id === effectiveNodeId) ??
    (selectedNode?.id === effectiveNodeId ? selectedNode : null)

  const isLocalNode =
    desktop &&
    ((effectiveNodeId != null && isLocalDesktopNodeId(effectiveNodeId)) ||
      isLocalDesktopNode(activeNode) ||
      effectiveNodeId === LOCAL_DESKTOP_NODE_ID ||
      (desktop && servers.length <= 1))

  const remoteNodeId = !desktop
    ? effectiveNodeId === 0
      ? null
      : effectiveNodeId
    : isLocalNode
      ? null
      : effectiveNodeId

  // Scan Paths State
  const [scanPaths, setScanPaths] = useState<ScanPathItem[]>([])
  const [isLoadingPaths, setIsLoadingPaths] = useState(false)

  // Filter, Sort, Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<NodeScanFilterTab>('all')
  const [sortOption, setSortOption] = useState<NodeScanSortOption>('name-asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Scan execution state
  const [isScanning, setIsScanning] = useState(false)
  const scanProgress = useScanProgress()

  // ── 1. Load scan paths for active node ──
  const loadScanPaths = useCallback(async () => {
    setIsLoadingPaths(true)
    try {
      if (remoteNodeId) {
        try {
          const { data } = await apiClient.get(`/library/nodes/${remoteNodeId}/libraries`)
          const rows = Array.isArray(data) ? data : data?.libraries || []
          const items: ScanPathItem[] = rows
            .map((row: any) => ({
              path: String(row.path || '').trim(),
              type:
                row.kind === 'iso' || row.type === 'iso'
                  ? ('iso' as const)
                  : ('game' as const),
            }))
            .filter((row: ScanPathItem) => row.path)
          setScanPaths(items)
          try {
            localStorage.setItem(
              `otix:scan-paths:node:${remoteNodeId}`,
              JSON.stringify(items),
            )
          } catch {
            // ignore
          }
          return
        } catch (err) {
          console.warn('Failed to get scan paths from Otix node:', err)
        }
      }

      const api =
        getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
      if (api?.getScanPaths) {
        try {
          const raw = await api.getScanPaths()
          if (Array.isArray(raw) && raw.length > 0) {
            const items = normalizeScanPathItems(raw)
            setScanPaths(items)
            return
          }
        } catch {
          // ignore
        }
      }

      // Local storage fallback
      const key =
        remoteNodeId == null
          ? 'otix:scan-paths'
          : `otix:scan-paths:node:${remoteNodeId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        setScanPaths(normalizeScanPathItems(parsed))
      } else {
        setScanPaths([])
      }
    } finally {
      setIsLoadingPaths(false)
    }
  }, [remoteNodeId])

  useEffect(() => {
    void loadScanPaths()
  }, [loadScanPaths])

  // ── 2. Add / Remove Scan Paths ──
  const persistPaths = async (nextPaths: ScanPathItem[], targetId?: number | null) => {
    const normalized = normalizeScanPathItems(nextPaths)
    setScanPaths(normalized)

    const targetRemoteId = targetId !== undefined ? targetId : remoteNodeId

    if (targetRemoteId && targetRemoteId > 0 && !isLocalDesktopNodeId(targetRemoteId)) {
      try {
        localStorage.setItem(
          `otix:scan-paths:node:${targetRemoteId}`,
          JSON.stringify(normalized),
        )
      } catch {
        // ignore
      }
      try {
        await apiClient.put(`/library/nodes/${targetRemoteId}/libraries`, {
          libraries: normalized.map((item) => ({
            name: item.path.split(/[\\/]/).filter(Boolean).pop() || item.type,
            path: item.path,
            kind: item.type,
          })),
        })
      } catch (err) {
        console.warn('Failed to save libraries to node:', err)
      }
      return
    }

    const api =
      getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    if (api?.saveScanPaths) {
      try {
        await api.saveScanPaths(normalized)
      } catch {
        // ignore
      }
    }
    try {
      localStorage.setItem('otix:scan-paths', JSON.stringify(normalized.filter((p) => p.type === 'game').map((p) => p.path)))
      localStorage.setItem('otix:iso-scan-paths', JSON.stringify(normalized.filter((p) => p.type === 'iso').map((p) => p.path)))
    } catch {
      // ignore
    }
  }

  const addScanPath = async (
    pathToAdd: string,
    type: PathType = 'game',
    scanImmediately?: boolean,
    targetNodeId?: number | null,
  ) => {
    const trimmed = pathToAdd.trim()
    if (!trimmed) return
    const norm = normalizePath(trimmed)

    const chosenNodeId = targetNodeId !== undefined ? targetNodeId : (remoteNodeId ?? effectiveNodeId)
    const isTargetRemote = chosenNodeId != null && chosenNodeId > 0 && !isLocalDesktopNodeId(chosenNodeId)

    if (scanPaths.some((p) => normalizePath(p.path) === norm)) {
      toast({
        title: 'Folder Already Added',
        description: 'This directory is already in your monitored scan paths.',
        variant: 'default',
      })
      return
    }
    const next = [...scanPaths, { path: trimmed, type }]
    await persistPaths(next, isTargetRemote ? chosenNodeId : null)
    toast({
      title: 'Directory Added',
      description: `Added ${getBaseFolderName(trimmed)} to monitored paths.`,
      variant: 'success',
    })

    if (scanImmediately) {
      void triggerScan(trimmed)
    }
  }

  const removeScanPath = async (pathToRemove: string) => {
    const norm = normalizePath(pathToRemove)
    const next = scanPaths.filter((p) => normalizePath(p.path) !== norm)
    await persistPaths(next)
    toast({
      title: 'Directory Removed',
      description: `Removed ${getBaseFolderName(pathToRemove)} from monitored paths.`,
      variant: 'default',
    })
  }

  // ── 3. Query Scanned Files for Current Node ──
  const {
    data: allFiles = [],
    isLoading: isFilesLoading,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: NODE_SCANNED_FILES_QUERY_KEY(remoteNodeId ?? 'local'),
    queryFn: async () => {
      const items = await fetchScannedGamesList(remoteNodeId)
      return groupGamesAndUpdates(items)
    },
    staleTime: 30_000,
  })

  // Listen to external updates
  useEffect(() => {
    const handleUpdated = () => {
      void refetchFiles()
    }
    window.addEventListener('scanned-games-updated', handleUpdated)
    const api =
      getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    const unsub = api?.onGamesUpdated?.(() => void refetchFiles())
    const unsubDb = api?.onGamesDbChanged?.(() => void refetchFiles())
    return () => {
      window.removeEventListener('scanned-games-updated', handleUpdated)
      unsub?.()
      unsubDb?.()
    }
  }, [refetchFiles])

  // ── 4. Trigger Scan ──
  const triggerScan = async (specificPath?: string) => {
    setIsScanning(true)
    const initialLabel = specificPath
      ? `Scanning ${getBaseFolderName(specificPath)}...`
      : remoteNodeId
        ? `Connecting to ${activeNode?.name || 'node'}...`
        : 'Scanning library paths...'

    scanProgress.startScan(initialLabel)

    try {
      if (remoteNodeId) {
        scanProgress.reportProgress(10, 'Initiating scan on node...', 'scanning')
        await apiClient.post(`/library/nodes/${remoteNodeId}/scan`, specificPath ? { path: specificPath } : undefined)

        // Poll progress
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

            const count =
              data?.totalFiles ||
              data?.total_files ||
              data?.filesScanned ||
              data?.files_scanned ||
              0
            if (count > 0) scannedCount = count
            const pct =
              typeof data?.percentage === 'number'
                ? Math.max(15, Math.min(95, data.percentage))
                : 30
            const dir =
              data?.currentDirectory ||
              data?.current_directory ||
              `Indexing files (${count} found)...`

            const scanning =
              data?.isScanning ??
              (data?.phase === 'scanning' || data?.phase === 'running')
            if (scanning) {
              scanProgress.reportProgress(pct, dir, 'scanning')
            } else if (
              data?.phase === 'completed' ||
              data?.phase === 'idle' ||
              data?.phase === 'complete'
            ) {
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

        // Ingest node manifest if available
        try {
          const { data: serverFiles } = await apiClient.get<any[]>(`/library/nodes/${remoteNodeId}/files`)
          if (Array.isArray(serverFiles) && serverFiles.length > 0) {
            await uploadNodeManifestInChunks(remoteNodeId, serverFiles)
          }
        } catch {
          // non-fatal
        }

        scanProgress.finishScan(
          `Found ${scannedCount} files on ${activeNode?.name || 'node'}.`,
        )
        toast({
          title: 'Node Scan Complete',
          description: `Successfully indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'}.`,
          variant: 'success',
        })
      } else {
        const api =
          getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.scanPaths) {
          const isIsoPath = specificPath && scanPaths.some((p) => p.path === specificPath && p.type === 'iso')
          const gameDirs = specificPath
            ? isIsoPath ? [] : [specificPath]
            : scanPaths.filter((p) => p.type === 'game').map((p) => p.path)
          const isoDirs = specificPath
            ? isIsoPath ? [specificPath] : []
            : scanPaths.filter((p) => p.type === 'iso').map((p) => p.path)

          scanProgress.reportProgress(20, 'Scanning local paths...', 'scanning')
          const clientToken =
            localStorage.getItem('otix-access-token') ||
            localStorage.getItem('otix_access_token') ||
            ''
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
          scanProgress.finishScan(`Scanned local paths: found ${foundCount} file${foundCount === 1 ? '' : 's'}.`)
          toast({
            title: 'Scan Complete',
            description: `Found ${foundCount} game${foundCount === 1 ? '' : 's'} across configured directories.`,
            variant: 'success',
          })
        }
      }

      // Invalidate queries & refetch
      queryClient.invalidateQueries({ queryKey: NODE_SCANNED_FILES_QUERY_KEY(effectiveNodeId) })
      queryClient.invalidateQueries({ queryKey: ['local-games'] })
      queryClient.invalidateQueries({ queryKey: ['server-games'] })
      queryClient.invalidateQueries({ queryKey: ['node-games'] })
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
      window.dispatchEvent(new Event('scanned-games-updated'))
      await refetchFiles()
    } catch (err: any) {
      scanProgress.errorScan(err?.message || 'Scan encountered an issue.')
      toast({
        title: 'Scan Failed',
        description: err?.message || 'Could not complete scan on this node.',
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }

  // ── 5. Unlink Sources ──
  const unlinkSource = useCallback(
    (primaryId: string | number, sourceId: string | number) => {
      unlinkSourcePair(primaryId, sourceId)
      void queryClient.invalidateQueries({
        queryKey: NODE_SCANNED_FILES_QUERY_KEY(remoteNodeId ?? 'local'),
      })
      toast({
        title: 'Source Unlinked',
        description: 'The source file has been separated into its own row.',
        variant: 'success',
      })
    },
    [queryClient, remoteNodeId, toast],
  )

  // ── 6. Derived Stats & Filtered/Paginated Items ──
  const stats = useMemo(() => computeNodeScanStats(allFiles), [allFiles])

  const filteredAndSortedFiles = useMemo(
    () => filterAndSortScannedFiles(allFiles, filterTab, searchQuery, sortOption),
    [allFiles, filterTab, searchQuery, sortOption],
  )

  const pagination = useMemo(
    () => paginateScannedFiles(filteredAndSortedFiles, page, pageSize),
    [filteredAndSortedFiles, page, pageSize],
  )

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1)
  }, [filterTab, searchQuery, sortOption])

  return {
    servers,
    selectedNode,
    effectiveNodeId,
    remoteNodeId,
    activeNode,
    isLocalNode,
    isNodesLoading,
    setSelectedNodeId,

    // Scan paths
    scanPaths,
    isLoadingPaths,
    addScanPath,
    removeScanPath,

    // Scanning
    isScanning,
    scanProgress,
    triggerScan,

    // Files & Data
    allFiles,
    isFilesLoading,
    refetchFiles,
    stats,
    unlinkSource,

    // Filtering, Sorting, Pagination
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    sortOption,
    setSortOption,
    page,
    setPage,
    pageSize,
    setPageSize,
    filteredCount: filteredAndSortedFiles.length,
    pagedFiles: pagination.pagedItems,
    totalPages: pagination.totalPages,
    startIndex: pagination.startIndex,
    endIndex: pagination.endIndex,
  }
}
