import { useState, useEffect, useRef, useCallback } from 'react'

interface UseInactiveSlideshowOptions {
  inactivityTimeout?: number
  slideInterval?: number
  totalItems: number
  enabled?: boolean
}

interface UseInactiveSlideshowReturn {
  activeIndex: number
  isPlaying: boolean
  setActiveIndex: (index: number, isUserAction?: boolean) => void
  stop: () => void
}

export function useInactiveSlideshow({
  inactivityTimeout = 8000,
  slideInterval = 5000,
  totalItems,
  enabled = true,
}: UseInactiveSlideshowOptions): UseInactiveSlideshowReturn {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPlayingRef = useRef(false)
  const activeIndexRef = useRef(0)
  const originalIndexRef = useRef(0)

  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])

  const clearTimers = useCallback(() => {
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null }
    if (slideTimerRef.current) { clearInterval(slideTimerRef.current); slideTimerRef.current = null }
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    setIsPlaying(false)
    isPlayingRef.current = false
  }, [clearTimers])

  const startSlideshow = useCallback(() => {
    if (totalItems <= 1) return
    originalIndexRef.current = activeIndexRef.current
    setIsPlaying(true)
    isPlayingRef.current = true

    slideTimerRef.current = setInterval(() => {
      const next = (activeIndexRef.current + 1) % totalItems
      setActiveIndex(next)
    }, slideInterval)
  }, [totalItems, slideInterval])

  const handleUserActivity = useCallback(() => {
    if (isPlayingRef.current) {
      stop()
      setActiveIndex(originalIndexRef.current)
      return
    }

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    if (document.hidden || !enabled) return

    inactivityTimerRef.current = setTimeout(() => {
      if (!document.hidden && enabled) startSlideshow()
    }, inactivityTimeout)
  }, [inactivityTimeout, startSlideshow, stop, enabled])

  const setIndex = useCallback((index: number, isUserAction = false) => {
    setActiveIndex(index)
    if (isUserAction) {
      originalIndexRef.current = index
      handleUserActivity()
    }
  }, [handleUserActivity])

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart', 'scroll', 'wheel']
    let activityTimeout: ReturnType<typeof setTimeout> | null = null

    const handleActivity = () => {
      if (activityTimeout) clearTimeout(activityTimeout)
      activityTimeout = setTimeout(handleUserActivity, 150)
    }

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }))

    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else if (isPlayingRef.current) {
        stop()
        setActiveIndex(originalIndexRef.current)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    handleUserActivity()

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimers()
      if (activityTimeout) clearTimeout(activityTimeout)
    }
  }, [handleUserActivity, stop, clearTimers])

  return { activeIndex, isPlaying, setActiveIndex: setIndex, stop }
}
