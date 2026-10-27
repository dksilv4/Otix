export const VISIBILITY_KEY = "otix:library-tabs:visible"
export const TAB_ORDER_KEY = "otix:library-tabs:order"

export const readVisibility = (): string[] | null => {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const filtered = parsed.filter((x): x is string => typeof x === "string")
    return Array.from(new Set(filtered))
  } catch {
    return null
  }
}

export const writeVisibility = (visibility: string[]): void => {
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility))
  } catch {
    // Ignore storage write errors (e.g. private browsing quota)
  }
}

export const readTabOrder = (): string[] | null => {
  try {
    const raw = localStorage.getItem(TAB_ORDER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const filtered = parsed.filter((x): x is string => typeof x === "string")
    return Array.from(new Set(filtered))
  } catch {
    return null
  }
}

export const writeTabOrder = (order: string[]): void => {
  try {
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order))
  } catch {
    // Ignore storage write errors
  }
}

export const sortTabsByOrder = <T extends { id: string }>(tabs: T[], order: string[] | null): T[] => {
  if (!order || order.length === 0) return tabs
  const orderMap = new Map(order.map((id, idx) => [id, idx]))
  return [...tabs].sort((a, b) => {
    const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999
    const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999
    return posA - posB
  })
}

export const resetTabPreferences = (): void => {
  try {
    localStorage.removeItem(TAB_ORDER_KEY)
    localStorage.removeItem(VISIBILITY_KEY)
  } catch {
    // Ignore storage errors
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
