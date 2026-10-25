import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Folder,
  FolderOpen,
  FolderTree,
  File,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Wrench,
  X,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import {
  type PreviewItem,
  type TestRunFilterTab,
  type DirectoryGroup,
  calculatePreviewMetrics,
  filterPreviewItems,
  groupPreviewItemsByDirectory,
  getStatusBadgeInfo,
  getHealthBadgeInfo,
  isItemFolder,
  isActionableItem,
  getItemTypeLabel,
  getItemSourceSubdirectory,
  getItemTargetSubdirectory,
  getItemSubdirectories,
  getOrganizerApi,
  loadStoredCustomPaths,
  saveStoredCustomPaths,
  buildFolderDropdownOptions,
  normalizePathSeparators,
} from '../../utils/organize-test-run'

export type { PreviewItem }

export interface OrganizeTestRunModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
  availableScanPaths?: Array<{ path: string; type?: string }>
  defaultDeleteEmptyFolders?: boolean
}

interface FileRowProps {
  item: PreviewItem
  rootDir?: string
}

const FileRow = ({ item, rootDir }: FileRowProps) => {
  const isFolder = isItemFolder(item)
  const badge = getStatusBadgeInfo(item.status)
  const healthBadge = getHealthBadgeInfo(item.health)
  const typeLabel = getItemTypeLabel(item)
  const isOrganized = item.status === 'already_organized'
  const sourceSubdir = getItemSourceSubdirectory(item, rootDir)
  const targetSubdir = getItemTargetSubdirectory(item, rootDir)
  const childSubdirs = getItemSubdirectories(item)

  const targetFilename = useMemo(() => {
    if (!item.targetPath) return item.sourceFilename
    const norm = normalizePathSeparators(item.targetPath)
    const last = norm.split('/').pop()
    return last || item.sourceFilename
  }, [item.targetPath, item.sourceFilename])

  const isRenamed =
    Boolean(targetFilename) &&
    targetFilename.toLowerCase() !== item.sourceFilename.toLowerCase()

  return (
    <div className="py-3 px-3 hover:bg-white/[0.015] transition-colors space-y-2">
      {/* Side-by-side comparison columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-start">
        {/* LEFT COLUMN: BEFORE (Current) */}
        <div className="space-y-1.5 min-w-0">
          {/* Header & File Type */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <span>BEFORE (Current)</span>
            </span>
            <span className="text-[9px] font-mono uppercase text-muted-foreground px-1.5 py-0.2 rounded bg-white/[0.04] shrink-0">
              {typeLabel}
            </span>
          </div>

          {/* Directory location (Breadcrumb) */}
          {sourceSubdir ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Folder size={12} className="text-muted-foreground/70 shrink-0" />
              <span className="text-[10px] text-muted-foreground/70 shrink-0">Subdir:</span>
              <span className="font-mono text-[11px] text-foreground/90 font-medium truncate">
                {sourceSubdir}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 min-w-0">
              <Folder size={12} className="shrink-0" />
              <span className="font-mono text-[11px] truncate">Root Folder</span>
            </div>
          )}

          {/* Current File */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-muted-foreground shrink-0">
              {isFolder ? <Folder size={13} className="text-primary" /> : <File size={13} />}
            </div>
            <span className="font-semibold text-xs text-foreground font-mono truncate" title={item.sourceFilename}>
              {item.sourceFilename}
            </span>
          </div>

          {/* Full Source Path (Detailed secondary line) */}
          <div className="pt-0.5">
            <p className="font-mono text-[10px] text-muted-foreground/70 break-all leading-tight">
              {item.sourcePath}
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: AFTER (Organized) */}
        <div className="space-y-1.5 min-w-0 md:border-l md:border-white/[0.04] md:pl-4">
          {/* Header & Status Badges */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider flex items-center gap-1',
                isOrganized ? 'text-muted-foreground' : 'text-primary',
              )}
            >
              <ArrowRight size={10} className="shrink-0" />
              <span>AFTER (Organized)</span>
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {healthBadge && (
                <span
                  className={cn(
                    'text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]',
                    healthBadge.className,
                  )}
                >
                  {healthBadge.label}
                </span>
              )}
              <span
                className={cn(
                  'text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]',
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
          </div>

          {/* Target Directory location (Breadcrumb) */}
          {targetSubdir ? (
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <Folder
                size={12}
                className={cn('shrink-0', isOrganized ? 'text-muted-foreground/70' : 'text-primary')}
              />
              <span className="text-[10px] text-muted-foreground/70 shrink-0">Target Subdir:</span>
              <span
                className={cn(
                  'font-mono text-[11px] font-semibold truncate',
                  isOrganized ? 'text-foreground/90' : 'text-primary',
                )}
              >
                {targetSubdir}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 min-w-0">
              <Folder size={12} className="shrink-0" />
              <span className="font-mono text-[11px] truncate">Root Folder</span>
            </div>
          )}

          {/* Target File (with rename highlighting if changed) */}
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('shrink-0', isOrganized ? 'text-muted-foreground' : 'text-primary')}>
              {isFolder ? <Folder size={13} /> : <File size={13} />}
            </div>
            <span
              className={cn(
                'font-semibold text-xs font-mono truncate',
                isOrganized ? 'text-foreground' : isRenamed ? 'text-primary font-bold' : 'text-foreground',
              )}
              title={targetFilename}
            >
              {isRenamed ? targetFilename : `→ ${targetFilename}`}
            </span>
            {isRenamed && (
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-primary/15 text-primary border border-primary/20 shrink-0">
                Renamed
              </span>
            )}
          </div>

          {/* Full Target Path & Explanation */}
          <div className="pt-0.5 space-y-1">
            <p
              className={cn(
                'font-mono text-[10px] break-all leading-tight',
                isOrganized ? 'text-muted-foreground/70' : 'text-primary/90 font-medium',
              )}
            >
              {item.targetPath}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/80">
              <span>— {isOrganized ? 'Organized into target' : 'Organizes into target location'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Package Subdirectories & Folders to Create (Clean inline strip) */}
      {(childSubdirs.length > 0 || (item.foldersToCreate && item.foldersToCreate.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.02] text-[9px]">
          {childSubdirs.length > 0 && (
            <div className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="font-bold uppercase tracking-wider">
                Folder Package Subdirectories ({childSubdirs.length}):
              </span>
              {childSubdirs.map((subdir) => (
                <span
                  key={subdir}
                  className="font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-foreground/80"
                >
                  {subdir}/
                </span>
              ))}
            </div>
          )}
          {item.foldersToCreate &&
            item.foldersToCreate.map((folder, fIdx) => (
              <span
                key={`f-${fIdx}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono font-medium bg-primary/10 text-primary"
              >
                <FolderPlus size={10} />
                <span>+ {folder}</span>
              </span>
            ))}
        </div>
      )}

      {/* Diagnostics / Anomalies (if any) */}
      {item.anomalies && item.anomalies.length > 0 && (
        <div className="mt-1 p-2 rounded-lg bg-[var(--dk-surface-raised)] border border-primary/20 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Wrench size={12} className="shrink-0" />
            <span>Archive Integrity Diagnostic</span>
          </div>
          <div className="space-y-0.5 pl-3">
            {item.anomalies.map((msg, aIdx) => (
              <p key={aIdx} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                • {msg}
              </p>
            ))}
          </div>
          {item.suggestedRenames && Object.keys(item.suggestedRenames).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pl-3">
              <span className="text-[9px] font-semibold text-muted-foreground">Fixes on move:</span>
              {Object.entries(item.suggestedRenames).map(([from, to]) => (
                <span
                  key={from}
                  className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-primary/10 text-primary border border-primary/20"
                >
                  {from} → {to}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface DirectorySectionProps {
  group: DirectoryGroup
  rootDir?: string
  forceExpanded?: boolean | null
}

const DirectorySection = ({
  group,
  rootDir,
  forceExpanded,
}: DirectorySectionProps) => {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (forceExpanded !== null && forceExpanded !== undefined) {
      setExpanded(forceExpanded)
    }
  }, [forceExpanded])

  const isChanged = group.sourceDir.toLowerCase() !== group.targetDir.toLowerCase()
  const hasActionable = group.items.some(isActionableItem)
  const isAllOrganized = group.items.every((i) => i.status === 'already_organized')

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] overflow-hidden transition-all duration-200">
      {/* Directory Section Header (Clean single bar) */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 sm:p-3.5 hover:bg-white/[0.02] cursor-pointer text-left transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Folder size={15} />
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-foreground font-mono truncate">
              {group.sourceDir}
            </span>
            {isChanged && (
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
                <ArrowRight size={12} className="text-primary shrink-0" />
                <span className="font-bold text-primary font-mono truncate">{group.targetDir}</span>
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground">
              {group.items.length} {group.items.length === 1 ? 'file' : 'files'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]',
              isAllOrganized
                ? 'bg-white/[0.04] text-muted-foreground'
                : hasActionable
                  ? 'bg-primary/15 text-primary border-primary/20'
                  : 'bg-white/[0.04] text-muted-foreground',
            )}
          >
            {isAllOrganized ? 'Already Organized' : hasActionable ? 'Organize Needed' : 'Unchanged'}
          </span>
          <span className="text-muted-foreground p-0.5 hover:text-foreground">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>
      </button>

      {/* Directory Section Content: Clean divided list of file rows */}
      {expanded && (
        <div className="border-t border-white/[0.04]">
          {/* Side-by-side column indicator */}
          <div className="hidden md:grid grid-cols-2 gap-4 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-white/[0.015] border-b border-white/[0.03]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Folder size={11} />
              <span>Current Source Location</span>
            </div>
            <div className="flex items-center gap-1.5 text-primary pl-4">
              <ArrowRight size={11} />
              <span>Target Organized Location</span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.03]">
            {group.items.map((item, idx) => (
              <FileRow
                key={`${item.sourceFilename}-${idx}`}
                item={item}
                rootDir={rootDir}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const OrganizeTestRunModal = ({
  open,
  onOpenChange,
  nodeId,
  template,
  isoDirectory,
  availableScanPaths = [],
  defaultDeleteEmptyFolders = true,
}: OrganizeTestRunModalProps) => {
  const [customPaths, setCustomPaths] = useState<string[]>(loadStoredCustomPaths)
  const [discoveredPaths, setDiscoveredPaths] = useState<Array<{ path: string; type?: string }>>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [deleteEmptyFolders, setDeleteEmptyFolders] = useState(defaultDeleteEmptyFolders)
  const [groupByDir, setGroupByDir] = useState(true)
  const [allExpanded, setAllExpanded] = useState<boolean | null>(true)

  // Dynamically discover configured desktop paths if none were passed
  useEffect(() => {
    if (!open) return
    const api = getOrganizerApi()
    if (!api) return

    let cancelled = false
    const collected: Array<{ path: string; type?: string }> = []

    if (api.getScanPaths) {
      api
        .getScanPaths()
        .then((paths: any) => {
          if (cancelled || !Array.isArray(paths)) return
          paths.forEach((p) => {
            if (p?.path) collected.push({ path: String(p.path).trim(), type: p.type || 'game' })
          })
          if (collected.length > 0) {
            setDiscoveredPaths((prev) => [...prev, ...collected])
          }
        })
        .catch(() => {})
    }

    if (api.getDesktopSettings) {
      api
        .getDesktopSettings()
        .then((ds: any) => {
          if (cancelled || !ds) return
          const settingsPaths: Array<{ path: string; type?: string }> = []
          if (ds.isoDownloadPath) settingsPaths.push({ path: ds.isoDownloadPath.trim(), type: 'ISO' })
          if (ds.gamesDownloadPath) settingsPaths.push({ path: ds.gamesDownloadPath.trim(), type: 'Downloads' })
          if (ds.gamesInstallPath) settingsPaths.push({ path: ds.gamesInstallPath.trim(), type: 'Library' })
          if (settingsPaths.length > 0) {
            setDiscoveredPaths((prev) => [...prev, ...settingsPaths])
          }
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [open])

  const mergedScanPaths = useMemo(() => {
    const map = new Map<string, string | undefined>()
    availableScanPaths.forEach((p) => map.set(p.path.toLowerCase(), p.type))
    discoveredPaths.forEach((p) => {
      if (!map.has(p.path.toLowerCase())) {
        map.set(p.path.toLowerCase(), p.type)
      }
    })
    return Array.from(map.entries()).map(([pathLower, type]) => {
      const orig =
        availableScanPaths.find((p) => p.path.toLowerCase() === pathLower)?.path ??
        discoveredPaths.find((p) => p.path.toLowerCase() === pathLower)?.path ??
        pathLower
      return { path: orig, type }
    })
  }, [availableScanPaths, discoveredPaths])

  const folderOptions = useMemo(() => {
    return buildFolderDropdownOptions(isoDirectory, mergedScanPaths, customPaths)
  }, [isoDirectory, mergedScanPaths, customPaths])

  const initialDir = isoDirectory || folderOptions[0]?.value || ''
  const [selectedFolder, setSelectedFolder] = useState<string>(initialDir)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executedCount, setExecutedCount] = useState<number | null>(null)
  const [items, setItems] = useState<PreviewItem[]>([])
  const [filterTab, setFilterTab] = useState<TestRunFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchRealPreview = useCallback(
    async (folderPath?: string, preserveExecuted = false) => {
      const folderToScan = (folderPath ?? selectedFolder).trim()
      if (!open || !folderToScan) return
      setLoading(true)
      setScanError(null)
      if (!preserveExecuted) {
        setExecutedCount(null)
      }

      try {
        let loadedItems: PreviewItem[] | null = null
        const desktopApi = getOrganizerApi()

        if (nodeId && nodeId > 0) {
          try {
            const res = await apiClient.post<PreviewItem[]>(
              `/library/servers/${nodeId}/organize/preview`,
              {
                directory: folderToScan,
                template,
              },
            )
            if (Array.isArray(res?.data)) {
              loadedItems = res.data
            }
          } catch (netErr: any) {
            // If the server proxy fails (e.g. 500 error from node daemon) and desktop organizer
            // is available in this client, seamlessly fall back to local desktop scanner
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
        const errorMsg =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.message ||
          `Unable to access or scan folder "${folderToScan}". Verify the directory exists and Otix has permissions to read it.`
        setScanError(errorMsg)
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [open, nodeId, selectedFolder, template],
  )

  // Automatically scan upon opening or when folder becomes available
  useEffect(() => {
    if (open) {
      const dir = selectedFolder || initialDir
      if (dir) {
        if (!selectedFolder) {
          setSelectedFolder(dir)
        }
        void fetchRealPreview(dir)
      }
    }
  }, [open, initialDir])

  // Automatically select first discovered folder if none was selected
  useEffect(() => {
    if (open && !selectedFolder && folderOptions.length > 0) {
      const first = folderOptions[0].value
      setSelectedFolder(first)
      void fetchRealPreview(first)
    }
  }, [open, selectedFolder, folderOptions, fetchRealPreview])

  const handleSelectFolder = useCallback(
    (path: string) => {
      setSelectedFolder(path)
      setScanError(null)
      void fetchRealPreview(path)
    },
    [fetchRealPreview],
  )

  const handleBrowseFolder = useCallback(async () => {
    const api = getOrganizerApi()
    if (api?.selectDirectory) {
      try {
        const picked = await api.selectDirectory()
        if (picked && typeof picked === 'string') {
          const trimmed = picked.trim()
          setCustomPaths((prev) => {
            const next = prev.includes(trimmed) ? prev : [...prev, trimmed]
            saveStoredCustomPaths(next)
            return next
          })
          setSelectedFolder(trimmed)
          setScanError(null)
          void fetchRealPreview(trimmed)
        }
      } catch {
        // user cancelled
      }
    }
  }, [fetchRealPreview])

  const filteredList = useMemo(
    () => filterPreviewItems(items, filterTab, searchQuery, selectedFolder),
    [items, filterTab, searchQuery, selectedFolder],
  )
  const metrics = useMemo(
    () => calculatePreviewMetrics(items, selectedFolder),
    [items, selectedFolder],
  )
  const actionableItems = useMemo(() => items.filter(isActionableItem), [items])

  const directoryGroups = useMemo(
    () => groupPreviewItemsByDirectory(filteredList, selectedFolder),
    [filteredList, selectedFolder],
  )

  const canExecute =
    actionableItems.length > 0 &&
    (Boolean(nodeId && nodeId > 0) || Boolean(getOrganizerApi()?.executeOrganization))

  const handleExecute = useCallback(async () => {
    if (actionableItems.length === 0) return
    setExecuting(true)
    setExecutionError(null)
    const desktopApi = getOrganizerApi()
    try {
      let succeededCount = 0
      let failedErrors: string[] = []

      if (nodeId && nodeId > 0) {
        const payload = {
          items: actionableItems.map((i) => ({
            sourcePath: i.sourcePath,
            targetPath: i.targetPath,
            source_path: i.sourcePath,
            target_path: i.targetPath,
          })),
          deleteEmptyFolders,
          delete_empty_folders: deleteEmptyFolders,
        }
        try {
          const res = await apiClient.post<any>(`/library/servers/${nodeId}/organize/execute`, payload)
          const results = res?.data?.results || res?.data
          if (Array.isArray(results)) {
            const successes = results.filter((r: any) => r.success !== false)
            succeededCount = successes.length
            const failures = results.filter((r: any) => r.success === false && r.error)
            if (failures.length > 0) {
              failedErrors = failures.map((f: any) => f.error)
            }
          } else {
            succeededCount = actionableItems.length
          }
        } catch (netErr: any) {
          if (!desktopApi?.executeOrganization) {
            const msg = netErr?.response?.data?.error || netErr?.message || 'Failed to execute organization movements.'
            setExecutionError(msg)
            return
          }
        }
      }

      if (succeededCount === 0 && desktopApi?.executeOrganization) {
        const payloadItems = actionableItems.map((i) => ({
          sourcePath: i.sourcePath,
          targetPath: i.targetPath,
          source_path: i.sourcePath,
          target_path: i.targetPath,
        }))
        const desktopResults = await desktopApi.executeOrganization(payloadItems, deleteEmptyFolders)
        if (Array.isArray(desktopResults)) {
          const successes = desktopResults.filter((r: any) => r.success)
          succeededCount = successes.length
          const failures = desktopResults.filter((r: any) => !r.success && r.error)
          if (failures.length > 0) {
            failedErrors = failures.map((f: any) => f.error)
          }
        } else {
          succeededCount = actionableItems.length
        }
      }

      if (failedErrors.length > 0 && succeededCount === 0) {
        setExecutionError(failedErrors[0])
      } else {
        setExecutedCount(succeededCount)
        void fetchRealPreview(selectedFolder, true)
      }
    } catch (err: any) {
      setExecutionError(err?.message || 'An unexpected error occurred while executing organization.')
    } finally {
      setExecuting(false)
    }
  }, [nodeId, actionableItems, selectedFolder, fetchRealPreview, deleteEmptyFolders])

  if (!open) return null

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Organize Test Run"
      description="Live dry-run preview comparing every real file and folder before and after organization rules are applied."
      className="max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
    >
      <div className="flex flex-col flex-1 min-h-0 space-y-3">
        {/* Unified Top Control Panel */}
        <div className="p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
          {/* Row 1: Target Folder Selection + Scan / Browse Actions */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-foreground pl-0.5">
              <Folder size={14} className="text-primary shrink-0" />
              <span>Target Folder</span>
              {folderOptions.length > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
                  ({folderOptions.length})
                </span>
              )}
            </div>

            <div className="flex-1 min-w-[200px]">
              <DkDropdown
                options={folderOptions}
                value={selectedFolder}
                onChange={handleSelectFolder}
                placeholder="Select target folder to test..."
                className="w-full font-mono text-xs"
              />
            </div>

            {getOrganizerApi()?.selectDirectory && (
              <DkButton
                size="sm"
                variant="ghost"
                onClick={handleBrowseFolder}
                className="text-xs h-8 px-2.5 cursor-pointer border border-white/[0.04] hover:bg-white/[0.04] shrink-0"
                title="Browse computer for other folder"
              >
                <FolderOpen size={12} className="mr-1" />
                Browse
              </DkButton>
            )}

            <DkButton
              size="sm"
              variant="primary"
              onClick={() => void fetchRealPreview(selectedFolder)}
              disabled={loading || !selectedFolder.trim()}
              className="text-xs h-8 px-3 cursor-pointer shrink-0"
              title="Scan target folder"
            >
              <RefreshCw size={11} className={cn('mr-1.5', loading && 'animate-spin')} />
              <span>Scan</span>
            </DkButton>
          </div>

          {/* Row 2: Stats Strip (Inline, borderless, clean) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1 pt-0.5 border-t border-white/[0.03]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Scanned
              </span>
              <span className="font-mono text-xs font-bold text-foreground">{metrics.total}</span>
            </div>
            <span className="text-white/[0.1] hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                To Organize
              </span>
              <span className="font-mono text-xs font-bold text-primary">{metrics.actionable}</span>
            </div>
            <span className="text-white/[0.1] hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                In Subdirs
              </span>
              <span className="font-mono text-xs font-bold text-foreground">{metrics.subdirectoriesCount}</span>
            </div>
            <span className="text-white/[0.1] hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Already Organized
              </span>
              <span className="font-mono text-xs font-bold text-foreground">{metrics.alreadyOrganized}</span>
            </div>
          </div>

          {/* Row 3: Filter Tabs + Search + Toolbar Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
            {/* Pill Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto p-0.5 rounded-xl bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                  filterTab === 'all'
                    ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                )}
              >
                All ({metrics.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('actionable')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                  filterTab === 'actionable'
                    ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                )}
              >
                To Move ({metrics.actionable})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('subdirectories')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                  filterTab === 'subdirectories'
                    ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                )}
              >
                In Subdirs ({metrics.subdirectoriesCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('organized')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                  filterTab === 'organized'
                    ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                )}
              >
                Organized ({metrics.alreadyOrganized})
              </button>
            </div>

            {/* Right Toolbar: Search + Expand/Collapse + Group Toggle */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {/* Search Box */}
              <div className="relative w-full sm:w-44">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files and folders..."
                  className="w-full pl-7 pr-6 py-1 text-xs rounded-lg bg-[var(--dk-surface-field)]/60 border border-white/[0.06] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Expand / Collapse All (Directory Mode) */}
              {groupByDir && directoryGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAllExpanded((prev) => (prev === true ? false : true))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-white/[0.04] bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all cursor-pointer whitespace-nowrap"
                  title="Expand or collapse all directories"
                >
                  <FolderTree size={12} />
                  <span className="hidden lg:inline">{allExpanded === false ? 'Expand All' : 'Collapse All'}</span>
                </button>
              )}

              {/* Group by Directory Toggle */}
              <button
                type="button"
                onClick={() => setGroupByDir((prev) => !prev)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                  groupByDir
                    ? 'bg-primary/15 text-primary border-primary/25 font-semibold'
                    : 'bg-white/[0.02] text-muted-foreground border-white/[0.04] hover:text-foreground hover:bg-white/[0.04]',
                )}
                title="Toggle grouping by parent directory"
              >
                <FolderTree size={12} />
                <span className="hidden md:inline">Group</span>
              </button>
            </div>
          </div>
        </div>

        {/* Success execution banner */}
        {executedCount !== null && (
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                Successfully organized {executedCount} game artifacts!
              </span>
            </div>
            <DkButton
              size="sm"
              variant="ghost"
              onClick={() => setExecutedCount(null)}
              className="text-xs h-6 px-2 text-primary hover:bg-primary/15"
            >
              Dismiss
            </DkButton>
          </div>
        )}

        {/* Execution error banner */}
        {executionError !== null && (
          <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/25 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
              <AlertCircle size={14} className="shrink-0" />
              <span>{executionError}</span>
            </div>
            <DkButton
              size="sm"
              variant="ghost"
              onClick={() => setExecutionError(null)}
              className="text-xs h-6 px-2 text-destructive hover:bg-destructive/20"
            >
              Dismiss
            </DkButton>
          </div>
        )}

        {/* 4. Scrollable Live Preview Stream (Clean directory sections) */}
        <div className="flex-1 min-h-[300px] overflow-y-auto pr-1 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs">
                Scanning target directory and computing organization paths...
              </span>
            </div>
          ) : scanError ? (
            <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-destructive/20 space-y-2.5">
              <AlertCircle size={26} className="mx-auto text-destructive" />
              <p className="text-sm font-semibold text-foreground">
                Folder Scan Error
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {scanError}
              </p>
              <div className="pt-1 flex items-center justify-center gap-2">
                {selectedFolder && (
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => void fetchRealPreview(selectedFolder)}
                    className="cursor-pointer h-8 text-xs"
                  >
                    <RefreshCw size={11} className="mr-1.5" />
                    Retry Scan
                  </DkButton>
                )}
                {getOrganizerApi()?.selectDirectory && (
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer h-8 text-xs border border-white/[0.04]"
                  >
                    <FolderOpen size={12} className="mr-1.5" />
                    Browse Different Folder
                  </DkButton>
                )}
              </div>
            </div>
          ) : !selectedFolder ? (
            <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
              <FolderOpen size={26} className="mx-auto text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Select or Browse a Folder to Test
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Pick a library folder from the dropdown above, or browse your computer to select any directory containing games, ROMs, or repacks.
              </p>
              {getOrganizerApi()?.selectDirectory && (
                <div className="pt-1 flex items-center justify-center">
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer h-8 text-xs"
                  >
                    <FolderOpen size={12} className="mr-1.5" />
                    Browse Folder
                  </DkButton>
                </div>
              )}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
              <Info size={22} className="mx-auto text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                {searchQuery
                  ? 'No matching files found for search query'
                  : 'No game files found in this folder'}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {searchQuery
                  ? `No items in ${selectedFolder} match "${searchQuery}".`
                  : `No game files, ISOs, ROMs, or packages were discovered in "${selectedFolder}". Select a different folder or browse computer.`}
              </p>
              <div className="pt-0.5 text-[10px] text-muted-foreground/80 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
                <span>Supported:</span>
                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">ISOs & ROMs</span>
                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">PC Game EXEs</span>
                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">Repack Bins & Archives</span>
                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04]">Console Packages</span>
              </div>
              {getOrganizerApi()?.selectDirectory && (
                <div className="pt-1 flex items-center justify-center">
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer h-8 text-xs border border-white/[0.04]"
                  >
                    <FolderOpen size={12} className="mr-1.5" />
                    Browse Another Folder
                  </DkButton>
                </div>
              )}
            </div>
          ) : groupByDir ? (
            /* Directory Sections: One single card per directory under target folder */
            directoryGroups.map((group) => (
              <DirectorySection
                key={group.id}
                group={group}
                rootDir={selectedFolder}
                forceExpanded={allExpanded}
              />
            ))
          ) : (
            /* Flat view: Single container of file rows */
            <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] overflow-hidden">
              <div className="hidden md:grid grid-cols-2 gap-4 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-white/[0.015] border-b border-white/[0.03]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Folder size={11} />
                  <span>Current Source Location</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary pl-4">
                  <ArrowRight size={11} />
                  <span>Target Organized Location</span>
                </div>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {filteredList.map((item, idx) => (
                  <FileRow
                    key={`${item.sourceFilename}-${idx}`}
                    item={item}
                    rootDir={selectedFolder}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Footer & Action Controls */}
        <div className="pt-2.5 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            <CheckCircle2 size={13} className="text-primary shrink-0" />
            <span className="truncate">
              {scanError
                ? 'Check folder path or choose a different folder to preview.'
                : !selectedFolder
                  ? 'Select or browse a target folder to preview organization rules.'
                  : filteredList.length === 0
                    ? 'No game files discovered in the selected folder.'
                    : `Read-only dry run on ${filteredList.length} item${filteredList.length === 1 ? '' : 's'} across ${directoryGroups.length} ${directoryGroups.length === 1 ? 'directory' : 'directories'}. No files on disk have been altered.`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {canExecute && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors mr-1">
                <input
                  type="checkbox"
                  checked={deleteEmptyFolders}
                  onChange={(e) => setDeleteEmptyFolders(e.target.checked)}
                  className="rounded border-white/[0.08] text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Delete empty folders</span>
              </label>
            )}
            {canExecute && (
              <DkButton
                size="sm"
                variant="primary"
                onClick={handleExecute}
                disabled={executing || loading}
                className="cursor-pointer h-8 text-xs"
              >
                {executing ? (
                  <Loader2 size={12} className="mr-1.5 animate-spin" />
                ) : (
                  <Play size={12} className="mr-1.5" />
                )}
                <span>Execute ({actionableItems.length})</span>
              </DkButton>
            )}
            <DkButton
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer h-8 text-xs"
            >
              Close
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}
