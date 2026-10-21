import { motion } from 'framer-motion'
import { Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { DkLogo } from '@/components/ui/atoms/logo'
import { DkButton } from '@/components/ui/atoms/button'
import { DkCheckbox } from '@/components/ui/atoms/checkbox'
import { useUninstaller } from '../hooks/use-uninstaller'

export const UninstallerView = () => {
  const {
    step,
    removeUserData,
    setRemoveUserData,
    progress,
    error,
    isSubmitting,
    handleConfirmUninstall,
    handleClose,
  } = useUninstaller()

  return (
    <div className="flex-1 flex flex-col justify-between p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DkLogo className="h-8 w-auto text-foreground" animateInfinity={false} />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Uninstall Otix
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Remove Otix from your system
          </p>
        </div>
      </div>

      {/* Main Body per step */}
      <div className="my-auto py-2">
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-destructive/[0.08] border border-destructive/20 p-4 flex items-start gap-3.5">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Are you sure you want to uninstall Otix?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This will remove the Otix application, Start Menu shortcuts, and desktop launcher icons from your system.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3.5">
              <DkCheckbox
                checked={removeUserData}
                onCheckedChange={setRemoveUserData}
                label="Also remove user settings, cache, and local library database"
                className="text-xs text-muted-foreground hover:text-foreground"
              />
            </div>
          </div>
        )}

        {step === 'uninstalling' && (
          <div className="space-y-4 text-center flex flex-col items-center justify-center py-4">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-[var(--primary)] animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                Uninstalling Otix...
              </h3>
              <p className="text-xs text-muted-foreground">
                {progress.status}
              </p>
            </div>
            <div className="w-full max-w-xs h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full bg-destructive rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.max(10, progress.percent)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center flex flex-col items-center justify-center space-y-3 py-4">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-[var(--primary)] shadow-lg">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-lg font-bold text-foreground">
                Otix Has Been Uninstalled
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Otix was successfully removed from your computer. You can close this window now.
              </p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center space-y-2">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">
              Uninstallation Error
            </h3>
            <p className="text-xs text-destructive/80">
              {error || 'An unexpected error occurred during removal.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.04]">
        {step === 'confirm' && (
          <>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </DkButton>
            <DkButton
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmUninstall}
              disabled={isSubmitting}
              className="text-xs px-5 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Uninstall
            </DkButton>
          </>
        )}

        {step === 'complete' && (
          <DkButton
            type="button"
            variant="default"
            size="sm"
            onClick={handleClose}
            className="text-xs px-6"
          >
            Close
          </DkButton>
        )}

        {step === 'error' && (
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            className="text-xs px-5"
          >
            Close
          </DkButton>
        )}
      </div>
    </div>
  )
}
