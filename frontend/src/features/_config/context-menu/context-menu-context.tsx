import { createContext, useState, useCallback, type ReactNode } from 'react'
import type {
  ContextMenuItemDef,
  ContextMenuPosition,
  ContextMenuMediaType,
  ContextMenuTargetType,
  ContextMenuActions,
  ContextMenuContextValue,
} from './types'

export type { ContextMenuContextValue }

export const ContextMenuCtx = createContext<ContextMenuContextValue | null>(null)

export const ContextMenuProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<ContextMenuPosition | null>(null)
  const [items, setItems] = useState<ContextMenuItemDef[]>([])
  const [mediaType, setMediaType] = useState<ContextMenuMediaType | null>(null)
  const [targetType, setTargetType] = useState<ContextMenuTargetType | null>(null)
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  const open = useCallback<ContextMenuActions['open']>((e, items, options) => {
    e.preventDefault()
    const point = e.touches?.length
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY }
    setPosition(point)
    setItems(items)
    setMediaType(options?.mediaType ?? null)
    setTargetType(options?.targetType ?? (options?.mediaType as ContextMenuTargetType | undefined) ?? null)
    setData(options?.data ?? null)
    setIsOpen(true)
  }, [])

  const close = useCallback<ContextMenuActions['close']>(() => {
    setIsOpen(false)
    setPosition(null)
    setItems([])
    setMediaType(null)
    setTargetType(null)
    setData(null)
  }, [])

  return (
    <ContextMenuCtx.Provider
      value={{ isOpen, position, items, mediaType, targetType, data, open, close }}
    >
      {children}
    </ContextMenuCtx.Provider>
  )
};

export { useOptionalMenuContext, useMenuContext } from './hooks/use-menu-context'
