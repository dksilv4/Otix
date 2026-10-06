import { createContext, useContext, useState, type ReactNode } from 'react'

interface PanelContextValue {
  isUserMenuOpen: boolean
  setUserMenuOpen: (open: boolean) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export const PanelProvider = ({ children }: { children: ReactNode }) => {
  const [isUserMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <PanelContext.Provider value={{ isUserMenuOpen, setUserMenuOpen }}>
      {children}
    </PanelContext.Provider>
  )
};

export const usePanelContext = (): PanelContextValue => {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanelContext must be used within PanelProvider')
  return ctx
}
