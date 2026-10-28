/**
 * Unified playtime formatting utility.
 * Formats duration in minutes to human-readable strings (e.g. '45m', '2h', '1.5h').
 */

export const formatPlaytime = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes <= 0 || Number.isNaN(minutes)) return '0m'
  if (minutes < 60) return `${Math.floor(minutes)}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}
