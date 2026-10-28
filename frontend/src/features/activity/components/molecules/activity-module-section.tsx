import { motion } from 'framer-motion'
import {
  GLASS_STYLE,
  sectionVariants,
  staggerVariants,
} from '../../constants/activity-panel-constants'

export { sectionVariants, staggerVariants }

/** Glass-morphism wrapper container for individual activity panel sections. */
export const ActivityModuleSection = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <motion.div variants={sectionVariants} exit="exit" className="will-change-transform">
      <div className={`rounded-2xl p-3 shrink-0 ${className}`} style={GLASS_STYLE}>
        {children}
      </div>
    </motion.div>
  )
};
