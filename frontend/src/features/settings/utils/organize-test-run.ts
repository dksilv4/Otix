import { SAMPLE_RELEASES, formatTemplateSample } from './naming-template'
import { getDesktopAPI } from '@/lib/desktop/api'

export const getOrganizerApi = () =>
  getDesktopAPI() ??
  (typeof window !== 'undefined'
    ? ((window as any).desktopAPI ?? (window as any).electronAPI)
    : null)

export interface PreviewItem {
  sourcePath: string
  sourceFilename: string
  type: string
  matched: boolean
  extracted: Record<string, string>
  targetPath: string
  foldersToCreate: string[]
  status:
    | 'rename_and_move'
    | 'already_organized'
    | 'conflict'
    | 'sample'
    | 'secondary_update'
    | 'secondary_dlc'
    | 'secondary_crack'
    | 'secondary_archive_part'
    | 'secondary_archive'
    | 'container_package'
    | string
  anomalies?: string[]
  suggestedRenames?: Record<string, string>
  health?: 'HEALTHY' | 'CORRECTABLE_ANOMALY' | 'INCOMPLETE_DOWNLOAD' | 'GENERIC' | string
  isFolder?: boolean
  sourceSubdirectory?: string
  targetSubdirectory?: string
  subdirectories?: string[]
}

export type TestRunFilterTab = 'all' | 'actionable' | 'organized' | 'packages' | 'subdirectories'

export interface OrganizeProgress {
  total: number
  current: number
  percent: number
  currentName: string
  succeeded: number
  failed: number
}

export const chunkArray = <T,>(array: T[], size: number): T[][] => {
  if (!array || array.length === 0 || size <= 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export interface PreviewMetrics {
  total: number
  matched: number
  conflicts: number
  packages: number
  alreadyOrganized: number
  actionable: number
  files: number
  healable: number
  foldersCount: number
  subdirectoriesCount: number
}

export const normalizePathSeparators = (pathStr: string): string => {
  return (pathStr || '').replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

export const extractSourceSubdirectory = (sourcePath: string, rootDir?: string): string | null => {
  if (!sourcePath) return null
  const normSource = normalizePathSeparators(sourcePath)
  const normDir = rootDir ? normalizePathSeparators(rootDir) : ''

  if (normDir && normSource.toLowerCase().startsWith(normDir.toLowerCase())) {
    const rel = normSource.slice(normDir.length).replace(/^\/+/, '')
    const segments = rel.split('/')
    if (segments.length > 1) {
      return segments.slice(0, -1).join(' / ')
    }
    return null
  }

  // Fallback: examine parent path segments
  const segments = normSource.split('/')
  if (segments.length > 2) {
    const parentDirs = segments.slice(-3, -1).filter((s) => !s.endsWith(':'))
    if (parentDirs.length > 0) {
      return parentDirs.join(' / ')
    }
  } else if (segments.length === 2 && !segments[0].endsWith(':')) {
    return segments[0]
  }

  return null
}

export const extractTargetSubdirectory = (
  targetPath: string,
  foldersToCreate?: string[],
  rootDir?: string,
): string | null => {
  if (foldersToCreate && foldersToCreate.length > 0) {
    return foldersToCreate[0].replace(/[\\/]+/g, ' / ')
  }

  if (!targetPath) return null
  const normTarget = normalizePathSeparators(targetPath)
  const normDir = rootDir ? normalizePathSeparators(rootDir) : ''

  if (normDir && normTarget.toLowerCase().startsWith(normDir.toLowerCase())) {
    const rel = normTarget.slice(normDir.length).replace(/^\/+/, '')
    const segments = rel.split('/')
    if (segments.length > 1) {
      return segments.slice(0, -1).join(' / ')
    }
    return null
  }

  const segments = normTarget.split('/')
  if (segments.length > 2) {
    const parentDirs = segments.slice(-3, -1).filter((s) => !s.endsWith(':'))
    if (parentDirs.length > 0) {
      return parentDirs.join(' / ')
    }
  }

  return null
}

export const getItemSourceSubdirectory = (item: PreviewItem, rootDir?: string): string | null => {
  if (item.sourceSubdirectory) {
    return item.sourceSubdirectory.replace(/[\\/]+/g, ' / ')
  }
  return extractSourceSubdirectory(item.sourcePath, rootDir)
}

export const getItemTargetSubdirectory = (item: PreviewItem, rootDir?: string): string | null => {
  if (item.targetSubdirectory) {
    return item.targetSubdirectory.replace(/[\\/]+/g, ' / ')
  }
  return extractTargetSubdirectory(item.targetPath, item.foldersToCreate, rootDir)
}

export const getItemSubdirectories = (item: PreviewItem): string[] => {
  return item.subdirectories ?? []
}

export const hasSubdirectory = (item: PreviewItem, rootDir?: string): boolean => {
  return Boolean(
    getItemSourceSubdirectory(item, rootDir) ||
      getItemTargetSubdirectory(item, rootDir) ||
      (item.subdirectories && item.subdirectories.length > 0),
  )
}

export const isItemFolder = (item: PreviewItem): boolean => {
  return (
    Boolean(item.isFolder) ||
    item.type === 'container_package' ||
    item.type === 'folder_package' ||
    item.type === 'pc_game' ||
    item.type === 'folder'
  )
}

export const isActionableItem = (item: PreviewItem): boolean => {
  if (item.matched !== true) {
    return false
  }
  return (
    item.status === 'rename_and_move' ||
    item.status === 'container_package' ||
    item.status === 'secondary_update' ||
    item.status === 'secondary_dlc' ||
    item.status === 'secondary_crack' ||
    item.status === 'secondary_archive_part' ||
    item.status === 'secondary_archive'
  )
}

export const generateSamplePreviewItems = (
  directory: string,
  template: string,
): PreviewItem[] => {
  const base = directory.trim() || 'D:\\Games\\Library'
  const cleanBase = base.replace(/[\\/]+$/, '')
  const sep = cleanBase.includes('/') ? '/' : '\\'

  return SAMPLE_RELEASES.map((sample) => {
    const formatted = formatTemplateSample(template, sample)
    const targetPath = `${cleanBase}${sep}${formatted.replace(/[\\/]+/g, sep)}`
    const subFolder =
      sample.category === 'update'
        ? `Downloads${sep}Updates`
        : sample.category === 'dlc'
          ? `Downloads${sep}DLC`
          : sample.category === 'rom'
            ? `ROMs${sep}${sample.platform}`
            : 'Downloads'

    const extPart = sample.ext ? `.${sample.ext}` : ''
    const sourcePath = `${cleanBase}${sep}${subFolder}${sep}${sample.originalName}${extPart}`

    const parts = formatted.split(/[\\/]/)
    const folderParts = parts.slice(0, -1)
    const foldersToCreate = folderParts.length > 0 ? [folderParts.join(sep)] : []

    let status: PreviewItem['status'] = 'sample'
    if (sample.isPackage) status = 'container_package'
    else if (sample.category === 'update') status = 'secondary_update'
    else if (sample.category === 'dlc') status = 'secondary_dlc'

    let anomalies: string[] | undefined
    let suggestedRenames: Record<string, string> | undefined
    let health: string | undefined

    if (sample.isPackage && sample.originalName.toLowerCase().includes('baldurs')) {
      anomalies = [
        "Missing 'elamigos-' prefix: data-2.bin (installer expects elamigos-2.bin)",
        'Duplicate name collision: elamigos-1 (1).bin',
      ]
      suggestedRenames = {
        'data-2.bin': 'elamigos-2.bin',
        'elamigos-1 (1).bin': 'elamigos-1.bin',
      }
      health = 'CORRECTABLE_ANOMALY'
    }

    const sampleSubdirs = sample.isPackage ? ['Crack', 'Support', '_CommonRedist'] : undefined
    const sourceSubdirectory = subFolder.replace(/[\\/]+/g, '/')
    const targetSubdirectory =
      foldersToCreate.length > 0 ? foldersToCreate[0].replace(/[\\/]+/g, '/') : undefined

    return {
      sourcePath,
      sourceFilename: `${sample.originalName}${extPart}`,
      type: sample.category || 'iso',
      matched: true,
      extracted: {
        Title: sample.title,
        Year: sample.year,
        Platform: sample.platform,
        ReleaseGroup: sample.group,
        Edition: sample.edition,
        Version: sample.version,
        Region: sample.region || '',
        TitleId: sample.titleId || '',
      },
      targetPath,
      foldersToCreate,
      status,
      anomalies,
      suggestedRenames,
      health,
      isFolder: Boolean(sample.isPackage),
      sourceSubdirectory,
      targetSubdirectory,
      subdirectories: sampleSubdirs,
    }
  })
}

export const calculatePreviewMetrics = (
  items: PreviewItem[],
  rootDir?: string,
): PreviewMetrics => {
  const total = items.length
  const matched = items.filter((i) => i.matched).length
  const conflicts = items.filter((i) => i.status === 'conflict').length
  const packages = items.filter((i) => isItemFolder(i)).length
  const alreadyOrganized = items.filter((i) => i.status === 'already_organized').length
  const actionable = items.filter((i) => isActionableItem(i)).length
  const files = items.filter((i) => !isItemFolder(i)).length
  const healable = items.filter(
    (i) =>
      i.health === 'CORRECTABLE_ANOMALY' ||
      (i.suggestedRenames && Object.keys(i.suggestedRenames).length > 0),
  ).length
  const folderSet = new Set<string>()
  items.forEach((i) => {
    i.foldersToCreate?.forEach((f) => folderSet.add(f))
  })
  const subdirectoriesCount = items.filter((i) => hasSubdirectory(i, rootDir)).length
  return {
    total,
    matched,
    conflicts,
    packages,
    alreadyOrganized,
    actionable,
    files,
    healable,
    foldersCount: folderSet.size,
    subdirectoriesCount,
  }
}

export const filterPreviewItems = (
  items: PreviewItem[],
  filterTab: TestRunFilterTab,
  searchQuery: string,
  rootDir?: string,
): PreviewItem[] => {
  const query = searchQuery.trim().toLowerCase()

  return items.filter((item) => {
    if (filterTab === 'actionable' && !isActionableItem(item)) {
      return false
    }
    if (filterTab === 'organized' && item.status !== 'already_organized') {
      return false
    }
    if (filterTab === 'packages' && !isItemFolder(item)) {
      return false
    }
    if (filterTab === 'subdirectories' && !hasSubdirectory(item, rootDir)) {
      return false
    }

    if (query) {
      const matchName = item.sourceFilename.toLowerCase().includes(query)
      const matchSource = item.sourcePath.toLowerCase().includes(query)
      const matchTarget = item.targetPath.toLowerCase().includes(query)
      const matchSourceSubdir = (item.sourceSubdirectory || '').toLowerCase().includes(query)
      const matchTargetSubdir = (item.targetSubdirectory || '').toLowerCase().includes(query)
      const matchChildSubdirs = (item.subdirectories || []).some((s) =>
        s.toLowerCase().includes(query),
      )
      if (
        !matchName &&
        !matchSource &&
        !matchTarget &&
        !matchSourceSubdir &&
        !matchTargetSubdir &&
        !matchChildSubdirs
      ) {
        return false
      }
    }

    return true
  })
}

export const getStatusBadgeInfo = (status: PreviewItem['status']) => {
  switch (status) {
    case 'container_package':
      return { label: 'Folder Package', className: 'text-primary bg-primary/10 border-primary/20' }
    case 'secondary_update':
      return {
        label: 'Update',
        className: 'text-foreground/90 bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]',
      }
    case 'secondary_dlc':
      return {
        label: 'DLC',
        className: 'text-foreground/90 bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]',
      }
    case 'secondary_crack':
      return { label: 'Crack Supplement', className: 'text-primary bg-primary/15 border-primary/25' }
    case 'secondary_archive_part':
    case 'secondary_archive':
      return {
        label: 'Archive Part',
        className: 'text-foreground/90 bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]',
      }
    case 'already_organized':
      return {
        label: 'Organized (No Change)',
        className:
          'text-muted-foreground bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]',
      }
    case 'conflict':
      return {
        label: 'Collision',
        className: 'text-destructive bg-destructive/10 border-destructive/20',
      }
    case 'sample':
      return {
        label: 'Reference Sample',
        className:
          'text-muted-foreground bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]',
      }
    case 'rename_and_move':
    default:
      return { label: 'Move & Rename', className: 'text-primary bg-primary/15 border-primary/25' }
  }
}

export const getItemTypeLabel = (item: PreviewItem): string => {
  if (isItemFolder(item)) return 'Folder Package'
  switch (item.type) {
    case 'iso':
      return 'Game ISO'
    case 'rom':
      return 'Console ROM'
    case 'update':
      return 'Game Update'
    case 'dlc':
      return 'DLC Expansion'
    case 'crack':
      return 'Crack Supplement'
    case 'archive':
    case 'archive_part':
      return 'Archive'
    default:
      return 'File'
  }
}

export const getHealthBadgeInfo = (health?: string) => {
  switch (health) {
    case 'CORRECTABLE_ANOMALY':
      return { label: 'Auto-Healable', className: 'text-primary bg-primary/15 border-primary/25' }
    case 'INCOMPLETE_DOWNLOAD':
      return {
        label: 'Incomplete Part',
        className: 'text-destructive bg-destructive/10 border-destructive/20',
      }
    case 'HEALTHY':
      return {
        label: 'Healthy Archive',
        className:
          'text-foreground/80 bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]',
      }
    default:
      return null
  }
}

export const CUSTOM_ORGANIZE_PATHS_KEY = 'otix:custom-organize-paths'

export const loadStoredCustomPaths = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_ORGANIZE_PATHS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
      : []
  } catch {
    return []
  }
}

export const saveStoredCustomPaths = (paths: string[]): void => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_ORGANIZE_PATHS_KEY, JSON.stringify(paths))
  } catch {
    // ignore
  }
}

export const buildFolderDropdownOptions = (
  isoDirectory: string,
  availableScanPaths: Array<{ path: string; type?: string }> = [],
  customPaths: string[] = [],
): Array<{ value: string; label: string }> => {
  const set = new Set<string>()
  const opts: Array<{ value: string; label: string }> = []

  const addOption = (pathStr: string, labelSuffix?: string) => {
    const trimmed = (pathStr || '').trim()
    if (!trimmed || set.has(trimmed.toLowerCase())) return
    set.add(trimmed.toLowerCase())
    opts.push({
      value: trimmed,
      label: labelSuffix ? `${trimmed} (${labelSuffix})` : trimmed,
    })
  }

  if (isoDirectory) {
    addOption(isoDirectory, 'Target')
  }

  availableScanPaths.forEach((p) => {
    addOption(p.path, p.type)
  })

  customPaths.forEach((cp) => {
    addOption(cp, 'Custom')
  })

  return opts
}

export interface DirectoryGroup {
  id: string
  sourceDir: string
  targetDir: string
  items: PreviewItem[]
}

export const groupPreviewItemsByDirectory = (
  items: PreviewItem[],
  rootDir?: string,
): DirectoryGroup[] => {
  const groupMap = new Map<string, { sourceDir: string; targetDir: string; items: PreviewItem[] }>()
  const normRoot = rootDir ? normalizePathSeparators(rootDir).toLowerCase() : ''

  items.forEach((item) => {
    let sourceParent = ''
    let targetParent = ''

    // 1. Determine source parent folder relative to rootDir
    const normSource = normalizePathSeparators(item.sourcePath)
    if (normRoot && normSource.toLowerCase().startsWith(normRoot)) {
      const rel = normSource.slice(normRoot.length).replace(/^\/+/, '')
      const segments = rel.split('/').filter(Boolean)
      if (segments.length > 1) {
        sourceParent = segments[0]
      } else if (segments.length === 1) {
        sourceParent = isItemFolder(item) ? segments[0] : 'Root'
      }
    }

    if (!sourceParent && item.sourceSubdirectory) {
      const segs = item.sourceSubdirectory.replace(/[\\/]+/g, '/').split('/').filter(Boolean)
      sourceParent = segs[0] || ''
    }

    if (!sourceParent) {
      const segs = normSource.split('/').filter(Boolean)
      if (segs.length > 2) {
        sourceParent = segs[segs.length - 2]
      } else {
        sourceParent = 'Root'
      }
    }

    // 2. Determine target parent folder
    const normTarget = normalizePathSeparators(item.targetPath)
    if (normRoot && normTarget.toLowerCase().startsWith(normRoot)) {
      const rel = normTarget.slice(normRoot.length).replace(/^\/+/, '')
      const segments = rel.split('/').filter(Boolean)
      if (segments.length > 1) {
        targetParent = segments[0]
      } else if (segments.length === 1) {
        targetParent = isItemFolder(item) ? segments[0] : 'Root'
      }
    }

    if (!targetParent && item.foldersToCreate && item.foldersToCreate.length > 0) {
      const segs = item.foldersToCreate[0].replace(/[\\/]+/g, '/').split('/').filter(Boolean)
      targetParent = segs[0] || ''
    }

    if (!targetParent && item.targetSubdirectory) {
      const segs = item.targetSubdirectory.replace(/[\\/]+/g, '/').split('/').filter(Boolean)
      targetParent = segs[0] || ''
    }

    if (!targetParent) {
      const segs = normTarget.split('/').filter(Boolean)
      if (segs.length > 2) {
        targetParent = segs[segs.length - 2]
      } else {
        targetParent = sourceParent
      }
    }

    const key = sourceParent.toLowerCase()
    const existing = groupMap.get(key)
    if (existing) {
      existing.items.push(item)
      if (
        (!existing.targetDir || existing.targetDir.toLowerCase() === existing.sourceDir.toLowerCase()) &&
        targetParent &&
        targetParent.toLowerCase() !== sourceParent.toLowerCase()
      ) {
        existing.targetDir = targetParent
      }
    } else {
      groupMap.set(key, {
        sourceDir: sourceParent,
        targetDir: targetParent || sourceParent,
        items: [item],
      })
    }
  })

  return Array.from(groupMap.values()).map((g) => ({
    id: g.sourceDir,
    sourceDir: g.sourceDir,
    targetDir: g.targetDir,
    items: g.items,
  }))
}

