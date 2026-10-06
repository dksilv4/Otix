import { formatBytes } from '@/lib/utils'
import type { ServerDownloadHistoryItem } from '@/features/downloads/usenet-types'

export const historyMeta = (item: ServerDownloadHistoryItem): string => {
  const parts: string[] = [(item.protocol || 'usenet').toUpperCase(), item.status]
  if (item.size_bytes) parts.push(formatBytes(item.size_bytes))
  return parts.join(' · ')
}
