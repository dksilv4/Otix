import { AlertCircle } from 'lucide-react'
import { DkButton } from '@/components/ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'

export interface InstallerCancelModalProps {
  onConfirm: () => void
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  open?: boolean
  isOpen?: boolean
  isExiting?: boolean
}

export const InstallerCancelModal = ({
  onConfirm,
  onClose,
  onOpenChange,
  open,
  isOpen,
  isExiting = false,
}: InstallerCancelModalProps) => {
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting

  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      className="max-w-sm select-none space-y-4"
    >
      <div className="flex items-start gap-3.5 pr-8">
        <div className="p-3 rounded-2xl bg-destructive/15 text-destructive shrink-0">
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

      <div
        className="flex items-center justify-end gap-2.5 pt-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <DkButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Continue Setup
        </DkButton>
        <DkButton
          type="button"
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          className="text-xs px-4 rounded-xl cursor-pointer"
        >
          Exit Installer
        </DkButton>
      </div>
    </DkDialog>
  )
};
