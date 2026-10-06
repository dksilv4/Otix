import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'
import { LauncherGameStats } from '@/features/launcher/components/molecules/launcher-game-stats'
import { LauncherGameHeroMeta } from '@/features/launcher/components/molecules/launcher-game-hero-meta'
import { LauncherGameDetailInfo } from '@/features/launcher/components/molecules/launcher-game-detail-info'
import { LauncherGameButtons } from '@/features/launcher/components/organisms/launcher-game-buttons'
import { LauncherScreenshotGallery } from '@/features/launcher/components/molecules/launcher-screenshot-gallery'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { useRandomParallax } from '@/features/launcher/hooks/use-random-parallax'

export const LauncherGameHero = () => {
  const { settings } = useLauncherSettings()
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const detail = g?.data
  const drift = useRandomParallax()
  const [activeBackdrop, setActiveBackdropRaw] = useState<string | null>(null)
  const setActiveBackdrop = useCallback((url: string | null) => {
    if (url === null || settings.backgroundTransitions) setActiveBackdropRaw(url)
  }, [settings.backgroundTransitions])

  // Reset hovered screenshot backdrop when changing games
  useEffect(() => {
    setActiveBackdropRaw(null)
  }, [gameId])

  const screenshots = useMemo(() => {
    if (!detail?.screenshots?.length) return []
    return detail.screenshots.map((s) => ({ ...s, url: heroImage(s.url) }))
  }, [detail])

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

      {/* Bottom gradient mask transitioning hero smoothly into shelf */}
      <div className="absolute bottom-0 inset-x-0 h-36 bg-gradient-to-t from-[#08080a] via-[#08080a]/70 to-transparent pointer-events-none z-[4]" />

      {/* Bottom info dock */}
      <div
        className="absolute z-10 bottom-6 md:bottom-8 pointer-events-auto flex flex-col gap-3.5 md:gap-4 max-w-full lg:max-w-[calc(100%-26rem)] xl:max-w-[calc(100%-30rem)]"
        style={{ left: 'calc(76px + 1.5rem)', right: '2rem' }}
      >
        <div
          className="flex items-center flex-wrap gap-3 transition-opacity duration-300 ease-out"
          style={{ opacity: isHoveringScreenshot ? 0.15 : 1 }}
        >
          <LauncherGameStats />
          <LauncherGameHeroMeta />
        </div>

        {/* Screenshot gallery */}
        {screenshots.length > 0 && (
          <LauncherScreenshotGallery
            screenshots={screenshots}
            onHoverScreenshot={setActiveBackdrop}
            autoPlay={false}
          />
        )}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Logo/content with 3D parallax */}
        <motion.div
          className="absolute right-6 md:right-10 xl:right-14 top-[40%] md:top-[44%] xl:top-1/2 flex flex-col items-end text-right max-w-sm md:max-w-md xl:max-w-lg pointer-events-auto"
          style={{
            transform: `translateY(-38%) translateX(${lgX}px) translateY(${lgY}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 2.5s linear',
          }}
        >
          <div
            className="transition-opacity duration-300 ease-out flex flex-col items-end w-full"
            style={{ opacity: isHoveringScreenshot ? 0.15 : 1 }}
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
          </div>
        </motion.div>
      </div>
    </section>
  )
};
