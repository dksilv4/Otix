import {useCallback, useMemo} from 'react'
import {useNavigate, useParams} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {Gamepad2} from 'lucide-react'
import {useLocalGames, localGameKeys} from '@/features/launcher/data/game-queries'
import {usePopularGames, gameDetailOptions} from '@/features/launcher/data/queries'
import {fetchGameById} from '@/features/launcher/data/storage'
import {hasDesktopAPI} from '@/lib/desktop/api'
import {toDisplayGame, isApplicationGame} from '@/features/launcher/utils'
import GameThumbList from '@/features/launcher/components/molecules/launcher-game-thumb-list'
import type {DisplayGame, LauncherPlatform} from '@/features/launcher/types'

export function FloatingGameSelector() {
    const navigate = useNavigate()
    const p = useParams({strict: false})
    const activeGameId = (p as Record<string, string>).gameId || null
    const isDesktop = hasDesktopAPI()
    const queryClient = useQueryClient()

    const {data: localGames = []} = useLocalGames(
        isDesktop ? {sortBy: 'last_played_at', sortDir: 'desc'} : undefined,
    )
    const {data: popularGames = []} = usePopularGames()

    const games: DisplayGame[] = useMemo(() => {
        if (isDesktop) return localGames.filter((g) => !isApplicationGame(g)).map(toDisplayGame)
        return popularGames.slice(0, 20).map((g) => ({
            id: g.id,
            title: g.title,
            posterUrl: g.posterUrl ?? null,
            iconUrl: g.posterUrl ?? g.iconUrl ?? undefined,
            backdropUrl: g.backdropUrl ?? undefined,
            playtime: '',
            achievements: '',
            isDefault: false,
            isInstalled: false,
            platform: 'unknown' as LauncherPlatform,
        }))
    }, [isDesktop, localGames, popularGames])

    const handleSelectGame = useCallback((id: string) => {
        navigate({to: '/launcher/$gameId', params: {gameId: id}})
        if (isDesktop) {
            requestAnimationFrame(() => {
                const el = document.getElementById('launcher-main-panel')
                if (el) el.scrollTo({top: 0, behavior: 'smooth'})
            })
        }
    }, [navigate, isDesktop])

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
            <button
                title="Browse All Games"
                onClick={goToLibrary}
                className="z-1 absolute top-2 w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)] shrink-0 mt-2"
            >
                <Gamepad2 size={16}/>
            </button>

            <GameThumbList games={games} activeGameId={activeGameId} onSelect={handleSelectGame} onHover={handlePrefetch}/>
        </aside>
    )
}

export default FloatingGameSelector;
