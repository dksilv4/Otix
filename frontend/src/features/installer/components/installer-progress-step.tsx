import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { DkButton } from '@/components/ui/atoms/button'
import { InstallerCarousel } from './installer-carousel'
import type { InstallStepProgress } from '../types'

interface InstallerProgressStepProps {
  progress: InstallStepProgress
  onCancel: () => void
}

export const InstallerProgressStep = ({
  progress,
  onCancel,
}: InstallerProgressStepProps) => {
  const clampedPercent = Math.min(100, Math.max(0, Math.round(progress.percent)))

  return (
    <div className="flex-1 w-full h-full flex flex-col justify-between select-none overflow-hidden">
      {/* Expansive Full-Height & Full-Width Feature Showcase - No Header */}
      <div className="flex-1 w-full flex flex-col min-h-0 overflow-hidden pt-4">
        <InstallerCarousel />
      </div>

      {/* Anchored Floating Bottom Progress HUD */}
      <div className="w-full px-7 pb-5 pt-3 shrink-0 space-y-3">
        {/* Full-width continuous glowing progress bar */}
        <div className="relative h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 left-0 bg-primary rounded-full shadow-[0_0_24px_rgba(var(--primary-rgb),0.85)]"
            initial={{ width: '0%' }}
            animate={{ width: `${clampedPercent}%` }}
            transition={{ ease: 'easeOut', duration: 0.35 }}
          />
        </div>

        {/* Status Line & Controls */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2 truncate max-w-[500px]">
            <span className="font-semibold text-foreground tracking-wide">
              Installing Otix...
            </span>
            <span>·</span>
            <span className="text-muted-foreground/80 truncate">
              {progress.status}
            </span>
            {progress.currentFile && (
              <span className="font-mono text-xs text-muted-foreground/60 truncate">
                ({progress.currentFile})
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-3 shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{clampedPercent}%</span>
            </div>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3"
            >
              Cancel
            </DkButton>
          </div>
        </div>
      </div>
    </div>
  )
}
