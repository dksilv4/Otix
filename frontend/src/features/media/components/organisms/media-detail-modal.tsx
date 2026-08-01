import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MediaDetail } from './media-detail'

export function MediaDetailModal() {
  const [isOpen, setIsOpen] = useState(true)

  const handleClose = () => {
    setIsOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden' // Lock background scrolling
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-end justify-center">
          {/* Slide-up sheet panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="relative w-full max-w-5xl overflow-hidden"
            style={{
              height: 'calc(100vh - .75rem)', // leaves navigation/title bar visible at the top
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Floating toolbar — grab handle + close, overlaid on content like a title bar */}
            <div className="glass-card max-w-4xl justify-self-center w-4xl rounded-3xl p-4 absolute top-0 left-0 right-0 z-20 flex items-center justify-center ">
              <div
                className="h-1.5 w-12 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                onClick={handleClose}
              />
              <button
                type="button"
                onClick={handleClose}
                className="glass-card absolute right-5 top-1/2 -translate-y-1/2 rounded-xl p-1.5 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-white"
                aria-label="Close details"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scrollable Media Detail Content */}
            <div className="flex-1 top-20 sticky bg-[var(--background)]/90 overflow-y-auto overscroll-y-contain scrollbar-none px-4"

            >
              <MediaDetail />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
