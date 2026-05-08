import { useEffect, useRef, useState } from 'react'

interface DeferredSectionProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  rootMargin?: string
  className?: string
}

/**
 * Lazy-loads its children when the section scrolls into view using IntersectionObserver.
 * Falls back to eagerly rendering if IntersectionObserver is unavailable (SSR-safe).
 */
export function DeferredSection({
  children,
  fallback = null,
  rootMargin = '320px 0px',
  className,
}: DeferredSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isActive, setIsActive] = useState(
    () => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
  )

  useEffect(() => {
    if (isActive) return

    const node = containerRef.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsActive(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsActive(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [isActive, rootMargin])

  return (
    <div ref={containerRef} className={className}>
      {isActive ? children : fallback}
    </div>
  )
}
