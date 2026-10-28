import { useContext } from 'react'
import { ModalContext } from '../modal-context'

/**
 * Access the modal framework context to open and close dialogs.
 */
export const useModal = () => {
  return useContext(ModalContext)
}
