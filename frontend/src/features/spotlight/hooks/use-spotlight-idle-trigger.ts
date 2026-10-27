import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from '@tanstack/react-router'
import type { FeatureTip } from '../types'
import {
  getNextTip,
  shouldTriggerAutomaticSpotlight,
  setSessionDismissed,
  isSessionDismissed,
  writeSpotlightPreferences,
} from '../utils/spotlight-storage'

const IDLE_DELAY_MS = 60_000 // 60 seconds of continuous inactivity
const TEASER_AUTO_DISMISS_MS = 14_000 // Fades after 14 seconds if ignored

const DISALLOWED_PATH_PREFIXES = [
  '/auth',
  '/settings',
  '/launcher',
  '/terms',
  '/calendar/timeline',
]

export const useSpotlightIdleTrigger = () => {
  const location = useLocation()
  const [teaserTip, setTeaserTip] = useState<FeatureTip | null>(null)
  const [isTeaserVisible, setIsTeaserVisible] = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAllowedPath = !DISALLOWED_PATH_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  )

  const dismissTeaser = useCallback(() => {
    setIsTeaserVisible(false)
    setSessionDismissed()
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current)
      autoDismissTimerRef.current = null
    }
  }, [])

  const triggerTeaser = useCallback(() => {
    if (!isAllowedPath || isSessionDismissed()) return
    if (!shouldTriggerAutomaticSpotlight()) return

    // Ensure user is not currently focused on an input element
    const activeEl = document.activeElement
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable)
    ) {
      return
    }

    const tip = getNextTip()
    setTeaserTip(tip)
    setIsTeaserVisible(true)

    // Mark session as shown and set last shown timestamp to prevent repetitive popping in/out
    setSessionDismissed()
    writeSpotlightPreferences({ lastShownTimestamp: Date.now() })

    // Set auto-dismiss timer
    if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current)
    autoDismissTimerRef.current = setTimeout(() => {
      setIsTeaserVisible(false)
    }, TEASER_AUTO_DISMISS_MS)
  }, [isAllowedPath])

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    // Only start idle countdown if path is allowed and auto-trigger is eligible
    if (isAllowedPath && !isSessionDismissed() && shouldTriggerAutomaticSpotlight()) {
      idleTimerRef.current = setTimeout(() => {
        triggerTeaser()
      }, IDLE_DELAY_MS)
    }
  }, [isAllowedPath, triggerTeaser])

  useEffect(() => {
    resetIdleTimer()

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handleActivity = () => {
      // If teaser is already visible, we don't immediately hide it on mouse move;
      // let user interact or auto-dismiss timer expire.
      // But if not visible, reset the countdown.
      if (!isTeaserVisible) {
        resetIdleTimer()
      }
    }

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true })
    })

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current)
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleActivity)
      })
    }
  }, [resetIdleTimer, isTeaserVisible])

  return {
    teaserTip,
    isTeaserVisible,
    dismissTeaser,
  }
}
