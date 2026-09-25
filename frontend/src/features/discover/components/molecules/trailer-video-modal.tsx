import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Clapperboard, X } from 'lucide-react'

interface TrailerVideoModalProps {
  youtubeId: string
  title: string
  isExiting?: boolean
  onClose: () => void
}

export function TrailerVideoModal({ youtubeId, title, isExiting, onClose }: TrailerVideoModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const visible = !isExiting

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-4xl rounded-3xl sm:rounded-[32px] overflow-hidden border border-white/10 bg-black shadow-2xl group isolate"
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: visible ? 1 : 0.94, opacity: visible ? 1 : 0, y: visible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle gradient vignette at top for controls readability */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none z-10 rounded-t-3xl sm:rounded-t-[32px]" />

          {/* Floating Otix controls */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            {/* Title pill */}
            <div className="flex h-9 items-center gap-2 pl-2 pr-3.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl shadow-lg pointer-events-auto">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-red-400">
                <Clapperboard className="h-3 w-3" />
              </span>
              <span className="truncate text-xs sm:text-sm font-medium text-white/90 max-w-[200px] sm:max-w-md">
                {title ? `${title} — Trailer` : 'Trailer'}
              </span>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 hover:bg-white/15 backdrop-blur-xl text-white/80 hover:text-white shadow-lg transition-all pointer-events-auto"
              aria-label="Close trailer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* YouTube embed */}
          <div className="relative aspect-video bg-black overflow-hidden rounded-3xl sm:rounded-[32px]">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&controls=0&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&origin=${encodeURIComponent(window.location.origin)}`}
              title={title ? `${title} trailer` : 'Trailer'}
              className="w-full h-full scale-[1.4] origin-center"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
