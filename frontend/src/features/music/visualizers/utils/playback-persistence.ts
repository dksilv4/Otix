import type { PersistentPlaybackSession } from '../types'

const PLAYBACK_SESSION_KEY = 'otix_music_playback_session'
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
