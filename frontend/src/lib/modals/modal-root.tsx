import { createPortal } from 'react-dom'
import { isValidElement, cloneElement } from 'react'
import { useModal } from './modal-context'

export function ModalRoot() {
  const { modals } = useModal()

  if (modals.length === 0) return null

  return createPortal(
    modals.map((m) => {
      const child = isValidElement(m.component)
        ? cloneElement(m.component as React.ReactElement<{ isExiting?: boolean }>, {
            isExiting: m.exiting,
          })
        : m.component

      return <div key={m.id}>{child}</div>
    }),
    document.body,
  )
}
