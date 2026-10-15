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
    | 'container_package'
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
    }
  })
}

export const calculatePreviewMetrics = (items: PreviewItem[]) => {
  const total = items.length
  const matched = items.filter((i) => i.matched).length
  const conflicts = items.filter((i) => i.status === 'conflict').length
  const packages = items.filter((i) => i.status === 'container_package').length
  const folderSet = new Set<string>()
  items.forEach((i) => {
    i.foldersToCreate?.forEach((f) => folderSet.add(f))
  })
  return {
    total,
    matched,
    conflicts,
    packages,
    foldersCount: folderSet.size,
  }
}

export const getStatusBadgeInfo = (status: PreviewItem['status']) => {
  switch (status) {
    case 'container_package':
      return { label: 'Folder Package', className: 'text-primary bg-primary/10 border-primary/20' }
    case 'secondary_update':
      return { label: 'Update', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
    case 'secondary_dlc':
      return { label: 'DLC', className: 'text-purple-400 bg-purple-500/10 border-purple-500/20' }
    case 'already_organized':
      return { label: 'Organized', className: 'text-sky-400 bg-sky-500/10 border-sky-500/20' }
    case 'conflict':
      return { label: 'Collision', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
    case 'sample':
      return { label: 'Sample', className: 'text-muted-foreground bg-white/5 border-white/10' }
    case 'rename_and_move':
    default:
      return { label: 'Move & Rename', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
  }
}
