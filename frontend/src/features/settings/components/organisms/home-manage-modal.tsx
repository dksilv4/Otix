import type { UserHome } from '../../types/server-machines'
import { CreateHomeModal } from './create-home-modal'
import { EditHomeModal } from './edit-home-modal'

export { CreateHomeModal, EditHomeModal }
export type { CreateHomeModalProps } from './create-home-modal'
export type { EditHomeModalProps } from './edit-home-modal'

export interface HomeManageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  home?: UserHome | null
  onSuccess?: () => void
  onDelete?: (home: UserHome) => void
}

export const HomeManageModal = ({
  open,
  onOpenChange,
  home,
  onSuccess,
  onDelete,
}: HomeManageModalProps) => {
  if (home) {
    return (
      <EditHomeModal
        open={open}
        onOpenChange={onOpenChange}
        home={home}
        onSuccess={onSuccess}
        onDelete={onDelete}
      />
    )
  }

  return (
    <CreateHomeModal
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  )
}
