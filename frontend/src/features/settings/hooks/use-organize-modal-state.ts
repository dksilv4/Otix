import { useState, useCallback, useMemo, useEffect, useContext } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import {
  type PreviewItem,
  type TestRunFilterTab,
  calculatePreviewMetrics,
  filterPreviewItems,
  groupPreviewItemsByDirectory,
  isActionableItem,
  getOrganizerApi,
} from '../utils/organize-test-run'
import { useOrganizePaths } from './use-organize-paths'
import { useOrganizeExecution } from './use-organize-execution'

export interface UseOrganizeModalStateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
  availableScanPaths?: Array<{ path: string; type?: string }>
  defaultDeleteEmptyFolders?: boolean
}

export const useOrganizeModalState = ({
  open,
  onOpenChange,
  nodeId,
  template,
  isoDirectory,
  availableScanPaths = [],
  defaultDeleteEmptyFolders = true,
}: UseOrganizeModalStateProps) => {
  const queryClient = useContext(QueryClientContext)

  // Paths discovery & dropdown state
  const pathsState = useOrganizePaths({
    open,
    isoDirectory,
    availableScanPaths,
  })

  const [scanError, setScanError] = useState<string | null>(null)
  const [deleteEmptyFolders, setDeleteEmptyFolders] = useState(defaultDeleteEmptyFolders)
  const [groupByDir, setGroupByDir] = useState(true)
  const [allExpanded, setAllExpanded] = useState<boolean | null>(true)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PreviewItem[]>([])
  const [filterTab, setFilterTab] = useState<TestRunFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [matchReviewOpen, setMatchReviewOpen] = useState(false)

  const fetchRealPreview = useCallback(
    async (folderPath?: string, preserveExecuted = false) => {
      const folderToScan = (folderPath ?? pathsState.selectedFolder).trim()
      if (!open || !folderToScan) return
      setLoading(true)
      setScanError(null)

      try {
        let loadedItems: PreviewItem[] | null = null
        const desktopApi = getOrganizerApi()

        if (nodeId && nodeId > 0) {
          try {
            const res = await apiClient.post<PreviewItem[]>(
              `/library/nodes/${nodeId}/organize/preview`,
              {
                directory: folderToScan,
                template,
              },
              { timeout: 180_000 },
            )
            if (Array.isArray(res?.data)) {
              loadedItems = res.data
            }
          } catch (netErr: any) {
            // If the server proxy fails and desktop organizer is available, fall back to desktop
            if (desktopApi?.smartOrganizePreview) {
              const desktopItems = await desktopApi.smartOrganizePreview(folderToScan, template)
              if (Array.isArray(desktopItems)) {
                loadedItems = desktopItems as PreviewItem[]
              }
            } else {
              throw netErr
            }
          }
        } else if (desktopApi?.smartOrganizePreview) {
          const desktopItems = await desktopApi.smartOrganizePreview(folderToScan, template)
          if (Array.isArray(desktopItems)) {
            loadedItems = desktopItems as PreviewItem[]
          }
        }

        if (Array.isArray(loadedItems)) {
          setItems(loadedItems)
        } else if (desktopApi?.smartOrganizePreview) {
          const fallback = await desktopApi.smartOrganizePreview(folderToScan, template)
          setItems(Array.isArray(fallback) ? (fallback as PreviewItem[]) : [])
        } else {
          setScanError(
            'Desktop organizer engine is not available. Please ensure Otix Desktop is running or connect to an Otix node server.',
          )
          setItems([])
        }
      } catch (err: any) {
        let rawMessage =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.message ||
          ''
        if (typeof err?.response?.data === 'string') {
          try {
            const parsed = JSON.parse(err.response.data)
            rawMessage = parsed.error || parsed.detail || parsed.message || err.response.data
          } catch {
            rawMessage = err.response.data
          }
        }
        let cleanMessage = String(rawMessage)
          .replace(/Error invoking remote method '[^']+':\s*/gi, '')
          .replace(/^Error:\s*/gi, '')
          .trim()

        if (/UNKNOWN:\s*unknown error,\s*stat/i.test(cleanMessage) || /errno:\s*-4094/i.test(cleanMessage)) {
          const isNetwork = folderToScan.startsWith('\\\\') || folderToScan.startsWith('//')
          cleanMessage = isNetwork
            ? `Network share is offline or unreachable: ${folderToScan}. Check if the server is powered on and accessible on your network.`
            : `Folder path is inaccessible: ${folderToScan}. Verify that the path exists and is readable.`
        }

        const errorMsg =
          cleanMessage ||
          `Unable to access or scan folder "${folderToScan}". Verify the directory exists and Otix has permissions to read it.`
        setScanError(errorMsg)
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [open, nodeId, pathsState.selectedFolder, template],
  )

  // Automatically scan upon opening or when folder becomes available
  useEffect(() => {
    if (open) {
      const dir = pathsState.selectedFolder || pathsState.initialDir
      if (dir) {
        if (!pathsState.selectedFolder) {
          pathsState.setSelectedFolder(dir)
        }
        void fetchRealPreview(dir)
      }
    }
  }, [open, pathsState.initialDir])

  // Automatically select first discovered folder if none was selected
  useEffect(() => {
    if (open && !pathsState.selectedFolder && pathsState.folderOptions.length > 0) {
      const first = pathsState.folderOptions[0].value
      pathsState.setSelectedFolder(first)
      void fetchRealPreview(first)
    }
  }, [open, pathsState.selectedFolder, pathsState.folderOptions, fetchRealPreview])

  const handleSelectFolder = useCallback(
    (path: string) => {
      pathsState.setSelectedFolder(path)
      setScanError(null)
      void fetchRealPreview(path)
    },
    [fetchRealPreview, pathsState],
  )

  const handleBrowseFolder = useCallback(async () => {
    const api = getOrganizerApi()
    if (api?.selectDirectory) {
      try {
        const picked = await api.selectDirectory()
        if (picked && typeof picked === 'string') {
          const trimmed = picked.trim()
          pathsState.addCustomPath(trimmed)
          setScanError(null)
          void fetchRealPreview(trimmed)
        }
      } catch {
        // user cancelled
      }
    }
  }, [fetchRealPreview, pathsState])

  const filteredList = useMemo(
    () => filterPreviewItems(items, filterTab, searchQuery, pathsState.selectedFolder),
    [items, filterTab, searchQuery, pathsState.selectedFolder],
  )
  const metrics = useMemo(
    () => calculatePreviewMetrics(items, pathsState.selectedFolder),
    [items, pathsState.selectedFolder],
  )
  const actionableItems = useMemo(() => items.filter(isActionableItem), [items])
  const unmatchedItems = useMemo(
    () => items.filter((item) => !item.matched && item.status !== 'already_organized'),
    [items],
  )

  const directoryGroups = useMemo(
    () => groupPreviewItemsByDirectory(filteredList, pathsState.selectedFolder),
    [filteredList, pathsState.selectedFolder],
  )

  const canExecute =
    actionableItems.length > 0 &&
    (Boolean(nodeId && nodeId > 0) || Boolean(getOrganizerApi()?.executeOrganization))

  // Execution engine
  const execution = useOrganizeExecution({
    nodeId,
    actionableItems,
    selectedFolder: pathsState.selectedFolder,
    deleteEmptyFolders,
    fetchRealPreview,
    setItems,
    queryClient,
  })

  return {
    pathsState,
    scanError,
    deleteEmptyFolders,
    setDeleteEmptyFolders,
    groupByDir,
    setGroupByDir,
    allExpanded,
    setAllExpanded,
    loading,
    items,
    setItems,
    filterTab,
    setFilterTab,
    searchQuery,
    setSearchQuery,
    matchReviewOpen,
    setMatchReviewOpen,
    filteredList,
    metrics,
    actionableItems,
    unmatchedItems,
    directoryGroups,
    canExecute,
    handleSelectFolder,
    handleBrowseFolder,
    fetchRealPreview,
    execution,
  }
}
