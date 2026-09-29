import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LightboxScreenshot {
  url: string
  width?: number | null
  height?: number | null
}

interface MediaScreenshotLightboxModalProps {
  screenshots: LightboxScreenshot[]
  initialIndex?: number
  onClose: () => void
  isExiting?: boolean
}

export function MediaScreenshotLightboxModal({
  screenshots,
  initialIndex = 0,
  onClose,
  isExiting,
}: MediaScreenshotLightboxModalProps) {
  const [index, setIndex] = useState(
    Math.max(0, Math.min(initialIndex, screenshots.length - 1)),
  )
  const [animateIn, setAnimateIn] = useState(false)
  const thumbScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  const handlePrev = useCallback(() => {
    setIndex((prev) => (prev > 0 ? prev - 1 : prev))
  }, [])

  const handleNext = useCallback(() => {
    setIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : prev))
  }, [screenshots.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrev, handleNext, onClose])

  // Scroll active thumbnail into view
  useEffect(() => {
    const container = thumbScrollRef.current
    if (!container) return
    const activeEl = container.children[index] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [index])

  if (screenshots.length === 0) return null

  const current = screenshots[index]
  const visible = animateIn && !isExiting

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[var(--dk-z-modal,10000)] flex flex-col justify-between bg-black/90 backdrop-blur-xl p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="flex items-center justify-between w-full max-w-7xl mx-auto z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[var(--dk-surface-glass)] px-3.5 py-1.5 shadow-md">
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {index + 1}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {screenshots.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[var(--dk-surface-glass)] text-muted-foreground transition-all hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
          aria-label="Close fullscreen preview"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Center Image with navigation arrows */}
      <div
        className="relative flex-1 flex items-center justify-center min-h-0 my-2"
        onClick={(e) => e.stopPropagation()}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-muted-foreground transition-all hover:scale-105 hover:bg-black/80 hover:text-foreground active:scale-95 shadow-lg backdrop-blur-md"
            aria-label="Previous screenshot"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div className="relative flex items-center justify-center max-h-full max-w-full">
          <AnimatePresence mode="wait">
            <motion.img
              key={current.url}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              src={current.url}
              alt={`Screenshot ${index + 1}`}
              className="max-h-[74vh] max-w-[92vw] sm:max-w-[85vw] object-contain rounded-2xl border border-white/10 shadow-2xl"
            />
          </AnimatePresence>
        </div>

        {index < screenshots.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-muted-foreground transition-all hover:scale-105 hover:bg-black/80 hover:text-foreground active:scale-95 shadow-lg backdrop-blur-md"
            aria-label="Next screenshot"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      <div
        className="w-full max-w-3xl mx-auto z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={thumbScrollRef}
          className="flex items-center gap-2 overflow-x-auto py-2 px-1 scrollbar-none justify-start sm:justify-center"
        >
          {screenshots.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'relative aspect-video h-12 sm:h-14 shrink-0 rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer',
                i === index
                  ? 'border-primary ring-2 ring-primary/40 scale-105 shadow-md shadow-primary/20 opacity-100'
                  : 'border-white/10 opacity-50 hover:opacity-90 hover:border-white/30',
              )}
              aria-label={`Jump to screenshot ${i + 1}`}
            >
              <img src={s.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
