import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useLauncherGame } from '@/features/games/hooks/use-launcher-game'
import { heroImage } from '@/features/games/launcher-utils'
import { LauncherGameStats } from '@/features/games/molecules/launcher-game-stats'
import { LauncherGameCompanies } from '@/features/games/molecules/launcher-game-companies'
import { LauncherGameDetailInfo } from '@/features/games/molecules/launcher-game-detail-info'
import { LauncherGameButtons } from '@/features/games/organisms/launcher-game-buttons'

export function LauncherGameHero() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const detail = g?.data

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

  return (
    <section className="w-full min-h-[100vh] bg-[white] bg-grid-pattern relative shrink-0">
      <AnimatePresence mode="wait">
        <motion.div
          key={gameId}
          initial={{ opacity: 0, scale: 1.01 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="absolute inset-0 z-0 overflow-hidden"
        >
          <div className="absolute inset-0 bg-cover bg-[55%_center] bg-no-repeat" style={{ backgroundImage: `url(${backdropUrl})` }} />
          <div className="absolute -inset-[20%] bg-cover bg-[55%_center] bg-no-repeat"
            style={{ backgroundImage: `url(${backdropUrl})`, filter: 'blur(60px)', opacity: 0.35, transform: 'scale(1.1)' }} />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/10 z-1 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-1 pointer-events-none" />

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
        <div className="absolute right-8 top-1/2 -translate-y-[35%] flex flex-col items-end text-right max-w-sm pointer-events-auto">
          <LauncherGameDetailInfo />
          <LauncherGameButtons />
        </div>
      </div>
    </section>
  )
}
