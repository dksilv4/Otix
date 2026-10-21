import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ContextMenuItem } from './context-menu-item'
import { useMenuContext } from './context-menu-context'
import type { ContextMenuItemDef } from './types'

interface ContextMenuSubProps {
  item: ContextMenuItemDef
  isOpen: boolean
  onToggle: (open: boolean) => void
  parentRef?: React.RefObject<HTMLDivElement | null>
  parentItemRef?: React.RefObject<HTMLButtonElement | null>
}

export const ContextMenuSub = ({ item, isOpen, onToggle, parentRef }: ContextMenuSubProps) => {
  const subRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const [subPos, setSubPos] = useState<'right' | 'left'>('right')
  const { close } = useMenuContext()

  // Determine if submenu should flip to left
  useEffect(() => {
    if (!isOpen || !parentRef?.current) return
    const parentRect = parentRef.current.getBoundingClientRect()
    const rightEdge = parentRect.right + 200
    setSubPos(rightEdge > window.innerWidth ? 'left' : 'right')
  }, [isOpen, parentRef])

  // Close submenu on pointer leave
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePointerEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onToggle(true)
  }

  const handlePointerLeave = () => {
    timerRef.current = setTimeout(() => onToggle(false), 150)
  }

  return (
    <div
      className="relative"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ContextMenuItem
        ref={itemRef}
        label={item.label}
        icon={item.icon}
        disabled={item.disabled}
        hasSubMenu
        onPointerEnter={() => onToggle(true)}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={subRef}
            initial={{ opacity: 0, x: subPos === 'right' ? -4 : 4, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: subPos === 'right' ? -4 : 4, scale: 0.96 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 z-50 min-w-[160px] rounded-[1.25rem] p-1.5 backdrop-blur-2xl"
            style={{
              [subPos === 'right' ? 'left' : 'right']: 'calc(100% - 4px)',
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex flex-col gap-0.5">
              {item.subItems?.map((sub) => (
                <ContextMenuItem
                  key={sub.id}
                  label={sub.label}
                  icon={sub.icon}
                  shortcut={sub.shortcut}
                  disabled={sub.disabled}
                  destructive={sub.destructive}
                  onClick={() => {
                    close()
                    sub.onClick?.()
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
};
