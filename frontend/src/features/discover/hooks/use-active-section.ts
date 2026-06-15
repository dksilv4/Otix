import { useState, useCallback } from 'react'

export function useActiveSection(sectionIds: string[], rootMargin = '-30% 0px -30% 0px') {
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = sectionIds.indexOf(entry.target.id)
            if (idx !== -1) setActiveIndex(idx)
          }
        }
      },
      { rootMargin, threshold: 0 },
    )
    const elements = node.querySelectorAll('[data-section]')
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sectionIds, rootMargin])

  return { activeIndex, containerRef }
}
