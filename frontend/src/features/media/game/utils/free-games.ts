import { formatDate as formatDateUnified } from '@/lib/utils/format-date'
import { formatTimeRemaining, isEndingSoon } from '@/features/discover/utils/free-games'

export { formatTimeRemaining, isEndingSoon }

export const formatDate = (dateStr: string | null | undefined): string => {
  return formatDateUnified(dateStr, { includeTime: true })
}
