import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloating, offset, flip, shift, size } from '@floating-ui/react'
import { AnimatePresence } from 'framer-motion'
import { ContextMenuContent } from './context-menu-content'
import { useMenuContext } from './context-menu-context'

export const ContextMenuPortal = () => {
  const { isOpen, position, items, close } = useMenuContext()
  const [ready, setReady] = useState(false)

  const {
    refs,
    floatingStyles,
  } = useFloating({
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
  const { setReference, setFloating } = refs

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

    setReference(virtualEl)
    requestAnimationFrame(() => setReady(true))
  }, [isOpen, position, setReference])

  // Close on outside scroll or wheel (with 150ms settle delay to ignore inertia scroll events on smooth shelves)
  useEffect(() => {
    if (!isOpen) return
    const openedAt = Date.now()

    const handleScrollOrWheel = (e: Event) => {
      if (Date.now() - openedAt < 150) {
        return // Allow momentum/inertia scrolling to settle without closing menu
      }
      const floatingEl = refs.floating.current
      if (floatingEl && e.target instanceof Node && floatingEl.contains(e.target)) {
        return // Allow scrolling smoothly inside the context menu!
      }
      close()
    }
    window.addEventListener('scroll', handleScrollOrWheel, { capture: true, passive: true })
    window.addEventListener('wheel', handleScrollOrWheel, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScrollOrWheel, { capture: true })
      window.removeEventListener('wheel', handleScrollOrWheel)
    }
  }, [isOpen, close, refs.floating])

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
          ref={setFloating}
          style={floatingStyles}
          className="z-[99999]"
        >
          <ContextMenuContent items={items} />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
};
