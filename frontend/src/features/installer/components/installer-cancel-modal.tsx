import { AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DkButton } from '@/components/ui/atoms/button'

interface InstallerCancelModalProps {
  onConfirm: () => void
  onClose: () => void
  isExiting?: boolean
}

export const InstallerCancelModal = ({
  onConfirm,
  onClose,
  isExiting = false,
}: InstallerCancelModalProps) => {
  return (
    <AnimatePresence>
      {!isExiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-sm rounded-2xl bg-[var(--dk-surface-root)]/95 border border-white/[0.08] p-5 shadow-2xl z-10 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-destructive/15 text-destructive shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Cancel Installation?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Otix is not completely installed yet. If you exit now, installation will be cancelled.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Continue Setup
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={onConfirm}
                className="text-xs"
              >
                Exit Installer
              </DkButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
