const SETTINGS_KEY = 'otix:video-player-settings'

export interface VideoPlayerSettings {
  volume: number
  isMuted: boolean
  isZoomedOut: boolean
  isTheater: boolean
}

export const loadPlayerSettings = (): VideoPlayerSettings => {
  const defaults: VideoPlayerSettings = {
    volume: 1,
    isMuted: false,
    isZoomedOut: false,
    isTheater: false,
  }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : defaults.volume,
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : defaults.isMuted,
      isZoomedOut: typeof parsed.isZoomedOut === 'boolean' ? parsed.isZoomedOut : defaults.isZoomedOut,
      isTheater: typeof parsed.isTheater === 'boolean' ? parsed.isTheater : defaults.isTheater,
    }
  } catch {
    return defaults
  }
}

export const savePlayerSettings = (partial: Partial<VideoPlayerSettings>): void => {
  if (typeof window === 'undefined') return
  try {
    const current = loadPlayerSettings()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // Ignore storage quota errors
  }
}

export const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const heroBackdrop = (url: string | null): string | undefined => {
  if (!url) return undefined
  return url.replace(/\/w1280\//, '/original/')
}

export interface YouTubeEmbedOptions {
  autoplay?: boolean
  enablejsapi?: number
  controls?: number
  mute?: boolean
  loop?: boolean
  playlist?: string
}

export const buildYouTubeEmbedUrl = (youtubeId: string, options?: YouTubeEmbedOptions): string => {
  const isWebHttp =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')

  // Only pass origin query parameter if on standard web HTTP/HTTPS; sanitize so non-http/https origins (app://, file://) are never sent
  const origin = isWebHttp && window.location.origin ? window.location.origin : ''
  const originParam = origin
    ? `&origin=${encodeURIComponent(origin)}`
    : '&origin=https://www.youtube.com'

  const autoplay = options?.autoplay !== false ? 1 : 0
  const enablejsapi = options?.enablejsapi ?? 1
  const controls = options?.controls ?? 0
  const muteParam = options?.mute ? '&mute=1' : ''
  const loopParam = options?.loop ? `&loop=1&playlist=${options.playlist || youtubeId}` : ''

  return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=${autoplay}&enablejsapi=${enablejsapi}&controls=${controls}&rel=0&modestbranding=1&disablekb=1&playsinline=1&iv_load_policy=3${muteParam}${loopParam}${originParam}`
}


