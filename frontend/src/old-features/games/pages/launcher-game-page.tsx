import { useParams } from '@tanstack/react-router'
import { LauncherGameHero } from '@/old-features/games/organisms/launcher-game-hero'
import { LauncherEmptyState } from '@/old-features/games/molecules/launcher-empty-state'
import { LauncherShelf } from '@/old-features/games/organisms/launcher-shelf'
import { LauncherFooter } from '@/old-features/games/organisms/launcher-footer'

export function LauncherGamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' })

  if (!gameId) return <LauncherEmptyState />

  return (
    <main id="launcher-main-panel" className="max-w-[100vw] h-full overflow-y-auto relative flex flex-col scrollbar-none scroll-smooth bg-[#0a0a0d]">
      <LauncherGameHero />
      <section id="launcher-shelf-section" className="w-full bg-[#08080a] border-t border-white/[0.03] py-8 pr-8 shrink-0 flex flex-col gap-8" style={{ paddingLeft: 'calc(76px + 1.5rem)' }}>
        <LauncherShelf id="launcher-shelf" />
        <LauncherFooter id="launcher-footer" />
      </section>
    </main>
  )
}
