import { ShieldAlert } from 'lucide-react'
import type { PermissionRequest } from '../../hooks/use-plugin-permissions'
import { getPermissionDescription } from '../../utils/permissions'
import { DkDialog } from '@ui/molecules/dialog'

export interface PluginPermissionModalProps {
  request: PermissionRequest
  open?: boolean
  isOpen?: boolean
  onAllowOnce: (requestId: string) => void
  onAllowAlways: (requestId: string) => void
  onDeny: (requestId: string) => void
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  isExiting?: boolean
}

export const PluginPermissionModal = ({
  request,
  open,
  isOpen,
  onAllowOnce,
  onAllowAlways,
  onDeny,
  onClose,
  onOpenChange,
  isExiting,
}: PluginPermissionModalProps) => {
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting

  const handleDeny = () => {
    onDeny(request.requestId)
    onClose?.()
    onOpenChange?.(false)
  }

  const handleAllowOnce = () => {
    onAllowOnce(request.requestId)
    onClose?.()
    onOpenChange?.(false)
  }

  const handleAllowAlways = () => {
    onAllowAlways(request.requestId)
    onClose?.()
    onOpenChange?.(false)
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleDeny()
      }}
      className="max-w-md p-6 sm:p-8"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-6 pr-8">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
        >
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">Permission Request</h2>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{request.pluginName}</span> needs your permission
          </p>
        </div>
      </div>

      {/* Permission badge */}
      <div className="mb-6">
        <div
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono font-medium bg-primary/10 text-primary"
        >
          {request.permission}
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <p className="text-sm text-foreground leading-relaxed">
          {getPermissionDescription(request.permission)}
        </p>
        {request.reason && (
          <p className="text-xs text-muted-foreground mt-2 italic leading-relaxed">
            &ldquo;{request.reason}&rdquo;
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          type="button"
          onClick={handleDeny}
          className="flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap h-10 rounded-xl px-4 text-sm font-medium hover:bg-[var(--dk-surface-hover)] text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97] cursor-pointer"
        >
          Deny
        </button>

        <button
          type="button"
          onClick={handleAllowOnce}
          className="flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap h-10 rounded-xl px-4 text-sm font-medium hover:bg-[var(--dk-surface-hover)] text-foreground border border-[var(--dk-separator)] transition-colors active:scale-[0.97] cursor-pointer"
        >
          Allow Once
        </button>

        <button
          type="button"
          onClick={handleAllowAlways}
          className="flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap h-10 rounded-xl px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-[0.97] cursor-pointer"
        >
          Always Allow
        </button>
      </div>
    </DkDialog>
  )
};
