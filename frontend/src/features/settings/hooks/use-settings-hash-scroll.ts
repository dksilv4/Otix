import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'

/** Scroll a settings subsection into view when the URL hash changes. */
export function useSettingsHashScroll() {
  let location: any = null
  try {
    location = useLocation()
  } catch {
    // Outside of RouterProvider
  }

  useEffect(() => {
    const hash = (location?.hash || (typeof window !== 'undefined' ? window.location.hash : '') || '').replace(/^#/, '')
    if (!hash) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location?.hash, location?.pathname])
}
