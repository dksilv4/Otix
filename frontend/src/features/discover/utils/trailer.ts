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

