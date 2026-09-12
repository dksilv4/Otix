import { useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { NavigationContext } from '../hooks/use-navigation'
import {
  NavPillsContext,
  computePillsVisibility,
  type NavPillsConfig,
} from '../hooks/use-nav-pills-visibility'

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [override, setOverride] = useState<NavPillsConfig | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const { showLeft, showRight } = useMemo(
    () => computePillsVisibility(location.pathname, override),
    [location.pathname, override]
  )

  return (
    <NavigationContext.Provider value={{ isOpen, open, close, toggle }}>
      <NavPillsContext.Provider value={{ showLeft, showRight, setOverride }}>
        {children}
      </NavPillsContext.Provider>
    </NavigationContext.Provider>
  )
}
