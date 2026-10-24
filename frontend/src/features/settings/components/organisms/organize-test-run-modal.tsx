import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
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
  calculatePreviewMetrics,
  filterPreviewItems,
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
} from '../../utils/organize-test-run'

export type { PreviewItem }

export interface OrganizeTestRunModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
  availableScanPaths?: Array<{ path: string; type?: string }>
}

interface BeforeAfterCardProps {
  item: PreviewItem
  index: number
  rootDir?: string
}

const BeforeAfterCard = ({ item, index, rootDir }: BeforeAfterCardProps) => {
  const isFolder = isItemFolder(item)
  const badge = getStatusBadgeInfo(item.status)
  const healthBadge = getHealthBadgeInfo(item.health)
  const typeLabel = getItemTypeLabel(item)
  const isOrganized = item.status === 'already_organized'
  const sourceSubdir = getItemSourceSubdirectory(item, rootDir)
  const targetSubdir = getItemTargetSubdirectory(item, rootDir)
  const childSubdirs = getItemSubdirectories(item)

  return (
    <div
      key={`${item.sourceFilename}-${index}`}
      className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] border border-white/[0.04] hover:border-white/[0.08] transition-all duration-200 space-y-3"
    >
      {/* Header: Icon + Filename + Type Badge + Status Badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'p-2 rounded-xl shrink-0 transition-colors',
              isFolder ? 'bg-primary/15 text-primary' : 'bg-white/[0.04] text-foreground/80',
            )}
          >
            {isFolder ? <Folder size={14} /> : <File size={14} />}
          </div>
          <div className="min-w-0">
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate block">
              {item.sourceFilename}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
              {typeLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {healthBadge && (
            <span
              className={cn(
                'text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border border-white/[0.06]',
                healthBadge.className,
              )}
            >
              {healthBadge.label}
            </span>
          )}
          <span
            className={cn(
              'text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border border-white/[0.06]',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Archive Diagnostic (if anomalies) */}
      {item.anomalies && item.anomalies.length > 0 && (
        <div className="p-3 rounded-xl bg-[var(--dk-surface-raised)]/80 border border-white/[0.04] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Wrench size={13} className="shrink-0" />
            <span>Archive Integrity Diagnostic</span>
          </div>
          <div className="space-y-1 pl-4">
            {item.anomalies.map((msg, aIdx) => (
              <p key={aIdx} className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                • {msg}
              </p>
            ))}
          </div>
          {item.suggestedRenames && Object.keys(item.suggestedRenames).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-4">
              <span className="text-[10px] font-semibold text-muted-foreground">Fixes on move:</span>
              {Object.entries(item.suggestedRenames).map(([from, to]) => (
                <span
                  key={from}
                  className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-primary/10 text-primary border border-primary/20"
                >
                  {from} → {to}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unified BEFORE on Top & AFTER Under It in the Same Container with Different Colors */}
      <div className="rounded-xl overflow-hidden border border-white/[0.05] divide-y divide-white/[0.05] text-xs shadow-xs">
        {/* Top: BEFORE */}
        <div className="p-3 bg-[var(--dk-surface-field)]/60 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">BEFORE (Current)</span>
              {sourceSubdir && (
                <span className="inline-flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded-md bg-white/[0.04] text-foreground/80 font-normal truncate">
                  <FolderTree size={10} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Subdir:</span>
                  <span className="font-semibold text-foreground/90">{sourceSubdir}</span>
                </span>
              )}
            </div>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground shrink-0">
              {isFolder ? 'Folder' : 'File'}
            </span>
          </div>
          <p className="font-mono text-[11px] text-foreground/90 break-all leading-relaxed pl-0.5">
            {item.sourcePath}
          </p>
        </div>

        {/* Under: AFTER */}
        <div
          className={cn(
            'p-3 space-y-1.5 transition-colors',
            isOrganized ? 'bg-white/[0.02]' : 'bg-primary/[0.07]',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'flex items-center gap-1.5 shrink-0',
                  isOrganized ? 'text-muted-foreground' : 'text-primary',
                )}
              >
                <ArrowRight size={11} className="shrink-0" />
                <span>AFTER (Organized)</span>
                <span className="font-normal lowercase tracking-normal text-[10px] opacity-75">
                  — {isOrganized ? 'Organized into target' : 'Organizes into target location'}
                </span>
              </span>
              {targetSubdir && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded-md font-normal border truncate',
                    isOrganized
                      ? 'bg-white/[0.04] text-muted-foreground border-white/[0.04]'
                      : 'bg-primary/15 text-primary border-primary/20',
                  )}
                >
                  <FolderTree size={10} className="shrink-0 opacity-80" />
                  <span className="opacity-75">Target Subdir:</span>
                  <span className="font-semibold">{targetSubdir}</span>
                </span>
              )}
            </div>
            <span
              className={cn(
                'font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0',
                isOrganized
                  ? 'bg-white/[0.04] text-muted-foreground border-white/[0.04]'
                  : 'bg-primary/20 text-primary border-primary/30',
              )}
            >
              {isOrganized ? 'Unchanged' : 'Proposed'}
            </span>
          </div>
          <p
            className={cn(
              'font-mono text-[11px] font-semibold break-all leading-relaxed pl-0.5',
              isOrganized ? 'text-foreground/90' : 'text-primary',
            )}
          >
            {item.targetPath}
          </p>
        </div>
      </div>

      {/* Internal Subdirectories for Folder Packages */}
      {childSubdirs.length > 0 && (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <FolderTree size={11} className="text-muted-foreground shrink-0" />
            <span>Folder Package Subdirectories ({childSubdirs.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {childSubdirs.map((subdir) => (
              <span
                key={subdir}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.04] text-foreground/90 border border-white/[0.04]"
              >
                <Folder size={10} className="text-muted-foreground" />
                <span>{subdir}/</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Folders to Create (clean single row, if any) */}
      {item.foldersToCreate && item.foldersToCreate.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {item.foldersToCreate.map((folder, fIdx) => (
            <span
              key={`f-${fIdx}`}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-primary/15 text-primary border border-white/[0.04]"
            >
              <FolderPlus size={11} />
              <span>+ {folder}</span>
            </span>
          ))}
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
}: OrganizeTestRunModalProps) => {
  const [customPaths, setCustomPaths] = useState<string[]>(loadStoredCustomPaths)
  const [discoveredPaths, setDiscoveredPaths] = useState<Array<{ path: string; type?: string }>>([])
  const [scanError, setScanError] = useState<string | null>(null)

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

  const canExecute =
    actionableItems.length > 0 &&
    (Boolean(nodeId && nodeId > 0) || Boolean(getOrganizerApi()?.executeOrganization))

  const handleExecute = useCallback(async () => {
    if (actionableItems.length === 0) return
    setExecuting(true)
    const desktopApi = getOrganizerApi()
    try {
      if (nodeId && nodeId > 0) {
        const payload = {
          items: actionableItems.map((i) => ({
            sourcePath: i.sourcePath,
            targetPath: i.targetPath,
          })),
        }
        try {
          await apiClient.post(`/library/servers/${nodeId}/organize/execute`, payload)
          setExecutedCount(actionableItems.length)
          void fetchRealPreview(selectedFolder, true)
          return
        } catch (netErr) {
          if (!desktopApi?.executeOrganization) throw netErr
        }
      }

      if (desktopApi?.executeOrganization) {
        const payloadItems = actionableItems.map((i) => ({
          sourcePath: i.sourcePath,
          targetPath: i.targetPath,
        }))
        await desktopApi.executeOrganization(payloadItems)
        setExecutedCount(actionableItems.length)
        void fetchRealPreview(selectedFolder, true)
      }
    } catch {
      // Benign fallback
    } finally {
      setExecuting(false)
    }
  }, [nodeId, actionableItems, selectedFolder, fetchRealPreview])

  if (!open) return null

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Organize Test Run"
      description="Live dry-run preview comparing every real file and folder before and after organization rules are applied."
      className="max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
    >
      <div className="flex flex-col flex-1 min-h-0 space-y-3.5">
        {/* 1. Target Folder Dropdown Selector */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Target Folder</span>
            </div>
            {folderOptions.length > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {folderOptions.length} available folder{folderOptions.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
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
                className="text-xs h-9.5 px-3 cursor-pointer border border-white/[0.04] hover:bg-white/[0.04] shrink-0"
                title="Browse computer for other folder"
              >
                <FolderOpen size={13} className="mr-1.5" />
                Browse
              </DkButton>
            )}

            <DkButton
              size="sm"
              variant="primary"
              onClick={() => void fetchRealPreview(selectedFolder)}
              disabled={loading || !selectedFolder.trim()}
              className="text-xs h-9.5 px-3 cursor-pointer shrink-0"
              title="Scan target folder"
            >
              <RefreshCw size={12} className={cn('mr-1.5', loading && 'animate-spin')} />
              <span>Scan</span>
            </DkButton>
          </div>
        </div>

        {/* 2. Simplified Metrics Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-[var(--dk-surface-ghost)]/50 border border-white/[0.04]">
          <div className="p-2.5 rounded-xl bg-white/[0.015] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Scanned
            </p>
            <p className="text-base font-bold text-foreground mt-0.5">{metrics.total}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-center border border-white/[0.04]">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              To Organize
            </p>
            <p className="text-base font-bold text-primary mt-0.5">{metrics.actionable}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.015] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              In Subdirs
            </p>
            <p className="text-base font-bold text-foreground mt-0.5">
              {metrics.subdirectoriesCount}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.015] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Already Organized
            </p>
            <p className="text-base font-bold text-foreground mt-0.5">
              {metrics.alreadyOrganized}
            </p>
          </div>
        </div>

        {/* 3. Filter & Real-Time Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-0.5">
          {/* Pill Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto p-1 rounded-xl bg-[var(--dk-surface-ghost)]/60 border border-white/[0.04]">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
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
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
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
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
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
                'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                filterTab === 'organized'
                  ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              Organized ({metrics.alreadyOrganized})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files and folders..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[var(--dk-surface-field)]/60 border border-white/[0.06] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Success execution banner */}
        {executedCount !== null && (
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <CheckCircle2 size={15} className="shrink-0" />
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

        {/* 4. Scrollable Live Preview Stream */}
        <div className="flex-1 min-h-[280px] max-h-[50vh] overflow-y-auto pr-1 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs">
                Scanning target directory and computing organization paths...
              </span>
            </div>
          ) : scanError ? (
            <div className="p-8 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-destructive/20 space-y-3">
              <AlertCircle size={28} className="mx-auto text-destructive" />
              <p className="text-sm font-semibold text-foreground">
                Folder Scan Error
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {scanError}
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                {selectedFolder && (
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => void fetchRealPreview(selectedFolder)}
                    className="cursor-pointer"
                  >
                    <RefreshCw size={12} className="mr-1.5" />
                    Retry Scan
                  </DkButton>
                )}
                {getOrganizerApi()?.selectDirectory && (
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer border border-white/[0.04]"
                  >
                    <FolderOpen size={13} className="mr-1.5" />
                    Browse Different Folder
                  </DkButton>
                )}
              </div>
            </div>
          ) : !selectedFolder ? (
            <div className="p-8 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-3">
              <FolderOpen size={28} className="mx-auto text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Select or Browse a Folder to Test
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Pick a library folder from the dropdown above, or browse your computer to select any directory containing games, ROMs, or repacks.
              </p>
              {getOrganizerApi()?.selectDirectory && (
                <div className="pt-2 flex items-center justify-center">
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer"
                  >
                    <FolderOpen size={13} className="mr-1.5" />
                    Browse Folder
                  </DkButton>
                </div>
              )}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-3">
              <Info size={24} className="mx-auto text-muted-foreground" />
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
              <div className="pt-1 text-[11px] text-muted-foreground/80 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
                <span>Supported:</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">ISOs & ROMs</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">PC Game EXEs</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">Repack Bins & Archives</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">Console Packages</span>
              </div>
              {getOrganizerApi()?.selectDirectory && (
                <div className="pt-2 flex items-center justify-center">
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleBrowseFolder}
                    className="cursor-pointer border border-white/[0.04]"
                  >
                    <FolderOpen size={13} className="mr-1.5" />
                    Browse Another Folder
                  </DkButton>
                </div>
              )}
            </div>
          ) : (
            filteredList.map((item, idx) => (
              <BeforeAfterCard
                key={`${item.sourceFilename}-${idx}`}
                item={item}
                index={idx}
                rootDir={selectedFolder}
              />
            ))
          )}
        </div>

        {/* 5. Footer & Action Controls */}
        <div className="pt-3 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 size={14} className="text-primary shrink-0" />
            <span>
              {scanError
                ? 'Check folder path or choose a different folder to preview.'
                : !selectedFolder
                  ? 'Select or browse a target folder to preview organization rules.'
                  : filteredList.length === 0
                    ? 'No game files discovered in the selected folder.'
                    : `Read-only dry run on ${filteredList.length} item${filteredList.length === 1 ? '' : 's'}. No files on disk have been altered.`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {canExecute && (
              <DkButton
                size="sm"
                variant="primary"
                onClick={handleExecute}
                disabled={executing || loading}
                className="cursor-pointer"
              >
                {executing ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <Play size={13} className="mr-1.5" />
                )}
                <span>Execute ({actionableItems.length})</span>
              </DkButton>
            )}
            <DkButton size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
              Close
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}
