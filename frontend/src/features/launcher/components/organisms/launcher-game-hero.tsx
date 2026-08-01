import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'
import { LauncherGameStats } from '@/features/launcher/components/molecules/launcher-game-stats'
import { LauncherGameDetailInfo } from '@/features/launcher/components/molecules/launcher-game-detail-info'
import { LauncherGameButtons } from '@/features/launcher/components/organisms/launcher-game-buttons'
import { LauncherScreenshotGallery } from '@/features/launcher/components/molecules/launcher-screenshot-gallery'
import { useInactiveSlideshow } from '@/features/launcher/hooks/use-inactive-slideshow'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'

function useRandomParallax() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const frameRef = useRef<number>(0)
  const runningRef = useRef(true)

  useEffect(() => {
    const phase = Math.random() * Math.PI * 2
    const speeds = [0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.5]
    const amps = [0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, 0.35 + Math.random() * 0.3]
    let t = phase

    const animate = () => {
      if (!runningRef.current) {
        return
      }
      t += 0.003
      setOffset({
        x: Math.sin(t * speeds[0]) * amps[0] + Math.cos(t * speeds[1]) * amps[1],
        y: Math.cos(t * speeds[1]) * amps[0] + Math.sin(t * speeds[2]) * amps[2],
      })
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    // Pause on visibility loss / page hide
    const onHidden = () => { runningRef.current = false }
    const onVisible = () => { runningRef.current = true }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onHidden()
      else onVisible()
    })
    window.addEventListener('pagehide', onHidden)
    window.addEventListener('pageshow', onVisible)

    return () => {
      cancelAnimationFrame(frameRef.current)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onHidden)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])

  return offset
}

export function LauncherGameHero() {
  const { settings } = useLauncherSettings()
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const detail = g?.data
  const drift = useRandomParallax()
  const [activeBackdrop, setActiveBackdropRaw] = useState<string | null>(null)
  const setActiveBackdrop = useCallback((url: string | null) => {
    if (!url || settings.backgroundTransitions) setActiveBackdropRaw(url)
  }, [settings.backgroundTransitions])

  // Reset hovered screenshot backdrop when changing games
  useEffect(() => {
    setActiveBackdropRaw(null)
  }, [gameId])

  const screenshots = useMemo(() => {
    if (!detail?.screenshots?.length) return []
    return detail.screenshots.map((s) => ({ ...s, url: heroImage(s.url) }))
  }, [detail])

  const { isPlaying: galleryAutoPlay } = useInactiveSlideshow({
    totalItems: screenshots.length,
    slideInterval: 6000,
    inactivityTimeout: 8000,
    enabled: settings.slideshowWhenInactive,
  })

  const backdropUrl = useMemo(() => {
    if (!detail) return ''
    const raw = (detail.backdropUrl || detail.posterUrl || detail.textlessPosterUrl) as string | undefined
    return raw ? heroImage(raw) : ''
  }, [detail])

  const currentBackdrop = activeBackdrop || backdropUrl

  // Normalize drift to usable pixel offsets
  const bgX = drift.x * 22
  const bgY = drift.y * 14
  const lgX = -drift.x * 16
  const lgY = -drift.y * 12
  const rotX = -drift.y * 2.5
  const rotY = drift.x * 3.5

  const isHoveringScreenshot = activeBackdrop !== null

  return (
    <section
      id="launcher-game-hero"
      className="w-full min-h-[100vh] bg-neutral-950 bg-grid-pattern relative shrink-0 overflow-hidden"
      style={{ perspective: '1200px' }}
    >
      {/* Background layers */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.div
            key={currentBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="absolute inset-0"
            style={{
              transform: `translateX(${bgX}px) translateY(${bgY}px) scale(1.05)`,
              transition: 'transform 2.5s linear',
            }}
          >
            {currentBackdrop && (
              <>
                <div
                  className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-500 ease-out-back ${
                    isHoveringScreenshot
                      ? 'opacity-90 brightness-95 saturate-100 contrast-100'
                      : 'opacity-45 brightness-[0.45] saturate-[0.75] contrast-[1.05]'
                  }`}
                  style={{ backgroundImage: `url(${currentBackdrop})` }}
                />
                <div
                  className="absolute -inset-[20%] bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url(${currentBackdrop})`,
                    filter: 'blur(60px)',
                    opacity: 0.25,
                  }}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Gradient overlays */}
      <div
        className="absolute inset-0 z-1 pointer-events-none transition-opacity duration-500"
        style={{ opacity: isHoveringScreenshot ? 0.15 : 1 }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/10 to-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      </div>

      {/* Bottom info dock */}
      <div
        className="absolute z-10 bottom-8 pointer-events-auto flex flex-col gap-5"
        style={{ left: 'calc(76px + 1.5rem)', right: '2rem' }}
      >
        <div
          className="flex items-start gap-3 transition-opacity duration-500"
          style={{ opacity: isHoveringScreenshot ? 0.15 : 1 }}
        >
          <LauncherGameStats />
        </div>

        {/* Screenshot gallery */}
        {screenshots.length > 0 && (
          <LauncherScreenshotGallery
            screenshots={screenshots}
            onHoverScreenshot={setActiveBackdrop}
            autoPlay={galleryAutoPlay}
          />
        )}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Logo/content with 3D parallax */}
        <motion.div
          className="absolute right-8 top-1/2 flex flex-col items-end text-right max-w-sm pointer-events-auto"
          style={{
            transform: `translateY(-35%) translateX(${lgX}px) translateY(${lgY}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 2.5s linear, opacity 0.5s ease-in-out',
            opacity: isHoveringScreenshot ? 0.1 : 1,
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={gameId}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <LauncherGameDetailInfo />
              <LauncherGameButtons />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
