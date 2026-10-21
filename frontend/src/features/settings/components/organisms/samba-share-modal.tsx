import type { UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import { CreateSambaShareModal } from './create-samba-share-modal'
import { EditSambaShareModal } from './edit-samba-share-modal'

export { CreateSambaShareModal, EditSambaShareModal }
export type { CreateSambaShareModalProps } from './create-samba-share-modal'
export type { EditSambaShareModalProps } from './edit-samba-share-modal'

export interface SambaShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  samba?: SambaShareConfig | null
  serverMachines: UserServerMachine[]
  onSaveCustom?: (config: SambaShareConfig) => void
  onDeleteCustom?: (id: string) => void
  initialServerId?: number | null
}

export const SambaShareModal = ({
  open,
  onOpenChange,
  samba,
  serverMachines,
  onSaveCustom,
  onDeleteCustom,
  initialServerId,
}: SambaShareModalProps) => {
  if (samba) {
    return (
      <EditSambaShareModal
        open={open}
        onOpenChange={onOpenChange}
        samba={samba}
        serverMachines={serverMachines}
        onSaveCustom={onSaveCustom}
        onDeleteCustom={onDeleteCustom}
      />
    )
  }

  return (
    <CreateSambaShareModal
      open={open}
      onOpenChange={onOpenChange}
      serverMachines={serverMachines}
      onSaveCustom={onSaveCustom}
      initialServerId={initialServerId}
    />
  )
}
