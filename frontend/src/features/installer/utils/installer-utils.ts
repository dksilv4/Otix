export const formatBytes = (bytes: number, decimals = 1): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(dm)} ${sizes[i]}`
}

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
