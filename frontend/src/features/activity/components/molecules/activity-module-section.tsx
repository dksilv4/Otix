import type { Variants } from 'framer-motion'
import { motion } from 'framer-motion'
import { GLASS_STYLE } from '../../constants/activity-panel-constants'

/** Glass-morphism wrapper container for individual activity panel sections. */
export function ActivityModuleSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={sectionVariants} exit="exit" className="will-change-transform">
      <div className={`rounded-2xl p-3 shrink-0 ${className}`} style={GLASS_STYLE}>
        {children}
      </div>
    </motion.div>
  )
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
