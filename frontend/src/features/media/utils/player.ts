export const safePlay = (el: HTMLVideoElement | null): void => {
  if (!el) return
  try {
    const res = el.play()
    if (res && typeof res.catch === 'function') {
      res.catch(() => {})
    }
  } catch {
    // Ignore error
  }
}

export const safePause = (el: HTMLVideoElement | null): void => {
  if (!el) return
  try {
    el.pause()
  } catch {
    // Ignore error
  }
}

export const formatSeconds = (sec: number): string => {
  if (isNaN(sec) || sec < 0) return '0:00'
  const totalSec = Math.floor(sec)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export const calculateProgressFromEvent = (
  clientX: number,
  element: HTMLElement | null,
  duration: number,
): number => {
  if (!element || duration <= 0) return 0
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0) return 0
  const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return percent * duration
}

export interface PluginApi {
  callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
}

export const getPluginApi = (): PluginApi | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { desktopAPI?: { plugin?: PluginApi } }).desktopAPI?.plugin
}

export const PLEX_CLIENT_ID_KEY = 'otix_plex_client_id'

export const getPlexClientId = (): string => {
  if (typeof window === 'undefined') return 'otix-web-player'
  try {
    let id = localStorage.getItem(PLEX_CLIENT_ID_KEY) || localStorage.getItem('plex-client-id')
    if (!id) {
      id = 'otix-web-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
      localStorage.setItem(PLEX_CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return 'otix-web-player'
  }
}

export const checkViewportExternalSpace = (
  viewportHeight: number,
  videoElementHeight: number,
  requiredMargin = 140,
): boolean => {
  return viewportHeight >= videoElementHeight + requiredMargin
}

export { buildYouTubeEmbedUrl } from '@/features/discover/utils/trailer'

