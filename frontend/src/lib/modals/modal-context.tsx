import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export interface ModalInstance {
  id: string
  component: ReactNode
  exiting: boolean
}

interface ModalContextValue {
  modals: ModalInstance[]
  openModal: (component: ReactNode) => () => void
  closeModal: (id: string) => void
  closeAll: () => void
}

const ModalContext = createContext<ModalContextValue>({
  modals: [],
  openModal: () => () => {},
  closeModal: () => {},
  closeAll: () => {},
})

const EXIT_DURATION = 0
let nextId = 0

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<ModalInstance[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id))
    timersRef.current.delete(id)
  }, [])

  const openModal = useCallback((component: ReactNode) => {
    const id = String(++nextId)
    setModals((prev) => [...prev, { id, component, exiting: false }])

    return () => {
      // Mark exiting first
      setModals((prev) => prev.map((m) => (m.id === id ? { ...m, exiting: true } : m)))

      // Remove after animation
      const timer = setTimeout(() => removeModal(id), EXIT_DURATION)
      timersRef.current.set(id, timer)
    }
  }, [removeModal])

  const closeModal = useCallback((id: string) => {
    setModals((prev) => prev.map((m) => (m.id === id ? { ...m, exiting: true } : m)))
    const timer = setTimeout(() => removeModal(id), EXIT_DURATION)
    timersRef.current.set(id, timer)
  }, [removeModal])

  const closeAll = useCallback(() => {
    setModals((prev) => prev.map((m) => ({ ...m, exiting: true })))
    const timer = setTimeout(() => setModals([]), EXIT_DURATION)
    timersRef.current.set('__all__', timer)
  }, [])

  return (
    <ModalContext.Provider value={{ modals, openModal, closeModal, closeAll }}>
      {children}
    </ModalContext.Provider>
  )
}

export function useModal() {
  return useContext(ModalContext)
}
