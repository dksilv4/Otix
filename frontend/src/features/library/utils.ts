export const VISIBILITY_KEY = "otix:library-tabs:visible"

export const readVisibility = (): string[] | null => {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((x): x is string => typeof x === "string")) : null
  } catch {
    return null
  }
}

export const formatDaysAgo = (unixTimestamp: number): string => {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1d ago"
  if (days <= 14) return `${days}d ago`
  return ""
}

export const formatPlaytime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}
