export { formatBytes } from '@/lib/utils/format-bytes'

export const getDriveLetter = (filePath: string): string => {
  if (!filePath) return 'C:'
  const match = filePath.match(/^([a-zA-Z]:)/)
  return match ? match[1].toUpperCase() : 'C:'
}

export const hasEnoughDiskSpace = (freeBytes: number, requiredBytes: number): boolean => {
  return freeBytes >= requiredBytes
}

export const normalizePath = (pathStr: string): string => {
  return pathStr.replace(/\\+/g, '/').replace(/\/+/g, '/')
}
