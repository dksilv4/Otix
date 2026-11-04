import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useModal } from '@/lib/modals'

interface Screenshot {
  url: string
  width?: number
  height?: number
  provider?: string
}

interface LauncherScreenshotGalleryProps {
  screenshots: Screenshot[]
  onHoverScreenshot?: (url: string | null) => void
  autoPlay?: boolean
}

interface ScreenshotLightboxModalProps {
  screenshots: Screenshot[]
  initialIndex: number
  onClose: () => void
}

const ScreenshotLightboxModal = ({ screenshots, initialIndex, onClose }: ScreenshotLightboxModalProps) => {
  const [lightboxIdx, setLightboxIdx] = useState(initialIndex)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && lightboxIdx > 0) {
        setLightboxIdx((s) => s - 1)
      } else if (e.key === 'ArrowRight' && lightboxIdx < screenshots.length - 1) {
        setLightboxIdx((s) => s + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIdx, screenshots.length, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[10005] bg-background/95 backdrop-blur-2xl flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center transition-colors cursor-pointer z-10 text-foreground"
      >
        <X size={18} />
      </button>

      {lightboxIdx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setLightboxIdx((s) => s - 1) }}
          className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center transition-colors cursor-pointer z-10 text-foreground"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.img
          key={lightboxIdx}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          src={screenshots[lightboxIdx].url}
          alt={`Screenshot ${lightboxIdx + 1}`}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </AnimatePresence>

      {lightboxIdx < screenshots.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setLightboxIdx((s) => s + 1) }}
          className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center transition-colors cursor-pointer z-10 text-foreground"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        {screenshots.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
            className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
              i === lightboxIdx ? 'bg-primary scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </motion.div>
  )
};

export const LauncherScreenshotGallery = ({ screenshots, onHoverScreenshot, autoPlay = true }: LauncherScreenshotGalleryProps) => {
  const { openModal } = useModal()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const pausedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Filter out any icon or poster images that might be included in screenshots
  const validScreenshots = screenshots.filter((s) => {
    if (!s?.url) return false
    const lower = s.url.toLowerCase()
    return (
      !lower.includes('icon') &&
      !lower.includes('poster') &&
      !lower.includes('cover') &&
      !lower.includes('logo')
    )
  })

  // Auto-cycle screenshots
  useEffect(() => {
    if (validScreenshots.length <= 1 || !autoPlay) return

    const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return
        setActiveIdx((prev) => {
          const next = (prev + 1) % validScreenshots.length
          onHoverScreenshot?.(validScreenshots[next].url)
          return next
        })
      }, 5000)
    }

    startTimer()
    // Fire the first one immediately
    onHoverScreenshot?.(validScreenshots[0].url)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validScreenshots.length, autoPlay])

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const child = container.children[activeIdx] as HTMLElement | undefined
    if (child) {
      child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeIdx])

  if (validScreenshots.length === 0) return null

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const container = scrollRef.current
      const scrollAmount = container.clientWidth
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  const handleOpenLightbox = (index: number) => {
    const close = openModal(
      <ScreenshotLightboxModal
        screenshots={validScreenshots}
        initialIndex={index}
        onClose={() => close()}
      />
    )
  }

  const handleThumbEnter = (idx: number) => {
    pausedRef.current = true
    setActiveIdx(idx)
    onHoverScreenshot?.(validScreenshots[idx]?.url)
  }

  const handleThumbLeave = () => {
    pausedRef.current = false
    onHoverScreenshot?.(null)
  }

  return (
    <div className="w-full" onMouseLeave={handleThumbLeave}>
      <div className="flex items-center gap-3">
        {validScreenshots.length > 5 && (
          <button
            onClick={() => handleScroll('left')}
            className="shrink-0 w-9 h-[72px] rounded-xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center transition-all cursor-pointer shadow-lg text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex-1 flex gap-3 overflow-x-auto scrollbar-none scroll-smooth py-1 snap-x snap-mandatory"
        >
          {validScreenshots.map((shot, idx) => (
            <button
              key={`${shot.url}-${idx}`}
              onClick={() => handleOpenLightbox(idx)}
              onMouseEnter={() => handleThumbEnter(idx)}
              onMouseLeave={handleThumbLeave}
              className={`shrink-0 rounded-xl overflow-hidden transition-all duration-300 cursor-pointer group relative shadow-md hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 aspect-video snap-start ${
                idx === activeIdx
                  ? 'border-2 border-primary shadow-[var(--dk-shadow-glass)]'
                  : 'border border-[var(--dk-separator)] hover:border-foreground/30'
              }`}
              style={{ width: 'calc((100% - 48px) / 5)' }}
            >
              <img
                src={shot.url}
                alt={`Screenshot ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                loading="lazy"
              />
              {/* Gloss reflection sheen */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-foreground/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
            </button>
          ))}
        </div>

        {validScreenshots.length > 5 && (
          <button
            onClick={() => handleScroll('right')}
            className="shrink-0 w-9 h-[72px] rounded-xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] flex items-center justify-center transition-all cursor-pointer shadow-lg text-foreground"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
};
