import type { ReactNode } from 'react'

export interface ModalInstance {
  id: string
  component: ReactNode
  exiting: boolean
}

export interface ModalContextValue {
  modals: ModalInstance[]
  openModal: (component: ReactNode) => () => void
  closeModal: (id: string) => void
  closeAll: () => void
}
