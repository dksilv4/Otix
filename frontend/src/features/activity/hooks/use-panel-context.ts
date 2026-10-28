import { useContext } from 'react'
import { PanelContext, defaultPanelContext, type PanelContextValue } from '../providers/panel-context'

/**
 * Hook to access the activity panel layout context.
 */
export const usePanelContext = (): PanelContextValue => {
  const ctx = useContext(PanelContext)
  return ctx ?? defaultPanelContext
}
