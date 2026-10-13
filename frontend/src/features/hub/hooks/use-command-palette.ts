import { useCallback, useEffect, useState } from 'react'
import { COMMAND_PALETTE_EVENT } from '../open-command-palette'

/**
 * Global Cmd+K / Ctrl+K toggle for the command palette.
 * One mount (see CommandPaletteMount) owns this; do not call from many places.
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    const onCustomOpen = () => setIsOpen(true)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(COMMAND_PALETTE_EVENT, onCustomOpen)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(COMMAND_PALETTE_EVENT, onCustomOpen)
    }
  }, [toggle])

  return { isOpen, open, close, toggle }
}
