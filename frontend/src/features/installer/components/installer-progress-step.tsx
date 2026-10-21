import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { DkLogo } from '@/components/ui/atoms/logo'
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
    <div className="flex-1 flex flex-col justify-between p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DkLogo className="h-8 w-auto text-foreground" animateInfinity />
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Installing Otix...
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Please wait while your setup is configured
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--primary)] font-semibold px-2.5 py-1 rounded-md bg-[var(--primary)]/[0.1]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{clampedPercent}%</span>
        </div>
      </div>

      {/* Center: Feature Carousel Showcase */}
      <div className="my-auto py-2">
        <InstallerCarousel />
      </div>

      {/* Bottom: Progress Bar & Status */}
      <div className="space-y-3 pt-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[420px] font-medium text-foreground">
              {progress.status}
            </span>
            <span className="font-mono text-[11px] shrink-0">
              {clampedPercent}%
            </span>
          </div>

          {/* Glowing Otix brand progress bar */}
          <div className="relative h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="absolute top-0 bottom-0 left-0 bg-[var(--primary)] rounded-full shadow-[0_0_12px_var(--primary)]"
              initial={{ width: '0%' }}
              animate={{ width: `${clampedPercent}%` }}
              transition={{ ease: 'easeOut', duration: 0.35 }}
            />
          </div>

          {progress.currentFile && (
            <p className="text-[10px] font-mono text-muted-foreground truncate pt-0.5">
              {progress.currentFile}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end pt-1">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </DkButton>
        </div>
      </div>
    </div>
  )
}
