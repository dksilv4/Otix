import { CheckCircle2, Rocket } from 'lucide-react'
import { motion } from 'framer-motion'
import { DkLogo } from '@/components/ui/atoms/logo'
import { DkButton } from '@/components/ui/atoms/button'
import { DkCheckbox } from '@/components/ui/atoms/checkbox'

interface InstallerCompleteStepProps {
  version: string
  launchOnExit: boolean
  onLaunchOnExitChange: (val: boolean) => void
  onFinish: () => void
}

export const InstallerCompleteStep = ({
  version,
  launchOnExit,
  onLaunchOnExitChange,
  onFinish,
}: InstallerCompleteStepProps) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-6 overflow-hidden">
      <div className="flex items-center gap-3">
        <DkLogo className="h-8 w-auto text-foreground" animateInfinity />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Setup Finished
        </span>
      </div>

      {/* Hero complete state */}
      <div className="my-auto text-center flex flex-col items-center justify-center space-y-4 py-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative flex items-center justify-center"
        >
          <div className="absolute w-20 h-20 rounded-full bg-[var(--primary)]/20 blur-xl animate-pulse" />
          <div className="relative p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] shadow-xl text-[var(--primary)]">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </motion.div>

        <div className="space-y-1.5 max-w-[440px]">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Ready to Play!
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Otix v{version} has been successfully installed on your computer. Your unified gaming library is ready.
          </p>
        </div>

        <div className="pt-2">
          <DkCheckbox
            checked={launchOnExit}
            onCheckedChange={onLaunchOnExitChange}
            label="Launch Otix now"
            className="text-xs text-foreground font-medium"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-3 border-t border-white/[0.04]">
        <DkButton
          type="button"
          variant="default"
          size="md"
          onClick={onFinish}
          className="text-xs px-8 shadow-lg shadow-[var(--primary)]/20 gap-2 font-semibold"
        >
          <Rocket className="h-3.5 w-3.5" />
          {launchOnExit ? 'Launch Otix' : 'Finish'}
        </DkButton>
      </div>
    </div>
  )
}
