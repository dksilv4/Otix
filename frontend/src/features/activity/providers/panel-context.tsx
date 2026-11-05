import { createContext, useState, type ReactNode } from 'react'
import type { PanelContextValue } from '../types'

export type { PanelContextValue }

export const PanelContext = createContext<PanelContextValue | null>(null)

export const PanelProvider = ({ children }: { children: ReactNode }) => {
  const [isUserMenuOpen, setUserMenuOpen] = useState(false)
  const [isChatOpen, setChatOpen] = useState(false)

  return (
    <PanelContext.Provider
      value={{
        isUserMenuOpen,
        setUserMenuOpen,
        isChatOpen,
        setChatOpen,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
};

export { usePanelContext } from '../hooks/use-panel-context'
