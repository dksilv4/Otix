import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readSpotlightPreferences,
  writeSpotlightPreferences,
  markTipAsSeen,
  resetSeenTips,
  getUnseenTips,
  getNextTip,
  getPreviousTip,
  getRandomTip,
  shouldTriggerAutomaticSpotlight,
  setSessionDismissed,
  resetSessionDismissed,
  isSessionDismissed,
  SPOTLIGHT_COOLDOWN_MS,
  DEFAULT_SPOTLIGHT_PREFERENCES,
} from '../utils/spotlight-storage'
import { FEATURE_TIPS } from '../constants/feature-tips'

describe('spotlight-storage utils', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    resetSessionDismissed()
    vi.restoreAllMocks()
  })

  it('reads default preferences when localStorage is empty', () => {
    expect(readSpotlightPreferences()).toEqual(DEFAULT_SPOTLIGHT_PREFERENCES)
  })

  it('persists and reads updated preferences', () => {
    writeSpotlightPreferences({ enabled: false })
    const prefs = readSpotlightPreferences()
    expect(prefs.enabled).toBe(false)
  })

  it('marks tips as seen and updates lastShownTimestamp', () => {
    const tipId = FEATURE_TIPS[0].id
    markTipAsSeen(tipId)

    const prefs = readSpotlightPreferences()
    expect(prefs.seenTipIds).toContain(tipId)
    expect(prefs.lastShownTimestamp).toBeGreaterThan(0)
  })

  it('resets seen tips cleanly', () => {
    markTipAsSeen('test-1')
    markTipAsSeen('test-2')
    expect(readSpotlightPreferences().seenTipIds.length).toBe(2)

    resetSeenTips()
    expect(readSpotlightPreferences().seenTipIds).toEqual([])
  })

  it('filters unseen tips correctly', () => {
    const seen = [FEATURE_TIPS[0].id]
    const unseen = getUnseenTips(seen)
    expect(unseen.some((t) => t.id === FEATURE_TIPS[0].id)).toBe(false)
    expect(unseen.length).toBe(FEATURE_TIPS.length - 1)
  })

  it('cycles to next and previous tips', () => {
    const first = FEATURE_TIPS[0]
    const next = getNextTip(first.id)
    expect(next.id).toBe(FEATURE_TIPS[1].id)

    const prev = getPreviousTip(next.id)
    expect(prev.id).toBe(first.id)

    // wrap around
    const last = FEATURE_TIPS[FEATURE_TIPS.length - 1]
    expect(getNextTip(last.id).id).toBe(FEATURE_TIPS[0].id)
    expect(getPreviousTip(first.id).id).toBe(last.id)
  })

  it('picks a random tip excluding current', () => {
    const first = FEATURE_TIPS[0]
    const random = getRandomTip(first.id)
    expect(random.id).not.toBe(first.id)
  })

  it('correctly evaluates shouldTriggerAutomaticSpotlight based on cooldown and enabled status', () => {
    const now = 100_000_000
    // initially (never shown), should return true
    expect(shouldTriggerAutomaticSpotlight(now)).toBe(true)

    // marked seen just now, cooldown should prevent trigger
    writeSpotlightPreferences({ lastShownTimestamp: now - 1000 })
    expect(shouldTriggerAutomaticSpotlight(now)).toBe(false)

    // elapsed past 3-day cooldown
    writeSpotlightPreferences({ lastShownTimestamp: now - SPOTLIGHT_COOLDOWN_MS - 100 })
    expect(shouldTriggerAutomaticSpotlight(now)).toBe(true)

    // disabled by user
    writeSpotlightPreferences({ enabled: false })
    expect(shouldTriggerAutomaticSpotlight(now)).toBe(false)
  })

  it('respects session dismissal', () => {
    expect(isSessionDismissed()).toBe(false)
    setSessionDismissed()
    expect(isSessionDismissed()).toBe(true)
    expect(shouldTriggerAutomaticSpotlight()).toBe(false)
  })
})
