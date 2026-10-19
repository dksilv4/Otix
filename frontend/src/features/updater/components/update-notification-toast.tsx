import { Sparkles, ArrowRight, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DkButton } from '@ui/atoms/button'
import { useAppUpdater } from '../hooks/use-app-updater'

const toastAnimation = {
  initial: { opacity: 0, y: 30, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 20, scale: 0.95 },
}

export const UpdateNotificationToast = () => {
  const {
    isDesktop,
    isDownloaded,
    availableVersion,
    isDismissed,
    installUpdate,
    dismissNotification,
  } = useAppUpdater()

  if (!isDesktop || !isDownloaded || isDismissed) {
    return null
  }

  return (
    <AnimatePresence>
      <div className="fixed bottom-6 left-6 z-[var(--dk-z-toast)] pointer-events-none">
        <motion.div
          {...toastAnimation}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-center gap-4 rounded-2xl p-4 max-w-md backdrop-blur-2xl shadow-2xl border border-[var(--dk-separator)]"
          style={{
            backgroundColor: 'var(--dk-surface-raised)',
            boxShadow: 'var(--dk-shadow-dialog)',
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <Sparkles className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <h4 className="text-sm font-semibold text-foreground">
              {availableVersion ? `Otix v${availableVersion} Ready` : 'Update Downloaded'}
            </h4>
            <p className="text-xs text-muted-foreground">
              Restart to apply the latest improvements and features.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <DkButton
              size="sm"
              variant="primary"
              onClick={() => void installUpdate()}
              className="gap-1.5 rounded-xl px-3 text-xs font-semibold"
            >
              <span>Restart</span>
              <ArrowRight className="h-3 w-3" />
            </DkButton>

            <button
              type="button"
              onClick={dismissNotification}
              className="rounded-lg p-1.5 transition-colors text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
              aria-label="Dismiss update notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
};
