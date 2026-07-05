import { useState, useEffect } from 'react'
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
}

interface ScreenshotLightboxModalProps {
  screenshots: Screenshot[]
  initialIndex: number
  onClose: () => void
}

function ScreenshotLightboxModal({ screenshots, initialIndex, onClose }: ScreenshotLightboxModalProps) {
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
      className="fixed inset-0 z-[var(--dk-z-modal,10000)] bg-black/90 backdrop-blur-xl flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer z-10"
      >
        <X size={18} className="text-white/80" />
      </button>

      {lightboxIdx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setLightboxIdx((s) => s - 1) }}
          className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer z-10"
        >
          <ChevronLeft size={22} className="text-white/80" />
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
          className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer z-10"
        >
          <ChevronRight size={22} className="text-white/80" />
        </button>
      )}

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        {screenshots.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
            className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
              i === lightboxIdx ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function LauncherScreenshotGallery({ screenshots }: LauncherScreenshotGalleryProps) {
  const { openModal } = useModal()
  const [scrollIdx, setScrollIdx] = useState(0)

  if (screenshots.length === 0) return null

  const scrollLeft = () => setScrollIdx((s) => Math.max(0, s - 1))
  const scrollRight = () => setScrollIdx((s) => Math.min(screenshots.length - 3, s + 1))

  const handleOpenLightbox = (index: number) => {
    const close = openModal(
      <ScreenshotLightboxModal
        screenshots={screenshots}
        initialIndex={index}
        onClose={() => close()}
      />
    )
  }

  return (
    <div className="absolute bottom-24 left-[calc(76px+1.5rem)] right-8 z-20">
      <div className="flex items-end gap-2">
        {screenshots.length > 3 && (
          <button
            onClick={scrollLeft}
            disabled={scrollIdx === 0}
            className="shrink-0 w-8 h-[72px] rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all disabled:opacity-20 cursor-pointer"
          >
            <ChevronLeft size={14} className="text-white/80" />
          </button>
        )}

        <div className="flex gap-2 overflow-hidden">
          {screenshots.slice(scrollIdx, scrollIdx + 5).map((shot, i) => (
            <button
              key={`${shot.url}-${scrollIdx + i}`}
              onClick={() => handleOpenLightbox(scrollIdx + i)}
              className="shrink-0 rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-all cursor-pointer group"
              style={{ width: 128, height: 72 }}
            >
              <img
                src={shot.url}
                alt={`Screenshot ${scrollIdx + i + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {screenshots.length > 3 && (
          <button
            onClick={scrollRight}
            disabled={scrollIdx >= screenshots.length - 3}
            className="shrink-0 w-8 h-[72px] rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all disabled:opacity-20 cursor-pointer"
          >
            <ChevronRight size={14} className="text-white/80" />
          </button>
        )}
      </div>
    </div>
  )
}
