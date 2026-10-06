import {useCallback, useMemo, useEffect, useState, useRef} from 'react'
import {useNavigate, useParams} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {Gamepad2, Search, X} from 'lucide-react'
import {motion, AnimatePresence} from 'framer-motion'
import {useLauncherVisibleGames, localGameKeys} from '@/features/launcher/data/game-queries'
import {usePopularGames, gameDetailOptions} from '@/features/launcher/data/queries'
import {fetchGameById} from '@/features/launcher/data/storage'
import {hasDesktopAPI} from '@/lib/desktop/api'
import {toDisplayGame} from '@/features/launcher/utils'
import {OTIX_DEFAULT_GAME} from '@/features/launcher/data/otix-default-game'
import GameThumbList from '@/features/launcher/components/molecules/launcher-game-thumb-list'
import type {DisplayGame, LauncherPlatform} from '@/features/launcher/types'

export const FloatingGameSelector = () => {
    const navigate = useNavigate()
    const p = useParams({strict: false})
    const activeGameId = (p as Record<string, string>).gameId || null
    const isDesktop = hasDesktopAPI()
    const queryClient = useQueryClient()

    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    const {data: visibleGames = []} = useLauncherVisibleGames(
        isDesktop ? {sortBy: 'last_played_at', sortDir: 'desc'} : undefined,
    )
    const {data: popularGames = []} = usePopularGames()

    const games: DisplayGame[] = useMemo(() => {
        if (visibleGames.length > 0) {
            return visibleGames
                .map((g) => toDisplayGame(g))
                .slice(0, 30)
        }
        if (popularGames.length > 0) {
            return popularGames.map((p) => ({
                id: p.id,
                title: p.title,
                exePath: "",
                installDir: "",
                platform: "steam" as LauncherPlatform,
                posterUrl: p.posterUrl ?? null,
                backdropUrl: p.backdropUrl ?? undefined,
                isInstalled: false,
                playtime: "—",
                achievements: "—",
                isDefault: false,
            } as DisplayGame)).slice(0, 30)
        }
        // Filler Otix game when library is empty
        return [toDisplayGame(OTIX_DEFAULT_GAME)]
    }, [visibleGames, popularGames])

    const filteredGames = useMemo(() => {
        if (!searchQuery.trim()) return games
        const q = searchQuery.toLowerCase().trim()
        return games.filter((g) => g.title.toLowerCase().includes(q))
    }, [games, searchQuery])

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

    const handleSelectGame = useCallback((id: string) => {
        navigate({to: '/launcher/$gameId', params: {gameId: id}})
        if (isDesktop) {
            requestAnimationFrame(() => {
                const el = document.getElementById('launcher-main-panel')
                if (el) el.scrollTo({top: 0, behavior: 'smooth'})
            })
        }
    }, [navigate, isDesktop])

    // Auto-select first game if none is active
    useEffect(() => {
        if (!activeGameId && games.length > 0) {
            navigate({to: '/launcher/$gameId', params: {gameId: games[0].id}, replace: true})
        }
    }, [activeGameId, games, navigate])

    const handlePrefetch = useCallback((game: DisplayGame) => {
        if (isDesktop) {
            queryClient.prefetchQuery({
                queryKey: localGameKeys.detail(game.id),
                queryFn: () => fetchGameById(game.id),
                staleTime: 30000,
            })
            const catalogId = game.otixMediaId || (game as any).rawGame?.otixMediaId || (game as any).rawGame?.data?.id
            if (catalogId) {
                queryClient.prefetchQuery(gameDetailOptions(catalogId))
            }
        } else {
            queryClient.prefetchQuery(gameDetailOptions(game.id))
        }
    }, [isDesktop, queryClient])

    const goToLibrary = useCallback(() => {
        navigate({to: '/launcher/library'})
    }, [navigate])

    return (
        <>
            <aside
                style={{
                    left: '1rem',
                    top: isDesktop ? '7.5rem' : '5.5rem',
                    maxHeight: isDesktop ? 'calc(100vh - 9rem)' : 'calc(100vh - 7rem)',
                }}
                className={
                    'fixed z-30 w-[4rem] flex flex-col items-center ' +
                    'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] ' +
                    'backdrop-blur-lg shadow-[var(--dk-shadow-glass)] rounded-[2rem] overflow-hidden'
                }
            >
                {/* Header Actions: Library & Search */}
                <div className="w-full flex flex-col items-center pt-3 pb-2 gap-2 shrink-0 border-b border-white/5">
                    <button
                        title="Browse All Games (Library)"
                        onClick={goToLibrary}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground hover:scale-105 active:scale-95 cursor-pointer transition-all bg-primary shadow-md shadow-primary/20 shrink-0"
                    >
                        <Gamepad2 size={17}/>
                    </button>

                    <button
                        title={searchOpen ? "Close Search" : "Filter Games"}
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
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : searchOpen
                                ? "bg-white/20 text-white"
                                : "text-white/60 hover:text-white hover:bg-white/10"
                        }`}
                    >
                        <Search size={14}/>
                    </button>
                </div>

                <GameThumbList
                    games={filteredGames}
                    activeGameId={activeGameId}
                    onSelect={handleSelectGame}
                    onHover={handlePrefetch}
                />
            </aside>

            {/* Quick Search Flyout */}
            <AnimatePresence>
                {searchOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: -10, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed z-40 bg-neutral-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2.5 flex items-center gap-2.5 w-64"
                        style={{
                            left: '5.5rem',
                            top: isDesktop ? '11.5rem' : '9.5rem',
                        }}
                    >
                        <Search size={14} className="text-white/40 shrink-0 ml-1" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter games..."
                            className="bg-transparent text-xs text-white placeholder-white/40 outline-none w-full font-medium"
                        />
                        {searchQuery ? (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="text-white/40 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-colors"
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
