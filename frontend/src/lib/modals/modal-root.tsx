import { createPortal } from 'react-dom'
import { isValidElement, cloneElement, Component, type ReactNode } from 'react'
import { useModal } from './modal-context'

class ModalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('Modal failed to render:', error)
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export function ModalRoot() {
  const { modals, closeModal } = useModal()

  if (modals.length === 0) return null

  return createPortal(
    modals.map((m) => {
      const child = isValidElement(m.component)
        ? cloneElement(m.component as React.ReactElement<{ isExiting?: boolean; onClose?: () => void }>, {
            isExiting: m.exiting,
            onClose: (m.component as any).props?.onClose ?? (() => closeModal(m.id)),
          })
        : m.component

      return (
        <ModalErrorBoundary key={m.id}>
          <div>{child}</div>
        </ModalErrorBoundary>
      )
    }),
    document.body,
  )
}
