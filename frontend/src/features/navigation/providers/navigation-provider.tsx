import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { NavigationContext } from '../hooks/use-navigation'

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
