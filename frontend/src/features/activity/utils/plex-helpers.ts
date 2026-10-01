import { Film, Tv, Monitor, Smartphone, Laptop, Tablet } from 'lucide-react'
import type { PlexSession } from '../types'

export function formatTitle(s: PlexSession): string {
  if (s.media_type === 'episode' && s.grandparent_title) {
    return s.grandparent_title
  }
  return s.title
}

export function formatEpisodeSubtitle(s: PlexSession): string | null {
  if (s.media_type !== 'episode') return null
  const meta = formatEpisodeMeta(s)
  if (meta && s.title) {
    return `${meta} · ${s.title}`
  }
  return meta || s.title || null
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
  return s.player_title || s.player_device || s.player_platform || null
}

export type DeviceType = 'tv' | 'phone' | 'tablet' | 'laptop' | 'monitor'

export function getDeviceType(device: string | null, platform: string | null): DeviceType {
  const text = `${device ?? ''} ${platform ?? ''}`.toLowerCase()
  if (
    text.includes('tv') ||
    text.includes('shield') ||
    text.includes('roku') ||
    text.includes('fire') ||
    text.includes('chromecast') ||
    text.includes('appletv')
  ) {
    return 'tv'
  }
  if (
    text.includes('phone') ||
    text.includes('iphone') ||
    (text.includes('android') && !text.includes('tv'))
  ) {
    return 'phone'
  }
  if (text.includes('tablet') || text.includes('ipad')) {
    return 'tablet'
  }
  if (
    text.includes('mac') ||
    text.includes('windows') ||
    text.includes('linux') ||
    text.includes('chrome') ||
    text.includes('safari') ||
    text.includes('web') ||
    text.includes('firefox')
  ) {
    return 'laptop'
  }
  return 'monitor'
}

export function getDeviceIcon(device: string | null, platform: string | null) {
  const text = `${device ?? ''} ${platform ?? ''}`.toLowerCase()
  if (
    text.includes('tv') ||
    text.includes('shield') ||
    text.includes('roku') ||
    text.includes('fire') ||
    text.includes('chromecast') ||
    text.includes('appletv')
  ) {
    return Tv
  }
  if (
    text.includes('phone') ||
    text.includes('iphone') ||
    (text.includes('android') && !text.includes('tv'))
  ) {
    return Smartphone
  }
  if (text.includes('tablet') || text.includes('ipad')) {
    return Tablet
  }
  if (
    text.includes('mac') ||
    text.includes('windows') ||
    text.includes('linux') ||
    text.includes('chrome') ||
    text.includes('safari') ||
    text.includes('web') ||
    text.includes('firefox')
  ) {
    return Laptop
  }
  return Monitor
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

export function formatPlaybackTime(ms: number | null): string {
  if (!ms || ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
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

