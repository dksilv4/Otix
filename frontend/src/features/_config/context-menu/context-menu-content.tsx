import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ContextMenuItem } from './context-menu-item'
import { ContextMenuSeparator } from './context-menu-separator'
import { ContextMenuSub } from './context-menu-sub'
import { useMenuContext } from './context-menu-context'
import type { ContextMenuItemDef } from './types'

interface ContextMenuContentProps {
  items: ContextMenuItemDef[]
  isSubmenu?: boolean
  onRequestClose?: () => void
  parentRef?: React.RefObject<HTMLDivElement | null>
}

export const ContextMenuContent = ({ items, isSubmenu, onRequestClose }: ContextMenuContentProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null)
  const { close } = useMenuContext()

  const handleClose = onRequestClose ?? close

  const flatItems = useMemo(
    () => items.filter((i): i is ContextMenuItemDef & { subItems?: ContextMenuItemDef[] } => !i.separator),
    [items],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabled = flatItems.filter((i) => !i.disabled)
      if (!enabled.length) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const curIdx = enabled.indexOf(flatItems[focusedIdx])
          const next = (curIdx + 1) % enabled.length
          setFocusedIdx(flatItems.indexOf(enabled[next]))
          setOpenSubIdx(null)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const curIdx = enabled.indexOf(flatItems[focusedIdx])
          const prev = (curIdx - 1 + enabled.length) % enabled.length
          setFocusedIdx(flatItems.indexOf(enabled[prev]))
          setOpenSubIdx(null)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const item = flatItems[focusedIdx]
          if (item?.subItems?.length) {
            setOpenSubIdx(focusedIdx)
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          if (isSubmenu) handleClose()
          break
        }
        case 'Enter':
        case ' ': {
          e.preventDefault()
          const item = flatItems[focusedIdx]
          if (item && !item.disabled) {
            handleClose()
            item.onClick?.()
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          handleClose()
          break
        }
      }
    },
    [flatItems, focusedIdx, isSubmenu, handleClose],
  )

  // Focus panel on mount
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Auto-hide on click outside
  useEffect(() => {
    if (isSubmenu) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    // Delay adding listener so same-click doesn't close immediately
    const raf = requestAnimationFrame(() => document.addEventListener('mousedown', handler))
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handler)
    }
  }, [isSubmenu, handleClose])

  return (
    <motion.div
      ref={panelRef}
      role="menu"
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={handleKeyDown}
      className="flex min-w-[180px] max-w-[320px] flex-col gap-0.5 rounded-[1.25rem] p-1.5 backdrop-blur-2xl outline-none"
      style={{
        backgroundColor: 'var(--dk-surface-overlay)',
        boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px rgba(255,255,255,0.06)',
        maxHeight: 'min(480px, 85vh)',
        overflowY: 'auto',
      }}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return <ContextMenuSeparator key={`sep-${idx}`} />
        }
        if (item.subItems?.length) {
          return (
            <ContextMenuSub
              key={item.id}
              item={item}
              isOpen={openSubIdx === idx}
              onToggle={(open) => setOpenSubIdx(open ? idx : null)}
              parentRef={panelRef}
              parentItemRef={undefined}
            />
          )
        }
        return (
          <ContextMenuItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            shortcut={item.shortcut}
            disabled={item.disabled}
            destructive={item.destructive}
            checked={item.checked}
            onClick={() => {
              handleClose()
              item.onClick?.()
            }}
            hasSubMenu={false}
            onPointerEnter={() => setFocusedIdx(idx)}
          />
        )
      })}
    </motion.div>
  )
}
