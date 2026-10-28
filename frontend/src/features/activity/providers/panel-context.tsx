import { createContext, useState, type ReactNode } from 'react'

export interface PanelContextValue {
  isUserMenuOpen: boolean
  setUserMenuOpen: (open: boolean) => void
  isChatOpen: boolean
  setChatOpen: (open: boolean) => void
}

export const PanelContext = createContext<PanelContextValue | null>(null)

export const defaultPanelContext: PanelContextValue = {
  isUserMenuOpen: false,
  setUserMenuOpen: () => {},
  isChatOpen: false,
  setChatOpen: () => {},
}

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
