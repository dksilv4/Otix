import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloating, offset, flip, shift, size } from '@floating-ui/react'
import { AnimatePresence } from 'framer-motion'
import { ContextMenuContent } from './context-menu-content'
import { useMenuContext } from './context-menu-context'

export function ContextMenuPortal() {
  const { isOpen, position, items, close } = useMenuContext()
  const [ready, setReady] = useState(false)

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8 }),
      size({
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.min(availableHeight, 400)}px`,
            overflowY: 'auto',
          })
        },
      }),
    ],
  })

  // Set virtual element from position
  useEffect(() => {
    if (!isOpen || !position) return
    setReady(false)

    const virtualEl = {
      getBoundingClientRect() {
        return {
          width: 0,
          height: 0,
          x: position.x,
          y: position.y,
          top: position.y,
          right: position.x,
          bottom: position.y,
          left: position.x,
        }
      },
    }

    refs.setReference(virtualEl)
    requestAnimationFrame(() => setReady(true))
  }, [isOpen, position, refs])

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return
    const handler = () => close()
    window.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('wheel', handler, { passive: true })
    return () => {
      window.removeEventListener('scroll', handler)
      window.removeEventListener('wheel', handler)
    }
  }, [isOpen, close])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && ready && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-[99999]"
        >
          <ContextMenuContent items={items} />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
