import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { LauncherGameHero } from '@/features/launcher/components/organisms/launcher-game-hero'
import { LauncherEmptyState } from '@/features/launcher/components/molecules/launcher-empty-state'
import { LauncherShelf } from '@/features/launcher/components/organisms/launcher-shelf'
import { LauncherFooter } from '@/features/launcher/components/organisms/launcher-footer'
import { usePopularGames } from '@/features/launcher/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'

const SLIDE_INTERVAL_MS = 30000
const PROGRESS_TICK_MS = 50

export function LauncherGamePage() {
  const { gameId } = useParams({ from: '/launcher/$gameId' })
  const navigate = useNavigate()
  const isDesktop = hasDesktopAPI()
  const { data: popularGames = [] } = usePopularGames()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleMouseEnter = useCallback(() => setPaused(true), [])
  const handleMouseLeave = useCallback(() => setPaused(false), [])

  // Progress ticker
  useEffect(() => {
    if (paused || isDesktop || popularGames.length === 0 || !gameId) {
      setProgress(0)
      return
    }
    setProgress(0)
    const tick = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (PROGRESS_TICK_MS / SLIDE_INTERVAL_MS) * 100
        return next >= 100 ? 100 : next
      })
    }, PROGRESS_TICK_MS)
    return () => clearInterval(tick)
  }, [gameId, paused, isDesktop, popularGames.length])

  // Auto-advance timer
  useEffect(() => {
    if (isDesktop || popularGames.length === 0 || !gameId || paused) return

    const advance = () => {
      const idx = popularGames.findIndex((g) => g.id === gameId)
      if (idx === -1) return
      const nextIdx = (idx + 1) % popularGames.length
      navigate({
        to: '/launcher/$gameId',
        params: { gameId: popularGames[nextIdx].id },
        replace: true,
      })
    }

    timerRef.current = setInterval(advance, SLIDE_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [gameId, isDesktop, popularGames, navigate, paused])

  if (!gameId) return <LauncherEmptyState />

  const showProgress = !isDesktop && popularGames.length > 0

  return (
    <main
      id="launcher-main-panel"
      className="max-w-[100vw] h-full overflow-y-auto relative flex flex-col scrollbar-none scroll-smooth bg-[#0a0a0d]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <LauncherGameHero />
      <section id="launcher-shelf-section" className="w-full bg-[#08080a] border-t border-white/[0.03] py-8 pr-8 shrink-0 flex flex-col gap-8" style={{ paddingLeft: 'calc(76px + 1.5rem)' }}>
        <LauncherShelf id="launcher-shelf" />
        <LauncherFooter id="launcher-footer" />
      </section>

      {/* Auto-advance progress bar */}
      {showProgress && (
        <div className="fixed bottom-0 inset-x-0 z-50 h-0.5 bg-white/5">
          <div
            className="h-full bg-[var(--color-accent)] transition-[width]"
            style={{ width: `${progress}%`, transitionDuration: `${PROGRESS_TICK_MS}ms`, transitionTimingFunction: 'linear' }}
          />
        </div>
      )}
    </main>
  )
}
