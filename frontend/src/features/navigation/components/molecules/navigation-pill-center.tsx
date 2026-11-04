import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { useNavCenterContext } from '../../hooks/use-nav-center'
import { useNavPillsVisibility } from '../../hooks/use-nav-pills-visibility'
import { calculateCenterPlacement } from '../../utils/center-layout'
import type { CenterPlacementResult } from '../../utils/center-layout'

/**
 * Center floating navigation island.
 * Seamlessly docks page-level floating headers, hero metadata, and quick action bars
 * in the space between NavPillLeft and NavPillRight, with graceful sub-tier fallback on smaller screens.
 */
export const NavPillCenter = () => {
  const { centerConfig } = useNavCenterContext()
  const { showLeft, showRight } = useNavPillsVisibility()
  const { isDesktop } = useDesktopPlatform()
  const [layoutInfo, setLayoutInfo] = useState<CenterPlacementResult>({
    placement: 'between',
    center: 0,
    maxWidth: 480,
    availableSpace: 600,
  })

  const updateGeometry = useCallback(() => {
    if (typeof window === 'undefined') return

    const leftEl = showLeft ? (document.querySelector('[data-nav-pill="left"]') as HTMLElement | null) : null
    const rightEl = showRight ? (document.querySelector('[data-nav-pill="right"]') as HTMLElement | null) : null

    const leftRect = leftEl ? leftEl.getBoundingClientRect() : null
    const rightRect = rightEl ? rightEl.getBoundingClientRect() : null

    const result = calculateCenterPlacement({
      windowWidth: window.innerWidth,
      leftRect,
      rightRect,
      minWidth: 380,
      gap: 12,
    })

    setLayoutInfo(result)
  }, [showLeft, showRight])

  useEffect(() => {
    updateGeometry()
    window.addEventListener('resize', updateGeometry, { passive: true })
    const timer = setInterval(updateGeometry, 800)
    return () => {
      window.removeEventListener('resize', updateGeometry)
      clearInterval(timer)
    }
  }, [updateGeometry])

  const isVisible = Boolean(centerConfig?.visible)

  if (!centerConfig || !isVisible) return null

  if (layoutInfo.placement === 'sub-tier' && centerConfig.fallbackPlacement === 'hidden') {
    return null
  }

  const isBetween = layoutInfo.placement === 'between'
  const titleBarOffset = isDesktop ? (isBetween ? 'top-12' : 'top-26') : (isBetween ? 'top-4' : 'top-18')

  return (
    <AnimatePresence>
      <motion.div
        key={`nav-center-${centerConfig.id ?? 'default'}-${layoutInfo.placement}`}
        initial={{ opacity: 0, y: -14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -14, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        data-nav-pill="center"
        data-placement={layoutInfo.placement}
        className={`fixed z-[9990] ${titleBarOffset} shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] overflow-hidden flex items-center rounded-[2rem] px-3.5 py-1.5 border border-white/[0.04]`}
        style={{
          left: `${layoutInfo.center}px`,
          transform: 'translateX(-50%)',
          maxWidth: `${layoutInfo.maxWidth}px`,
          background: 'color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)',
          backgroundImage:
            'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
        }}
      >
        {centerConfig.content}
      </motion.div>
    </AnimatePresence>
  )
}
