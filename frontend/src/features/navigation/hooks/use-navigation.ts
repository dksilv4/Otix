import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface NavigationContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider')
  return ctx
}
