import { SAMPLE_RELEASES, formatTemplateSample } from './naming-template'

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
    | 'container_package'
  anomalies?: string[]
  suggestedRenames?: Record<string, string>
  health?: 'HEALTHY' | 'CORRECTABLE_ANOMALY' | 'INCOMPLETE_DOWNLOAD' | 'GENERIC' | string
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
    const subFolder = sample.category === 'update'
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
    }
  })
}

export const calculatePreviewMetrics = (items: PreviewItem[]) => {
  const total = items.length
  const matched = items.filter((i) => i.matched).length
  const conflicts = items.filter((i) => i.status === 'conflict').length
  const packages = items.filter((i) => i.status === 'container_package').length
  const healable = items.filter(
    (i) =>
      i.health === 'CORRECTABLE_ANOMALY' ||
      (i.suggestedRenames && Object.keys(i.suggestedRenames).length > 0),
  ).length
  const folderSet = new Set<string>()
  items.forEach((i) => {
    i.foldersToCreate?.forEach((f) => folderSet.add(f))
  })
  return {
    total,
    matched,
    conflicts,
    packages,
    healable,
    foldersCount: folderSet.size,
  }
}

export const getStatusBadgeInfo = (status: PreviewItem['status']) => {
  switch (status) {
    case 'container_package':
      return { label: 'Folder Package', className: 'text-primary bg-primary/10 border-primary/20' }
    case 'secondary_update':
      return { label: 'Update', className: 'text-foreground/90 bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]' }
    case 'secondary_dlc':
      return { label: 'DLC', className: 'text-foreground/90 bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]' }
    case 'secondary_crack':
      return { label: 'Crack Supplement', className: 'text-primary bg-primary/15 border-primary/25' }
    case 'already_organized':
      return { label: 'Organized', className: 'text-muted-foreground bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]' }
    case 'conflict':
      return { label: 'Collision', className: 'text-destructive bg-destructive/10 border-destructive/20' }
    case 'sample':
      return { label: 'Sample', className: 'text-muted-foreground bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]' }
    case 'rename_and_move':
    default:
      return { label: 'Move & Rename', className: 'text-primary bg-primary/15 border-primary/25' }
  }
}

export const getHealthBadgeInfo = (health?: string) => {
  switch (health) {
    case 'CORRECTABLE_ANOMALY':
      return { label: 'Auto-Healable', className: 'text-primary bg-primary/15 border-primary/25' }
    case 'INCOMPLETE_DOWNLOAD':
      return { label: 'Incomplete Part', className: 'text-destructive bg-destructive/10 border-destructive/20' }
    case 'HEALTHY':
      return { label: 'Healthy Archive', className: 'text-foreground/80 bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]' }
    default:
      return null
  }
}
