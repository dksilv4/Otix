import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad2, Zap, Cloud, Blocks, ShieldCheck, Flame, Cpu, Gauge } from 'lucide-react'
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
    <div className="flex-1 w-full flex flex-col justify-between select-none overflow-hidden px-6 py-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex-1 flex flex-col justify-between py-2"
        >
          {/* Slide Header & Narrative */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-primary/15 text-primary">
              <IconComponent className="h-3.5 w-3.5" />
              <span className="text-xs font-bold tracking-wider uppercase">
                {currentSlide.category || 'FEATURE HIGHLIGHT'}
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {currentSlide.title}
            </h3>

            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl">
              {currentSlide.subtitle}
            </p>
          </div>

          {/* Full-Width Rich Feature Mockup Visual */}
          <div className="my-auto py-3">
            {currentSlide.id === 'library' && (
              <div className="grid grid-cols-3 gap-3 w-full max-w-2xl">
                {/* Game 1 */}
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-semibold">
                      Steam
                    </span>
                    <span className="text-muted-foreground font-mono">1,420h</span>
                  </div>
                  <div className="font-semibold text-xs text-foreground truncate">
                    Counter-Strike 2
                  </div>
                  <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Ready to Play
                  </div>
                </div>

                {/* Game 2 */}
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 font-semibold">
                      GOG
                    </span>
                    <span className="text-muted-foreground font-mono">84h</span>
                  </div>
                  <div className="font-semibold text-xs text-foreground truncate">
                    Cyberpunk 2077
                  </div>
                  <div className="text-xs text-primary font-medium flex items-center gap-1.5">
                    <Cloud className="h-3 w-3" />
                    Cloud Synced
                  </div>
                </div>

                {/* Game 3 */}
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-semibold">
                      Epic Games
                    </span>
                    <span className="text-muted-foreground font-mono">110 GB</span>
                  </div>
                  <div className="font-semibold text-xs text-foreground truncate">
                    Grand Theft Auto V
                  </div>
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    Auto Updated
                  </div>
                </div>
              </div>
            )}

            {currentSlide.id === 'performance' && (
              <div className="grid grid-cols-3 gap-3 w-full max-w-2xl">
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1 text-center">
                  <Cpu className="h-5 w-5 text-primary mx-auto mb-1" />
                  <div className="text-lg font-bold text-foreground font-mono">38 MB</div>
                  <div className="text-xs text-muted-foreground">RAM Footprint</div>
                </div>
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1 text-center">
                  <Zap className="h-5 w-5 text-amber-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-foreground font-mono">&lt; 0.4s</div>
                  <div className="text-xs text-muted-foreground">Cold Start Speed</div>
                </div>
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1 text-center">
                  <Gauge className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-foreground font-mono">0.0%</div>
                  <div className="text-xs text-muted-foreground">Game FPS Impact</div>
                </div>
              </div>
            )}

            {currentSlide.id === 'cloud' && (
              <div className="rounded-2xl bg-white/[0.035] p-4 backdrop-blur-xl shadow-lg shadow-black/20 max-w-2xl w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/15 text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      Automatic Save Game Snapshot Vault
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Multi-version rollback snapshots synced safely to cloud storage
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono text-emerald-400 font-semibold px-3 py-1 rounded-lg bg-emerald-500/10 shrink-0">
                  Zero Data Loss
                </div>
              </div>
            )}

            {currentSlide.id === 'plugins' && (
              <div className="grid grid-cols-3 gap-3 w-full max-w-2xl">
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">Discord RPC</div>
                  <div className="text-xs text-muted-foreground">Dynamic status presence</div>
                  <div className="text-xs text-emerald-400 font-medium pt-1">Active</div>
                </div>
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">Game HUD</div>
                  <div className="text-xs text-muted-foreground">In-game live overlay</div>
                  <div className="text-xs text-primary font-medium pt-1">Installed</div>
                </div>
                <div className="rounded-2xl bg-white/[0.035] p-3.5 backdrop-blur-xl shadow-lg shadow-black/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">Save Vault</div>
                  <div className="text-xs text-muted-foreground">Continuous backups</div>
                  <div className="text-xs text-emerald-400 font-medium pt-1">Protected</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Pill Indicators */}
      <div className="flex items-center gap-2 pt-2">
        {INSTALLER_CAROUSEL_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300 cursor-pointer',
              idx === activeIndex
                ? 'w-6 bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]'
                : 'w-1.5 bg-white/20 hover:bg-white/40',
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
