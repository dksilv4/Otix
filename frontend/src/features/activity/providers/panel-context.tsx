import { createContext, useContext, useState, type ReactNode } from 'react'

interface PanelContextValue {
  isUserMenuOpen: boolean
  setUserMenuOpen: (open: boolean) => void
  isChatOpen: boolean
  setChatOpen: (open: boolean) => void
}

export const PanelContext = createContext<PanelContextValue | null>(null)

const defaultPanelContext: PanelContextValue = {
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

export const usePanelContext = (): PanelContextValue => {
  const ctx = useContext(PanelContext)
  return ctx ?? defaultPanelContext
}
