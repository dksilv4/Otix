import type { CSSProperties } from 'react'
import type { Variants } from 'framer-motion'

export const PANEL_WIDTH = 360
export const PANEL_MARGIN = 16

export const GLASS_STYLE: CSSProperties = {
  background: 'color-mix(in oklch, var(--dk-surface-raised) 85%, transparent)',
  backdropFilter: 'blur(16px)',
}

export const sectionVariants: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
  },
}

export const staggerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
}

