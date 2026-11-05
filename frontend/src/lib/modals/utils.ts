import type { ReactNode } from 'react'

export const openBoundModal = (
  openModal: (component: ReactNode) => () => void,
  render: (onClose: () => void) => ReactNode,
): void => {
  const closeRef = { current: () => {} }
  closeRef.current = openModal(render(() => closeRef.current()))
}
