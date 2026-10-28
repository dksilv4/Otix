import type { MediaRequestItem } from '../use-media-requests'

export function getRequestStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'requested':
      return 'Requested'
    case 'processing':
      return 'Processing'
    case 'downloading':
      return 'Downloading'
    case 'available':
    case 'completed':
      return 'Available'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export function getRequestStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'available':
    case 'completed':
      return 'bg-primary/20 text-primary border border-primary/30'
    case 'downloading':
    case 'processing':
      return 'bg-primary/15 text-primary border border-primary/20'
    case 'failed':
      return 'bg-destructive/15 text-destructive border border-destructive/25'
    case 'cancelled':
      return 'bg-muted text-muted-foreground border border-white/[0.04]'
    case 'requested':
    default:
      return 'bg-muted/80 text-foreground border border-white/[0.06]'
  }
}

export function formatRequestRelativeTime(dateString?: string | null): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 30) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function getRequestServiceLabel(service: string, mediaType: string): string {
  const s = service.toLowerCase()
  if (s === 'radarr') return 'Radarr'
  if (s === 'sonarr') return 'Sonarr'
  if (s === 'sabnzbd' || s === 'usenet') return 'SABnzbd'
  if (mediaType === 'movie') return 'Radarr'
  if (mediaType === 'show') return 'Sonarr'
  return service || 'Download'
}

export function filterMediaRequests(
  requests: MediaRequestItem[],
  query: string,
  mediaTypeFilter: string,
): MediaRequestItem[] {
  let list = requests
  if (mediaTypeFilter && mediaTypeFilter !== 'all') {
    list = list.filter((r) => r.mediaType.toLowerCase() === mediaTypeFilter.toLowerCase())
  }
  const q = query.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.serverName && r.serverName.toLowerCase().includes(q)) ||
        (r.instanceName && r.instanceName.toLowerCase().includes(q)),
    )
  }
  return list
}
