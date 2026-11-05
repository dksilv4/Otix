import { useContext } from 'react'
import { PanelContext, type PanelContextValue } from '../providers/panel-context'

export const defaultPanelContext: PanelContextValue = {
  isUserMenuOpen: false,
  setUserMenuOpen: () => {},
  isChatOpen: false,
  setChatOpen: () => {},
}

/**
 * Hook to access the activity panel layout context.
 */
export const usePanelContext = (): PanelContextValue => {
  const ctx = useContext(PanelContext)
  return ctx ?? defaultPanelContext
}
