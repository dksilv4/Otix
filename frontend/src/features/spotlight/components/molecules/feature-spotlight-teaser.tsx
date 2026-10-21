import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, Lightbulb } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { FeatureTip } from '../../types'

export interface FeatureSpotlightTeaserProps {
  tip: FeatureTip | null
  isVisible: boolean
  onOpenTip: (tip: FeatureTip) => void
  onDismiss: () => void
}

export const FeatureSpotlightTeaser = ({
  tip,
  isVisible,
  onOpenTip,
  onDismiss,
}: FeatureSpotlightTeaserProps) => {
  if (!tip || !isVisible) {
    return null
  }

  const Icon = tip.icon || Lightbulb

  return (
    <AnimatePresence>
      <div className="fixed bottom-6 right-6 z-[var(--dk-z-toast)] pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          role="region"
          aria-label="Feature Spotlight"
          className="pointer-events-auto flex items-center gap-3.5 rounded-2xl p-3.5 sm:p-4 max-w-sm sm:max-w-md backdrop-blur-3xl border border-[var(--dk-separator)]"
          style={{
            backgroundColor: 'var(--dk-surface-overlay)',
            boxShadow: 'var(--dk-shadow-dialog)',
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-inset shadow-inner"
            style={{
              color: tip.colorToken || 'var(--primary)',
              backgroundColor: `color-mix(in srgb, ${tip.colorToken || 'var(--primary)'} 16%, transparent)`,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                {tip.categoryLabel}
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">
              {tip.title}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onOpenTip(tip)}
              rightIcon={ArrowRight}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold shadow-[var(--dk-shadow-sm)]"
            >
              View Tip
            </DkButton>

            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
              aria-label="Dismiss feature tip"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
