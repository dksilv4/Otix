import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useParams } from '@tanstack/react-router'
import { usePopularGames } from '@/features/games/games-queries'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop-api'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { LauncherGameHero } from '@/features/games/organisms/launcher-game-hero'
import { LauncherEmptyState } from '@/features/games/molecules/launcher-empty-state'
import { LauncherShelf } from '@/features/games/organisms/launcher-shelf'
import { LauncherFooter } from '@/features/games/organisms/launcher-footer'
import type { DisplayGame } from '@/features/games/types'
import type { ShelfTab } from '@/features/games/organisms/launcher-shelf'

export function LauncherGamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' })
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: popularGames = [] } = usePopularGames()

  const [shelfTab, setShelfTab] = useState<ShelfTab>('popular')
  const [scanning, setScanning] = useState(false)

  const shelfGames = useMemo<DisplayGame[]>(() => {
    const baseList: DisplayGame[] = popularGames.map((p) => ({
      id: p.id, title: p.title, posterUrl: p.posterUrl || null,
      backdropUrl: p.backdropUrl || undefined, logoUrl: p.logoUrl || undefined,
      iconUrl: p.iconUrl || undefined,
      badge: p.avgRating ? `★ ${p.avgRating.toFixed(1)} · ${p.ratingCount.toLocaleString()} ratings`
        : p.popularity > 200 ? 'Popular' : 'Featured',
      playtime: '—', achievements: p.avgRating ? `${Math.round(p.avgRating * 10)}%` : '—',
      isDefault: true, platform: 'pc', otixMediaId: p.id,
    }))

    if (shelfTab === 'downloaded') {
      return [...baseList].sort((a, b) => {
        const aCount = popularGames.find((p) => p.id === a.id)?.ratingCount ?? 0
        const bCount = popularGames.find((p) => p.id === b.id)?.ratingCount ?? 0
        return bCount - aCount
      })
    }
    if (shelfTab === 'rated') {
      return [...baseList].sort((a, b) => {
        const aRating = popularGames.find((p) => p.id === a.id)?.avgRating ?? 0
        const bRating = popularGames.find((p) => p.id === b.id)?.avgRating ?? 0
        return bRating - aRating
      })
    }
    return baseList
  }, [popularGames, shelfTab])

  const handleScan = useCallback(async () => {
    if (!hasDesktopAPI()) {
      toast({ title: 'Scanner Simulated', description: 'Web preview mode: Scanned 0 local game directories.', variant: 'info' })
      return
    }
    setScanning(true)
    try {
      const api = getDesktopAPI()!
      const paths = await api.getScanPaths()
      const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
      const isoPaths = paths.filter((p) => p.type === 'iso').map((p) => p.path)
      const scanned = await api.scanPaths(gamePaths, isoPaths)
      if (scanned?.length) {
        toast({ title: 'Scan Complete', description: `Scanned ${scanned.length} games.`, variant: 'success' })
      } else {
        toast({ title: 'Scan Complete', description: 'No local games detected.', variant: 'default' })
      }
    } catch (err) {
      console.error('Scan failed:', err)
      toast({ title: 'Scan Failed', variant: 'error' })
    } finally {
      setScanning(false)
    }
  }, [toast])

  const goToSettings = useCallback(() => navigate({ to: '/settings' as any }), [navigate])
  const goToLibrary = useCallback(() => navigate({ to: '/library' }), [navigate])
  const handleSelectGame = useCallback((id: string) => {
    navigate({ to: '/game/$gameId', params: { gameId: id } })
    requestAnimationFrame(() => {
      const el = document.getElementById('launcher-main-panel')
      if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }, [navigate])

  if (!gameId) return <LauncherEmptyState />

  return (
    <main id="launcher-main-panel" className="max-w-[100vw] h-full overflow-y-auto relative flex flex-col scrollbar-none scroll-smooth bg-[#0a0a0d]">
      <LauncherGameHero />
      <section id="launcher-shelf-section" className="w-full bg-[#08080a] border-t border-white/[0.03] py-8 pr-8 shrink-0 flex flex-col gap-8" style={{ paddingLeft: 'calc(76px + 1.5rem)' }}>
        <LauncherShelf id="launcher-shelf" games={shelfGames} activeGameId={gameId} shelfTab={shelfTab} onTabChange={setShelfTab} onSelectGame={handleSelectGame} />
        <LauncherFooter id="launcher-footer" scanning={scanning} onScan={handleScan} onSettings={goToSettings} onLibrary={goToLibrary} />
      </section>
    </main>
  )
}
