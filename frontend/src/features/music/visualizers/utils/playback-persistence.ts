import type { PersistentPlaybackSession, SavedCameraPresetState } from '../types'

const PLAYBACK_SESSION_KEY = 'otix_music_playback_session'
const CAMERA_PRESETS_KEY = 'otix_visualizer_camera_presets'
const SAVE_THROTTLE_MS = 1000

let lastSaveTimestamp = 0
let pendingSession: PersistentPlaybackSession | null = null
let autoResumeGestureAttached = false

export const getSavedPlaybackSession = (): PersistentPlaybackSession | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PLAYBACK_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as PersistentPlaybackSession
    if (!session || !session.track || !session.track.title) return null
    return session
  } catch {
    return null
  }
}

export const savePlaybackSessionImmediate = (session: PersistentPlaybackSession | null): void => {
  if (typeof localStorage === 'undefined') return
  try {
    if (!session) {
      localStorage.removeItem(PLAYBACK_SESSION_KEY)
      pendingSession = null
      return
    }
    localStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify(session))
    lastSaveTimestamp = Date.now()
    pendingSession = null
  } catch {
    // Ignore storage quota errors
  }
}

export const savePlaybackSessionThrottled = (session: PersistentPlaybackSession): void => {
  pendingSession = session
  const now = Date.now()
  if (now - lastSaveTimestamp >= SAVE_THROTTLE_MS) {
    savePlaybackSessionImmediate(session)
  }
}

export const clearPlaybackSession = (): void => {
  savePlaybackSessionImmediate(null)
}

export const getSavedCameraPresetState = (presetId: string): SavedCameraPresetState | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CAMERA_PRESETS_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, SavedCameraPresetState>
    return map[presetId] || null
  } catch {
    return null
  }
}

export const saveCameraPresetState = (presetId: string, state: SavedCameraPresetState): void => {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(CAMERA_PRESETS_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, SavedCameraPresetState>) : {}
    map[presetId] = state
    localStorage.setItem(CAMERA_PRESETS_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage quota errors
  }
}

export const clearCameraPresetStates = (): void => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(CAMERA_PRESETS_KEY)
  } catch {
    // Ignore
  }
}

// Window unload listeners to ensure latest playback position is captured before refresh/crash
if (typeof window !== 'undefined') {
  const flushPending = () => {
    if (pendingSession) {
      savePlaybackSessionImmediate(pendingSession)
    }
  }
  window.addEventListener('beforeunload', flushPending)
  window.addEventListener('pagehide', flushPending)
}

export const registerAutoResumeUserGesture = (onResume: () => void): (() => void) => {
  if (typeof window === 'undefined' || autoResumeGestureAttached) return () => {}

  autoResumeGestureAttached = true

  const handleGesture = () => {
    cleanUp()
    try {
      onResume()
    } catch {
      // Ignored
    }
  }

  const cleanUp = () => {
    autoResumeGestureAttached = false
    window.removeEventListener('pointerdown', handleGesture, true)
    window.removeEventListener('keydown', handleGesture, true)
    window.removeEventListener('touchstart', handleGesture, true)
  }

  window.addEventListener('pointerdown', handleGesture, { capture: true, once: true })
  window.addEventListener('keydown', handleGesture, { capture: true, once: true })
  window.addEventListener('touchstart', handleGesture, { capture: true, once: true })

  return cleanUp
}
