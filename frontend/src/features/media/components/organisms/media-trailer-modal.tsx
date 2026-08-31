import { useEffect, useState } from 'react'
import { Clapperboard, X } from 'lucide-react'
import { motion } from 'framer-motion'

interface MediaTrailerModalProps {
  /** Full YouTube embed src (e.g. https://www.youtube-nocookie.com/embed/ID?rel=0&autoplay=1) */
  embedSrc: string
  title?: string
  isExiting?: boolean
  onClose: () => void
}

export function MediaTrailerModal({ embedSrc, title, isExiting, onClose }: MediaTrailerModalProps) {
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const visible = animateIn && !isExiting

  return (
    <motion.div
      className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} trailer` : 'Trailer'}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Glass player */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.94, y: visible ? 0 : 18 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="relative w-full max-w-4xl"
      >
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[var(--dk-surface-glass)] p-2.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-xl">
          {/* Title bar */}
          <div className="flex items-center justify-between gap-3 px-2 pb-2.5 pt-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-red-400">
                <Clapperboard className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-semibold text-white/85">
                {title ? `${title} — Trailer` : 'Trailer'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-white"
              aria-label="Close trailer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Player */}
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-[var(--dk-shadow-sm)]">
            <div className="relative aspect-video">
              <iframe
                src={embedSrc}
                title={title ? `${title} trailer` : 'Trailer'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
