import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2,
  LayoutGrid,
  Search,
  X,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLauncherVisibleGames, localGameKeys } from '@/features/launcher/data/game-queries'
import { gameDetailOptions } from '@/features/launcher/data/queries'
import { fetchGameById } from '@/features/launcher/data/storage'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api'
import { toDisplayGame, isCatalogId, isInstalledGame, isCs2Game } from '@/features/launcher/utils'
import { useMatchedRunningGame } from '@/features/launcher/hooks/use-matched-running-game'
import GameThumbList from '@/features/launcher/components/molecules/launcher-game-thumb-list'
import { useToast } from '@ui/molecules/toast'
import { formatScanError } from '@/lib/utils/scan-errors'
import type { DisplayGame, LauncherPlatform } from '@/features/launcher/types'

export const FloatingGameSelector = () => {
  const navigate = useNavigate()
  const p = useParams({ strict: false })
  const activeGameId = (p as Record<string, string>).gameId || null
  const isDesktop = hasDesktopAPI()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { runningGame, matchedGame } = useMatchedRunningGame()

  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const isLibraryView = currentPath.startsWith('/launcher/library')

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { data: visibleGames = [] } = useLauncherVisibleGames(
    isDesktop ? { sortBy: 'last_played_at', sortDir: 'desc' } : undefined,
  )

  const games: DisplayGame[] = useMemo(() => {
    // 1. Identify currently running game, if any
    const runningId = runningGame?.game.id
    const runningTitle = (matchedGame?.title || runningGame?.game.title || '').toLowerCase()
    const runningExe = (runningGame?.game.exePath || '').toLowerCase()
    const runningProc = (runningGame?.game.processName || '').toLowerCase()

    const matchingRunningVisible = runningGame
      ? visibleGames.find((g) => {
          if (runningId && (g.id === runningId || g.otixMediaId === runningId || g.data?.id === runningId)) return true
          const gTitle = (g.title || '').toLowerCase()
          if (runningTitle && (gTitle === runningTitle || (isCs2Game(gTitle) && isCs2Game(runningTitle)))) return true
          if (runningExe && g.exePath && g.exePath.toLowerCase() === runningExe) return true
          if (runningProc && g.exePath && g.exePath.toLowerCase().endsWith(runningProc)) return true
          return false
        })
      : null

    const runningDisplayGame: DisplayGame | null = runningGame
      ? matchingRunningVisible
        ? { ...toDisplayGame(matchingRunningVisible), playtime: 'Now Playing' }
        : {
            id: runningGame.game.id || 'cs2',
            title: matchedGame?.title || runningGame.game.title || 'Counter-Strike 2',
            posterUrl: matchedGame?.posterUrl || runningGame.game.posterUrl || null,
            backdropUrl: matchedGame?.backdropUrl || runningGame.game.backdropUrl || undefined,
            iconUrl: runningGame.game.iconUrl || undefined,
            platform: (runningGame.game.platform as LauncherPlatform) || 'steam',
            exePath: runningGame.game.exePath || '',
            installDir: '',
            isInstalled: true,
            playtime: 'Now Playing',
            achievements: '',
            isDefault: false,
          }
      : null

    const runningTargetId = runningDisplayGame?.id

    // 2. Recently played games, sorted descending by most recent playtime
    const recent = visibleGames
      .filter((g) => Boolean(g.lastPlayedAt) && (!runningTargetId || g.id !== runningTargetId))
      .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())

    const recentIds = new Set(recent.map((g) => g.id))
    if (runningTargetId) recentIds.add(runningTargetId)

    // 3. Installed games not yet in recent list, sorted alphabetically by title
    const installed = visibleGames
      .filter((g) => !recentIds.has(g.id) && isInstalledGame(g))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))

    const baseList = [...recent, ...installed].map((g) => toDisplayGame(g))

    if (runningDisplayGame) {
      const filtered = baseList.filter(
        (g) => g.id !== runningDisplayGame.id && g.title.toLowerCase() !== runningDisplayGame.title.toLowerCase(),
      )
      return [runningDisplayGame, ...filtered]
    }

    return baseList
  }, [visibleGames, runningGame, matchedGame])

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return games
    const q = searchQuery.toLowerCase().trim()
    return visibleGames
      .filter((g) => g.title.toLowerCase().includes(q))
      .map((g) => toDisplayGame(g))
  }, [games, visibleGames, searchQuery])

  // Keyboard shortcut to close search on Escape
  useEffect(() => {
    if (!searchOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  const handleSelectGame = useCallback(
    (id: string) => {
      navigate({ to: '/launcher/$gameId', params: { gameId: id } })
      if (isDesktop) {
        requestAnimationFrame(() => {
          const el = document.getElementById('launcher-main-panel')
          if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
        })
      }
    },
    [navigate, isDesktop],
  )

  // Auto-select first game if none is active and not on library view
  useEffect(() => {
    if (!activeGameId && !isLibraryView) {
      const targetId = games[0]?.id || visibleGames[0]?.id
      if (targetId) {
        navigate({ to: '/launcher/$gameId', params: { gameId: targetId }, replace: true })
      }
    }
  }, [activeGameId, isLibraryView, games, visibleGames, navigate])

  const handlePrefetch = useCallback(
    (game: DisplayGame) => {
      if (isDesktop) {
        queryClient.prefetchQuery({
          queryKey: localGameKeys.detail(game.id),
          queryFn: () => fetchGameById(game.id),
          staleTime: 30000,
        })
        const catalogId =
          game.otixMediaId ||
          ((game as unknown as Record<string, any>).rawGame?.otixMediaId) ||
          ((game as unknown as Record<string, any>).rawGame?.data?.id) ||
          (isCatalogId(game.id) ? game.id : undefined)
        if (catalogId && isCatalogId(catalogId as string)) {
          queryClient.prefetchQuery(gameDetailOptions(catalogId as string))
        }
      } else if (isCatalogId(game.id)) {
        queryClient.prefetchQuery(gameDetailOptions(game.id))
      }
    },
    [isDesktop, queryClient],
  )

  const goToLibrary = useCallback(() => {
    navigate({ to: '/launcher/library' })
  }, [navigate])

  const goToSpotlight = useCallback(() => {
    if (activeGameId) {
      navigate({ to: '/launcher/$gameId', params: { gameId: activeGameId } })
    } else if (games.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: games[0].id } })
    } else if (visibleGames.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: visibleGames[0].id } })
    } else {
      navigate({ to: '/launcher' })
    }
  }, [activeGameId, games, visibleGames, navigate])

  const handleQuickScan = useCallback(async () => {
    if (!isDesktop) {
      toast({
        title: 'Scanning local games',
        description: 'Desktop client scans local folders and remote nodes automatically.',
        variant: 'default',
      })
      return
    }
    const api = getDesktopAPI()
    if (!api?.getScanPaths || !api?.scanPaths) return

    try {
      setIsScanning(true)
      const scanPaths = await api.getScanPaths()
      const gameDirs = scanPaths.filter((sp) => sp.type === 'game' || (sp as any).type === 'installed').map((sp) => sp.path)
      const isoDirs = scanPaths.filter((sp) => sp.type === 'iso' || (sp as any).type === 'provider').map((sp) => sp.path)
      await api.scanPaths(gameDirs, isoDirs)
      queryClient.invalidateQueries({ queryKey: localGameKeys.all })
      toast({
        title: 'Scan Complete',
        description: 'Library has been updated with newly detected games.',
        variant: 'success',
      })
    } catch (err) {
      const { message } = formatScanError(err)
      toast({
        title: 'Scan Error',
        description: message,
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }, [isDesktop, queryClient, toast])

  return (
    <>
      <aside
        style={{
          left: '1rem',
          top: isDesktop ? '6.5rem' : '4.5rem',
          bottom: '1.5rem',
          height: isDesktop ? 'calc(100vh - 8rem)' : 'calc(100vh - 6rem)',
        }}
        className={
          'fixed z-30 w-[4rem] flex flex-col items-center ' +
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] ' +
          'backdrop-blur-xl shadow-[var(--dk-shadow-glass)] rounded-[2rem] overflow-hidden'
        }
      >
        {/* Header Actions: Spotlight, Library, Search, Scan */}
        <div className="w-full flex flex-col items-center pt-3 pb-2 gap-2 shrink-0 border-b border-[var(--dk-separator)]">
          {/* Spotlight Hero vs Library Toggle */}
          <button
            type="button"
            title={isLibraryView ? 'Open Game Spotlight' : 'Game Spotlight'}
            onClick={goToSpotlight}
            className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 ${
              !isLibraryView
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
            }`}
          >
            <Gamepad2 size={17} />
          </button>

          <button
            type="button"
            title="Browse All Games (Library)"
            onClick={goToLibrary}
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 ${
              isLibraryView
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
            }`}
          >
            <LayoutGrid size={15} />
          </button>

          {/* Quick Search Flyout Toggle */}
          <button
            type="button"
            title={searchOpen ? 'Close Search' : 'Filter Games'}
            onClick={() => {
              setSearchOpen((prev) => {
                const next = !prev
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 60)
                }
                return next
              })
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              searchQuery
                ? 'bg-primary text-primary-foreground shadow-sm'
                : searchOpen
                  ? 'bg-[var(--dk-surface-ghost-active)] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]'
            }`}
          >
            <Search size={14} />
          </button>

          {/* Rescan Button */}
          <button
            type="button"
            title="Scan Game Libraries"
            onClick={handleQuickScan}
            disabled={isScanning}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] active:scale-95 cursor-pointer transition-all shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin text-primary' : ''} />
          </button>
        </div>

        {/* Middle: Game Thumbnail Reel */}
        <GameThumbList
          games={filteredGames}
          activeGameId={isLibraryView ? null : activeGameId}
          onSelect={handleSelectGame}
          onHover={handlePrefetch}
        />

        {/* Footer: Launcher Settings */}
        <div className="w-full flex flex-col items-center py-2 shrink-0 border-t border-[var(--dk-separator)]">
          <button
            type="button"
            title="Launcher Settings"
            onClick={() => navigate({ to: '/settings/launcher' })}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] active:scale-95 cursor-pointer transition-all shrink-0"
          >
            <Settings size={15} />
          </button>
        </div>
      </aside>

      {/* Quick Search Flyout */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-40 bg-[var(--dk-surface-overlay)] backdrop-blur-xl border border-[var(--dk-separator)] rounded-2xl shadow-[var(--dk-shadow-dialog)] p-2.5 flex items-center gap-2.5 w-64"
            style={{
              left: '5.5rem',
              top: isDesktop ? '14.5rem' : '12.5rem',
            }}
          >
            <Search size={14} className="text-muted-foreground shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter games..."
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full font-medium"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-[var(--dk-surface-ghost)] transition-colors"
                title="Clear filter"
              >
                <X size={13} />
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
};

export default FloatingGameSelector;
