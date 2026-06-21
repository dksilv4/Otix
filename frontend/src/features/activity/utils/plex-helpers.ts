import { Film, Tv } from 'lucide-react'
import type { PlexSession } from '../types'

export function formatTitle(s: PlexSession): string {
  if (s.media_type === 'episode' && s.grandparent_title) {
    const ep = s.index != null ? `E${s.index}` : ''
    return `${s.grandparent_title} ${ep}`.trim()
  }
  return s.title
}

export function formatEpisodeMeta(s: PlexSession): string | null {
  if (s.media_type !== 'episode') return null
  if (!s.parent_title && s.index == null) return null
  const season = s.parent_title ? s.parent_title.replace('Season ', 'S') : ''
  const ep = s.index != null ? `E${s.index}` : ''
  return `${season}${ep}`.trim() || null
}

export const mediaTypeIcon = (type: string) => {
  switch (type) {
    case 'movie': return { Icon: Film, label: 'Movie' }
    case 'episode': return { Icon: Tv, label: 'Show' }
    default: return { Icon: Film, label: type }
  }
}

export function formatDevice(s: PlexSession): string | null {
  return s.player_device || s.player_platform || null
}

export function transcodeLabel(
  videoDecision: string | null,
  audioDecision: string | null,
  throttled: boolean
): string | null {
  const isDirectVideo = !videoDecision || videoDecision === 'direct play'
  const isDirectAudio = !audioDecision || audioDecision === 'direct play'
  if (isDirectVideo && isDirectAudio) return null
  if (!isDirectVideo) return 'Transcode'
  if (throttled) return 'Throttled'
  return null
}

export function formatTotalDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function truncate(str: string | null, max: number): string | null {
  if (!str) return null
  if (str.length <= max) return str
  return str.slice(0, max).replace(/\s+\S*$/, '') + '…'
}
