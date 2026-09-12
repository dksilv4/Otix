import { useParams } from '@tanstack/react-router'
import { LauncherGameHero } from '@/features/launcher/components/organisms/launcher-game-hero'
import { LauncherEmptyState } from '@/features/launcher/components/molecules/launcher-empty-state'
import { LauncherNotFound } from '@/features/launcher/components/molecules/launcher-not-found'
import { LauncherShelf } from '@/features/launcher/components/organisms/launcher-shelf'
import { LauncherFooter } from '@/features/launcher/components/organisms/launcher-footer'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'

export function LauncherGamePage() {
  const { gameId } = useParams({ from: '/launcher/$gameId' })
  const { game, isLoading } = useLauncherGame(gameId)

  // ── States ──
  if (!gameId) return <LauncherEmptyState />

  // gameId exists but resolved to nothing (not loading, no game = truly missing)
  if (!isLoading && !game) return <LauncherNotFound />

  return (
    <main
      id="launcher-main-panel"
      className="max-w-[100vw] h-full overflow-y-auto relative flex flex-col scrollbar-none scroll-smooth bg-[#0a0a0d]"
    >
      <LauncherGameHero />
      <section
        id="launcher-shelf-section"
        className="w-full bg-[#08080a] border-t border-white/[0.04] py-8 pr-8 shrink-0 flex flex-col gap-8 relative z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.6)]"
        style={{ paddingLeft: 'calc(76px + 1.5rem)' }}
      >
        <LauncherShelf id="launcher-shelf" />
        <LauncherFooter id="launcher-footer" />
      </section>
    </main>
  )
}
