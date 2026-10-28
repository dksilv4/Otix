/**
 * Unified millisecond duration formatter.
 * Formats duration in milliseconds to 'm:ss' (e.g. 125000 -> '2:05').
 */

export const formatMs = (ms: number | null | undefined): string => {
  if (ms == null || ms <= 0 || Number.isNaN(ms)) return '—'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}
