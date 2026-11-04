import { CheckCircle2, Rocket } from 'lucide-react'
import { motion } from 'framer-motion'
import { DkButton } from '@/components/ui/atoms/button'

interface InstallerCompleteStepProps {
  version: string
  launchOnExit?: boolean
  onLaunchOnExitChange?: (val: boolean) => void
  onFinish: () => void
  onClose?: () => void
}

export const InstallerCompleteStep = ({
  version,
  onFinish,
  onClose,
}: InstallerCompleteStepProps) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-7 select-none overflow-hidden text-center">
      <div className="h-4" />

      {/* Hero Complete State with Centered Launch Action */}
      <div className="my-auto flex flex-col items-center justify-center space-y-6 py-4 max-w-sm mx-auto">
        {/* Celebratory Glowing Checkmark */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative flex items-center justify-center"
        >
          <div className="absolute -inset-4 w-28 h-28 rounded-full bg-emerald-500/25 blur-3xl animate-pulse" />
          <div className="relative p-5 rounded-3xl bg-white/[0.04] shadow-[0_16px_48px_rgba(0,0,0,0.5)] text-emerald-400 backdrop-blur-2xl">
            <CheckCircle2 className="h-12 w-12" />
          </div>
        </motion.div>

        {/* Headline & Subtitle */}
        <div className="space-y-1.5">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Ready to Play!
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Otix v{version} has been successfully installed on your computer. Your unified gaming library is ready.
          </p>
        </div>

        {/* Prominent Launch Otix Button in Center */}
        <div
          className="w-full pt-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <DkButton
            type="button"
            variant="default"
            size="lg"
            onClick={onFinish}
            className="w-full py-3.5 px-8 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_0_36px_rgba(var(--primary-rgb),0.42)] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Rocket className="h-4 w-4" />
            <span>Launch Otix</span>
          </DkButton>
        </div>
      </div>

      {/* Footer - Close Button Placed at Bottom Right */}
      <div className="flex items-center justify-end pt-4 mt-auto">
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose || onFinish}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-4"
          >
            Close
          </DkButton>
        </div>
      </div>
    </div>
  )
}
