import { FEATURE_TIPS } from '../constants/feature-tips'
import type { FeatureTip, SpotlightPreferences } from '../types'

export const SPOTLIGHT_STORAGE_KEY = 'otix:spotlight-preferences'
export const SPOTLIGHT_SESSION_DISMISSED_KEY = 'otix:spotlight-session-dismissed'
export const SPOTLIGHT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

export const DEFAULT_SPOTLIGHT_PREFERENCES: SpotlightPreferences = {
  enabled: true,
  lastShownTimestamp: 0,
  seenTipIds: [],
}

export const readSpotlightPreferences = (): SpotlightPreferences => {
  try {
    const raw = localStorage.getItem(SPOTLIGHT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SpotlightPreferences>
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        lastShownTimestamp:
          typeof parsed.lastShownTimestamp === 'number' ? parsed.lastShownTimestamp : 0,
        seenTipIds: Array.isArray(parsed.seenTipIds) ? parsed.seenTipIds : [],
      }
    }
  } catch {
    // ignore parsing errors
  }
  return DEFAULT_SPOTLIGHT_PREFERENCES
}

export const writeSpotlightPreferences = (
  updates: Partial<SpotlightPreferences>,
): SpotlightPreferences => {
  const current = readSpotlightPreferences()
  const next: SpotlightPreferences = {
    ...current,
    ...updates,
  }
  try {
    localStorage.setItem(SPOTLIGHT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
  return next
}

export const markTipAsSeen = (tipId: string): void => {
  const current = readSpotlightPreferences()
  if (!current.seenTipIds.includes(tipId)) {
    const nextSeen = [...current.seenTipIds, tipId]
    writeSpotlightPreferences({
      seenTipIds: nextSeen,
      lastShownTimestamp: Date.now(),
    })
  } else {
    writeSpotlightPreferences({
      lastShownTimestamp: Date.now(),
    })
  }
}

export const resetSeenTips = (): void => {
  writeSpotlightPreferences({
    seenTipIds: [],
  })
}

export const getUnseenTips = (seenIds: string[]): FeatureTip[] => {
  const seenSet = new Set(seenIds)
  return FEATURE_TIPS.filter((tip) => !seenSet.has(tip.id))
}

export const getNextTip = (currentTipId?: string): FeatureTip => {
  if (FEATURE_TIPS.length === 0) {
    throw new Error('FEATURE_TIPS is empty')
  }
  if (!currentTipId) {
    const prefs = readSpotlightPreferences()
    const unseen = getUnseenTips(prefs.seenTipIds)
    return unseen.length > 0 ? unseen[0] : FEATURE_TIPS[0]
  }
  const currentIndex = FEATURE_TIPS.findIndex((t) => t.id === currentTipId)
  if (currentIndex === -1 || currentIndex === FEATURE_TIPS.length - 1) {
    return FEATURE_TIPS[0]
  }
  return FEATURE_TIPS[currentIndex + 1]
}

export const getPreviousTip = (currentTipId?: string): FeatureTip => {
  if (FEATURE_TIPS.length === 0) {
    throw new Error('FEATURE_TIPS is empty')
  }
  if (!currentTipId) {
    return FEATURE_TIPS[0]
  }
  const currentIndex = FEATURE_TIPS.findIndex((t) => t.id === currentTipId)
  if (currentIndex <= 0) {
    return FEATURE_TIPS[FEATURE_TIPS.length - 1]
  }
  return FEATURE_TIPS[currentIndex - 1]
}

export const getRandomTip = (excludeTipId?: string): FeatureTip => {
  if (FEATURE_TIPS.length <= 1) {
    return FEATURE_TIPS[0]
  }
  const candidates = excludeTipId
    ? FEATURE_TIPS.filter((t) => t.id !== excludeTipId)
    : FEATURE_TIPS
  const randomIndex = Math.floor(Math.random() * candidates.length)
  return candidates[randomIndex]
}

export const shouldTriggerAutomaticSpotlight = (now = Date.now()): boolean => {
  if (isSessionDismissed()) {
    return false
  }
  const prefs = readSpotlightPreferences()
  if (!prefs.enabled) {
    return false
  }
  if (!prefs.lastShownTimestamp) {
    return true
  }
  const elapsed = now - prefs.lastShownTimestamp
  return elapsed >= SPOTLIGHT_COOLDOWN_MS
}

let inMemorySessionDismissed = false

export const isSessionDismissed = (): boolean => {
  if (inMemorySessionDismissed) return true
  try {
    return sessionStorage.getItem(SPOTLIGHT_SESSION_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export const resetSessionDismissed = (): void => {
  inMemorySessionDismissed = false
  try {
    sessionStorage.removeItem(SPOTLIGHT_SESSION_DISMISSED_KEY)
  } catch {
    // ignore
  }
}

export const setSessionDismissed = (): void => {
  inMemorySessionDismissed = true
  try {
    sessionStorage.setItem(SPOTLIGHT_SESSION_DISMISSED_KEY, 'true')
  } catch {
    // ignore
  }
}
