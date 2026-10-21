/**
 * Utilities for cross-platform Picture-in-Picture (PiP) and MediaSession API support.
 * Supports standard HTML5 Video PiP (Chrome, Edge, Firefox, Desktop Safari, Android Chrome),
 * WebKit Presentation Mode (iOS / iPadOS Safari), and OS MediaSession transport controls.
 */

export type PipPresentationMode = 'inline' | 'picture-in-picture' | 'fullscreen'

export type WebkitVideoElement = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
  webkitPresentationMode?: string
  autoPictureInPicture?: boolean
}

export interface MediaSessionDetails {
  title: string
  subtitle?: string
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  source?: string
  artworkUrl?: string
}

export interface MediaSessionHandlers {
  onPlay: () => void
  onPause: () => void
  onSeek: (seconds: number) => void
}

/**
 * Checks whether Picture-in-Picture is supported by the current browser/device.
 */
export const isOverallPipSupported = (video?: HTMLVideoElement | null): boolean => {
  if (typeof document === 'undefined') return false

  // Standard Picture-in-Picture API
  if (
    'pictureInPictureEnabled' in document &&
    (document.pictureInPictureEnabled || typeof HTMLVideoElement?.prototype?.requestPictureInPicture === 'function')
  ) {
    return true
  }

  // WebKit Presentation Mode (iOS & iPadOS Safari, macOS Safari legacy)
  if (video) {
    const webkitEl = video as WebkitVideoElement
    if (
      typeof webkitEl.webkitSupportsPresentationMode === 'function' &&
      webkitEl.webkitSupportsPresentationMode('picture-in-picture')
    ) {
      return true
    }
  }

  return false
}

/**
 * Checks whether the video is actively displayed in the OS Picture-in-Picture window.
 */
export const isOverallPipActive = (video?: HTMLVideoElement | null): boolean => {
  if (typeof document === 'undefined') return false

  if (document.pictureInPictureElement) {
    if (!video) return true
    return document.pictureInPictureElement === video
  }

  if (video) {
    const webkitEl = video as WebkitVideoElement
    if (webkitEl.webkitPresentationMode === 'picture-in-picture') {
      return true
    }
  }

  return false
}

/**
 * Requests entering Picture-in-Picture on the provided video element.
 */
export const requestOverallPip = async (video: HTMLVideoElement): Promise<void> => {
  if (!video) return

  // If already active in PiP, do nothing
  if (isOverallPipActive(video)) return

  // 1. Standard HTML5 Video PiP (Chrome, Edge, Firefox, Desktop Safari, Android Chrome, Electron)
  if (typeof video.requestPictureInPicture === 'function') {
    await video.requestPictureInPicture()
    return
  }

  // 2. WebKit presentation mode (iOS & iPadOS Safari)
  const webkitEl = video as WebkitVideoElement
  if (
    typeof webkitEl.webkitSetPresentationMode === 'function' &&
    typeof webkitEl.webkitSupportsPresentationMode === 'function' &&
    webkitEl.webkitSupportsPresentationMode('picture-in-picture')
  ) {
    webkitEl.webkitSetPresentationMode('picture-in-picture')
    return
  }

  throw new Error('Picture-in-Picture is not supported on this device/browser')
}

/**
 * Exits Picture-in-Picture if active.
 */
export const exitOverallPip = async (video?: HTMLVideoElement | null): Promise<void> => {
  if (typeof document !== 'undefined' && document.pictureInPictureElement) {
    try {
      await document.exitPictureInPicture()
    } catch {
      // Ignore if already exited
    }
    return
  }

  if (video) {
    const webkitEl = video as WebkitVideoElement
    if (
      webkitEl.webkitPresentationMode === 'picture-in-picture' &&
      typeof webkitEl.webkitSetPresentationMode === 'function'
    ) {
      webkitEl.webkitSetPresentationMode('inline')
    }
  }
}

/**
 * Toggles Picture-in-Picture mode on the provided video element.
 * Returns true if PiP is now requested/entered, false if exited.
 */
export const toggleOverallPip = async (video: HTMLVideoElement | null): Promise<boolean> => {
  if (!video) return false
  if (isOverallPipActive(video)) {
    await exitOverallPip(video)
    return false
  } else {
    await requestOverallPip(video)
    return true
  }
}

/**
 * Synchronizes metadata to the OS MediaSession (title, artist, album, artwork).
 */
export const syncMediaSessionMetadata = (details: MediaSessionDetails | null): void => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if (!details) {
    navigator.mediaSession.metadata = null
    return
  }

  const isEpisode = details.seasonNumber != null && details.episodeNumber != null
  const artist = isEpisode
    ? `S${String(details.seasonNumber).padStart(2, '0')}:E${String(details.episodeNumber).padStart(2, '0')} ${details.episodeTitle || ''}`.trim()
    : details.subtitle || details.source || 'Otix'
  const album = isEpisode ? details.seriesTitle || details.title : details.title

  const artwork: MediaImage[] = details.artworkUrl
    ? [
        { src: details.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        { src: details.artworkUrl, sizes: '256x256', type: 'image/jpeg' },
      ]
    : []

  try {
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: details.title,
        artist,
        album,
        artwork,
      })
    } else {
      // Fallback for environments / polyfills without global MediaMetadata constructor
      navigator.mediaSession.metadata = {
        title: details.title,
        artist,
        album,
        artwork,
      } as unknown as MediaMetadata
    }
  } catch {
    // MediaMetadata constructor may fail in non-compliant environments
  }
}

/**
 * Synchronizes playback state and timeline to the OS MediaSession.
 */
export const syncMediaSessionPlaybackState = (
  isPlaying: boolean,
  currentTime: number,
  duration: number,
  playbackSpeed = 1,
): void => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    if (
      'setPositionState' in navigator.mediaSession &&
      typeof navigator.mediaSession.setPositionState === 'function' &&
      Number.isFinite(duration) &&
      duration > 0
    ) {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: Math.max(0.25, Math.min(4, playbackSpeed || 1)),
        position: Math.max(0, Math.min(currentTime, duration)),
      })
    }
  } catch {
    // Ignore invalid position states
  }
}

/**
 * Registers transport action handlers on the OS MediaSession.
 */
export const registerMediaSessionActions = (
  handlers: MediaSessionHandlers,
  getCurrentTime: () => number,
  getDuration: () => number,
): (() => void) => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {}
  }

  const session = navigator.mediaSession

  const setSafeHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // Ignore unsupported action types
    }
  }

  setSafeHandler('play', () => handlers.onPlay())
  setSafeHandler('pause', () => handlers.onPause())
  setSafeHandler('seekbackward', (e) => {
    const offset = e.seekOffset || 10
    const nextTime = Math.max(0, getCurrentTime() - offset)
    handlers.onSeek(nextTime)
  })
  setSafeHandler('seekforward', (e) => {
    const offset = e.seekOffset || 10
    const nextTime = Math.min(getDuration(), getCurrentTime() + offset)
    handlers.onSeek(nextTime)
  })
  setSafeHandler('seekto', (e) => {
    if (e.seekTime != null) {
      handlers.onSeek(Math.max(0, Math.min(e.seekTime, getDuration())))
    }
  })

  return () => {
    setSafeHandler('play', null)
    setSafeHandler('pause', null)
    setSafeHandler('seekbackward', null)
    setSafeHandler('seekforward', null)
    setSafeHandler('seekto', null)
  }
}

export type PipDockCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface PipBounds {
  viewportWidth: number
  viewportHeight: number
  cardWidth: number
  cardHeight: number
  padding?: number
}

/**
 * Calculates the bounding box limits for the floating in-app PiP card.
 * Negative offsets represent relative translation from bottom-right (CSS fixed bottom/right).
 */
export const calculatePipDragBounds = (
  bounds: PipBounds,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const pad = bounds.padding ?? 16
  const availableW = Math.max(0, bounds.viewportWidth - bounds.cardWidth - pad * 2)
  const availableH = Math.max(0, bounds.viewportHeight - bounds.cardHeight - pad * 2)

  return {
    minX: -availableW,
    maxX: 0,
    minY: -availableH,
    maxY: 0,
  }
}

/**
 * Determines the nearest dock corner based on current translation and viewport dimensions.
 */
export const getNearestPipCorner = (
  x: number,
  y: number,
  bounds: PipBounds,
): PipDockCorner => {
  const { minX, minY } = calculatePipDragBounds(bounds)
  const midX = minX / 2
  const midY = minY / 2

  const isLeft = x < midX
  const isTop = y < midY

  if (isTop && isLeft) return 'top-left'
  if (isTop && !isLeft) return 'top-right'
  if (!isTop && isLeft) return 'bottom-left'
  return 'bottom-right'
}

/**
 * Calculates the target translation coordinates for docking to a specific corner.
 */
export const getPipCornerCoordinates = (
  corner: PipDockCorner,
  bounds: PipBounds,
): { x: number; y: number } => {
  const { minX, minY } = calculatePipDragBounds(bounds)

  switch (corner) {
    case 'top-left':
      return { x: minX, y: minY }
    case 'top-right':
      return { x: 0, y: minY }
    case 'bottom-left':
      return { x: minX, y: 0 }
    case 'bottom-right':
    default:
      return { x: 0, y: 0 }
  }
}

