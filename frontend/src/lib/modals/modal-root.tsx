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

export const ModalRoot = () => {
  const { modals, closeModal } = useModal()

  if (modals.length === 0) return null

  return createPortal(
    modals.map((m) => {
      const childProps = isValidElement(m.component)
        ? ((m.component as any).props as Record<string, any> | undefined)
        : undefined

      const handleClose = () => {
        childProps?.onClose?.()
        closeModal(m.id)
      }

      const handleOpenChange = (open: boolean) => {
        childProps?.onOpenChange?.(open)
        if (!open) {
          closeModal(m.id)
        }
      }

      const child = isValidElement(m.component)
        ? cloneElement(
            m.component as React.ReactElement<{
              open?: boolean
              isOpen?: boolean
              isExiting?: boolean
              onClose?: () => void
              onOpenChange?: (open: boolean) => void
            }>,
            {
              open: !m.exiting,
              isOpen: !m.exiting,
              isExiting: m.exiting,
              onClose: handleClose,
              onOpenChange: handleOpenChange,
            },
          )
        : m.component

      return (
        <ModalErrorBoundary key={m.id}>
          <div>{child}</div>
        </ModalErrorBoundary>
      )
    }),
    document.body,
  )
};
