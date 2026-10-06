import { formatTimeRemaining, isEndingSoon } from '@/features/discover/utils/free-games'

export { formatTimeRemaining, isEndingSoon }

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
