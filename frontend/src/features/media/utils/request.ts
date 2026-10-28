import type { RequestInstance } from '../components/organisms/plugin-detail-actions'
import type { ArrRootFolder } from '@/features/downloads/arr-types'
import { formatBytes } from '@/lib/utils'

export const requestableInstances = (instances: RequestInstance[]): RequestInstance[] => {
  return instances.filter((item) => item.status === 'not_exists' || item.status === 'error')
}

export const getRootFolderFreeSpace = (folder?: ArrRootFolder | null): number => {
  if (!folder) return 0
  return folder.freeSpace ?? folder.free_space ?? 0
}

export const pickBestRootFolder = (
  folders: ArrRootFolder[],
  configuredPath?: string | null,
): ArrRootFolder | undefined => {
  if (!folders || folders.length === 0) return undefined

  if (configuredPath) {
    const configured = folders.find((f) => f.path === configuredPath)
    if (configured) return configured
  }

  // Pick the folder with the maximum free space
  let best = folders[0]
  let maxFree = getRootFolderFreeSpace(best)

  for (let i = 1; i < folders.length; i++) {
    const free = getRootFolderFreeSpace(folders[i])
    if (free > maxFree) {
      maxFree = free
      best = folders[i]
    }
  }

  return best
}

export const formatStorageFree = (folder?: ArrRootFolder | null): string => {
  const free = getRootFolderFreeSpace(folder)
  if (!free || free <= 0) return 'Unknown space'
  return `${formatBytes(free)} free`
}

export const isStorageCriticallyLow = (folder?: ArrRootFolder | null): boolean => {
  const free = getRootFolderFreeSpace(folder)
  // Low if under 15 GB
  return free > 0 && free < 15 * 1024 * 1024 * 1024
}

