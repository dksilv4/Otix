import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'

export interface DisconnectNodeDialogProps {
  nodeToDelete: { id: number; name: string } | null
  onClose: () => void
  isPending: boolean
  onConfirm: (id: number, name: string) => void
}

export const DisconnectNodeDialog = ({
  nodeToDelete,
  onClose,
  isPending,
  onConfirm,
}: DisconnectNodeDialogProps) => {
  if (!nodeToDelete) return null

  return (
    <DkDialog
      open={Boolean(nodeToDelete)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Disconnect Node"
      description={`Are you sure you want to disconnect ${nodeToDelete.name}?`}
    >
      <div className="space-y-4 pt-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          This node will be removed from your account. Any active downloads will be stopped and you will need to re-claim or add the node again to reconnect.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onClose}
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="destructive"
            size="sm"
            loading={isPending}
            onClick={() => onConfirm(nodeToDelete.id, nodeToDelete.name)}
          >
            Disconnect Node
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
