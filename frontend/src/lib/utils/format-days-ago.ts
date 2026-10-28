/**
 * Unified relative days ago formatting utility.
 * Formats epoch seconds into relative past descriptions ('Today', '1d ago', '12d ago').
 */

export const formatDaysAgo = (unixTimestamp: number | null | undefined): string => {
  if (unixTimestamp == null || Number.isNaN(unixTimestamp)) return 'Today'
  const diffSec = Math.floor(Date.now() / 1000 - unixTimestamp)
  if (diffSec <= 0 || Number.isNaN(diffSec)) return 'Today'
  const days = Math.floor(diffSec / 86400)
  if (days <= 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}
