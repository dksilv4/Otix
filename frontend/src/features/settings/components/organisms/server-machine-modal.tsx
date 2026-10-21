import type { UserServerMachine, UserHome } from '../../types/server-machines'
import type { GameServer } from '@/features/downloads/types'
import { CreateServerMachineModal } from './create-server-machine-modal'
import { EditServerMachineModal } from './edit-server-machine-modal'

export { CreateServerMachineModal, EditServerMachineModal }
export type { CreateServerMachineModalProps } from './create-server-machine-modal'
export type { EditServerMachineModalProps } from './edit-server-machine-modal'

export interface ServerMachineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: UserServerMachine | null
  homes: UserHome[]
  nodes: GameServer[]
  defaultHomeId?: number | null
  onSuccess?: () => void
  onDelete?: (server: UserServerMachine) => void
}

export const ServerMachineModal = ({
  open,
  onOpenChange,
  server,
  homes,
  nodes,
  defaultHomeId,
  onSuccess,
  onDelete,
}: ServerMachineModalProps) => {
  if (server) {
    return (
      <EditServerMachineModal
        open={open}
        onOpenChange={onOpenChange}
        server={server}
        homes={homes}
        nodes={nodes}
        onSuccess={onSuccess}
        onDelete={onDelete}
      />
    )
  }

  return (
    <CreateServerMachineModal
      open={open}
      onOpenChange={onOpenChange}
      homes={homes}
      nodes={nodes}
      defaultHomeId={defaultHomeId}
      onSuccess={onSuccess}
    />
  )
}
