import { useMemo, useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'
import { LauncherGameStats } from '@/features/launcher/components/molecules/launcher-game-stats'
import { LauncherGameCompanies } from '@/features/launcher/components/molecules/launcher-game-companies'
import { LauncherGameDetailInfo } from '@/features/launcher/components/molecules/launcher-game-detail-info'
import { LauncherGameButtons } from '@/features/launcher/components/organisms/launcher-game-buttons'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

function useRandomParallax() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let frame: number
    // Unique phase per mount so each game has a different drift seed
    const phase = Math.random() * Math.PI * 2
    const speeds = [0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.5]
    const amps = [0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, 0.35 + Math.random() * 0.3]
    let t = phase

    const animate = () => {
      t += 0.003
      setOffset({
        x: Math.sin(t * speeds[0]) * amps[0] + Math.cos(t * speeds[1]) * amps[1],
        y: Math.cos(t * speeds[1]) * amps[0] + Math.sin(t * speeds[2]) * amps[2],
      })
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  return offset
}

export function LauncherGameHero() {
  const { component } = useLauncherTheme()
  const ThemedHero = component('Hero')
  if (ThemedHero) return <ThemedHero />

  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const detail = g?.data
  const drift = useRandomParallax()

  const backdropUrl = useMemo(() => {
    if (!detail) return ''
    const raw = (detail.backdropUrl || detail.posterUrl || detail.textlessPosterUrl) as string | undefined
    return raw ? heroImage(raw) : ''
  }, [detail])

  const dynamicBadge = useMemo(() => {
    if (!g) return ''
    if (g.data?.id) return 'Installed Local'
    const genres = detail?.genres as { name: string }[] | undefined
    return genres?.[0]?.name ? `${genres[0].name} Choice` : 'Featured'
  }, [g, detail])

  // Normalize drift to usable pixel offsets (-1..1 range scaled to px)
  const bgX = drift.x * 22
  const bgY = drift.y * 14
  // Logo moves opposite direction for parallax depth
  const lgX = -drift.x * 16
  const lgY = -drift.y * 12
  // Subtle 3D tilt
  const rotX = -drift.y * 2.5
  const rotY = drift.x * 3.5

  return (
    <section
      className="w-full min-h-[100vh] bg-[white] bg-grid-pattern relative shrink-0 overflow-hidden"
      style={{ perspective: '1200px' }}
    >
      {/* Background layers */}
      <AnimatePresence mode="wait">
        <motion.div
          key={gameId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 z-0"
          style={{
            transform: `translateX(${bgX}px) translateY(${bgY}px) scale(1.05)`,
            transition: 'transform 2.5s linear',
          }}
        >
          {backdropUrl && (
            <>
              <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${backdropUrl})` }} />
              <div
                className="absolute -inset-[20%] bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url(${backdropUrl})`,
                  filter: 'blur(60px)',
                  opacity: 0.35,
                }}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays — drift opposite for parallax */}
      <motion.div
        className="absolute inset-0 z-1 pointer-events-none"
        style={{
          transform: `translateX(${lgX * 0.3}px) translateY(${lgY * 0.3}px)`,
          transition: 'transform 2.5s linear',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      </motion.div>

      {dynamicBadge && (
        <div className="absolute top-8 right-8 bg-white/[0.07] border border-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-wide text-white/90 z-10 flex items-center gap-1.5 shadow-lg uppercase">
          <Sparkles size={11} className="text-yellow-400" />
          {dynamicBadge}
        </div>
      )}

      <div className="absolute z-10 bottom-8 pointer-events-auto" style={{ left: 'calc(76px + 1.5rem)' }}>
        <div className="flex items-start gap-3">
          <LauncherGameStats />
        </div>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <LauncherGameCompanies />
        {/* Logo/content with 3D parallax */}
        <motion.div
          className="absolute right-8 top-1/2 flex flex-col items-end text-right max-w-sm pointer-events-auto"
          style={{
            transform: `translateY(-35%) translateX(${lgX}px) translateY(${lgY}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 2.5s linear',
          }}
        >
          <LauncherGameDetailInfo />
          <LauncherGameButtons />
        </motion.div>
      </div>
    </section>
  )
}
