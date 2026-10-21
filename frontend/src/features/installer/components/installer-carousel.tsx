import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad2, Zap, Cloud, Blocks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { INSTALLER_CAROUSEL_SLIDES } from '../constants'
import type { CarouselSlide } from '../types'

const SLIDE_ICONS: Record<CarouselSlide['iconName'], typeof Gamepad2> = {
  gamepad: Gamepad2,
  zap: Zap,
  cloud: Cloud,
  blocks: Blocks,
}

export const InstallerCarousel = () => {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % INSTALLER_CAROUSEL_SLIDES.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [])

  const currentSlide = INSTALLER_CAROUSEL_SLIDES[activeIndex]
  const IconComponent = SLIDE_ICONS[currentSlide.iconName]

  return (
    <div className="relative w-full rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 flex flex-col justify-between overflow-hidden">
      <div className="min-h-[76px] flex items-start gap-3.5">
        <div className="p-2.5 rounded-lg bg-[var(--primary)]/[0.12] text-[var(--primary)] shrink-0 mt-0.5">
          <IconComponent className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <h4 className="text-sm font-semibold text-foreground tracking-tight">
                {currentSlide.title}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                {currentSlide.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Pill indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-white/[0.03]">
        {INSTALLER_CAROUSEL_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              idx === activeIndex
                ? 'w-6 bg-[var(--primary)]'
                : 'w-1.5 bg-white/[0.15] hover:bg-white/[0.3]',
            )}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
