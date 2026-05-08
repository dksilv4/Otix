import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NavigationContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider')
  return ctx
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return (
    <NavigationContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </NavigationContext.Provider>
  )
}
