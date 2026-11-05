import { useContext } from 'react'
import { ContextMenuCtx } from '../context-menu-context'
import type { ContextMenuContextValue } from '../types'

export const useOptionalMenuContext = (): ContextMenuContextValue | null => {
  return useContext(ContextMenuCtx)
}

export const useMenuContext = (): ContextMenuContextValue => {
  const ctx = useContext(ContextMenuCtx)
  if (!ctx) throw new Error('useMenuContext must be used within ContextMenuProvider')
  return ctx
}
