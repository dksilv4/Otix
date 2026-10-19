import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'

const STORAGE_KEY = 'otix_scroll_positions'
const MAX_RESTORE_TIME_MS = 2500

const getStoredPositions = (): Record<string, number> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const saveStoredPositions = (positions: Record<string, number>) => {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // SessionStorage full or unavailable
  }
}

/**
 * Robust scroll restoration hook for SPA routes with async content.
 *
 * Saves scroll positions per URL pathname + search.
 * On browser back/forward (POP) navigation, observes the page height and
 * restores the exact previous scroll position as soon as dynamic data finishes rendering.
 * On new (PUSH) navigation, scrolls smoothly/instantly to the top.
 */
export const useScrollRestoration = () => {
  const location = useLocation()
  const currentKey = location.href || `${location.pathname}${location.searchStr || ''}`
  const prevKeyRef = useRef(currentKey)
  const isPopRef = useRef(false)
  const activeRestoreCleanupRef = useRef<(() => void) | null>(null)

  // Configure browser manual scroll restoration once
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  // Listen to popstate (browser back/forward button or history.back())
  useEffect(() => {
    const handlePopState = () => {
      isPopRef.current = true
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Record scroll position continuously as the user scrolls
  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY
          const stored = getStoredPositions()
          stored[currentKey] = y
          saveStoredPositions(stored)
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [currentKey])

  // Handle route navigation: restore if POP, or scroll to top if PUSH
  useEffect(() => {
    // Cancel any ongoing restoration from prior route
    activeRestoreCleanupRef.current?.()
    activeRestoreCleanupRef.current = null

    const prevKey = prevKeyRef.current
    prevKeyRef.current = currentKey

    // Persist outgoing page scroll position
    const stored = getStoredPositions()
    if (prevKey !== currentKey) {
      stored[prevKey] = window.scrollY
      saveStoredPositions(stored)
    }

    if (isPopRef.current) {
      isPopRef.current = false
      const targetY = stored[currentKey] ?? 0

      if (targetY > 0) {
        let isCancelled = false
        let rafId: number | null = null
        let timeoutId: number | null = null
        let resizeObserver: ResizeObserver | null = null

        const cancel = () => {
          isCancelled = true
          if (rafId !== null) cancelAnimationFrame(rafId)
          if (timeoutId !== null) clearTimeout(timeoutId)
          resizeObserver?.disconnect()
          window.removeEventListener('wheel', cancel)
          window.removeEventListener('touchstart', cancel)
        }

        activeRestoreCleanupRef.current = cancel

        // If user manually touches or scrolls, abort restoration
        window.addEventListener('wheel', cancel, { passive: true })
        window.addEventListener('touchstart', cancel, { passive: true })

        const tryScroll = () => {
          if (isCancelled) return
          window.scrollTo({ top: targetY, behavior: 'instant' })

          // If reached target position within 5px, finish restoration
          if (Math.abs(window.scrollY - targetY) <= 5) {
            cancel()
            return
          }

          // If document height can already accommodate target, finish
          const maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          )
          if (maxScroll >= targetY) {
            window.scrollTo({ top: targetY, behavior: 'instant' })
            cancel()
          }
        }

        // Try immediately
        tryScroll()

        // Observe DOM height expansions as async data hydrates
        if (!isCancelled) {
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
              if (isCancelled) return
              tryScroll()
            })

            resizeObserver.observe(document.documentElement)
            if (document.body) {
              resizeObserver.observe(document.body)
            }
          }

          // Safety timeout to avoid lingering observers
          timeoutId = window.setTimeout(cancel, MAX_RESTORE_TIME_MS)

          // Also schedule an RAF check
          rafId = requestAnimationFrame(tryScroll)
        }
      }
    } else {
      // PUSH navigation: scroll to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    }

    return () => {
      activeRestoreCleanupRef.current?.()
      activeRestoreCleanupRef.current = null
    }
  }, [currentKey])
}
