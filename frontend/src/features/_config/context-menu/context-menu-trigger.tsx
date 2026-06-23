import { useCallback, useRef, type ReactNode, type MouseEvent, type TouchEvent } from 'react'
import { useMenuContext } from './context-menu-context'
import type { ContextMenuItemDef, ContextMenuMediaType } from './types'

interface ContextMenuTriggerProps {
  items: ContextMenuItemDef[]
  mediaType?: ContextMenuMediaType
  data?: Record<string, unknown>
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function ContextMenuTrigger({
  items,
  mediaType,
  data,
  children,
  className,
  disabled,
}: ContextMenuTriggerProps) {
  const { open } = useMenuContext()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressPos = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggered = useRef(false)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (disabled || !items.length) return
    e.preventDefault()
    open(e.nativeEvent, items, { mediaType, data })
  }, [disabled, items, mediaType, data, open])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || !items.length) return
    longPressTriggered.current = false
    const touch = e.touches[0]
    longPressPos.current = { x: touch.clientX, y: touch.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      const fakeEvent = {
        preventDefault: () => {},
        clientX: longPressPos.current!.x,
        clientY: longPressPos.current!.y,
      } as MouseEvent
      open(fakeEvent, items, { mediaType, data })
    }, 500)
  }, [disabled, items, mediaType, data, open])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!longPressPos.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - longPressPos.current.x)
    const dy = Math.abs(touch.clientY - longPressPos.current.y)
    if (dx > 10 || dy > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      longPressPos.current = null
      longPressTriggered.current = false
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressPos.current = null
    if (longPressTriggered.current) {
      longPressTriggered.current = false
    }
  }, [])

  return (
    <div
      className={className}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  )
}
