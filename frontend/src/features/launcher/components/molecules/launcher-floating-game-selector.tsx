import {useCallback, useMemo} from 'react'
import {useNavigate, useParams} from '@tanstack/react-router'
import {Gamepad2, Menu} from 'lucide-react'
import { useNavigation } from '@navigation'
import {useLocalGames} from '@/old-features/game-scanner/game-queries'
import {usePopularGames} from '@/features/launcher/queries'
import {hasDesktopAPI} from '@/lib/desktop/api'
import {toDisplayGame} from '@/features/launcher/utils'
import GameThumbList from '@/features/launcher/components/molecules/launcher-game-thumb-list'
import type {DisplayGame, LauncherPlatform} from '@/features/launcher/types'

export function FloatingGameSelector() {
    const {toggle: toggleNav} = useNavigation()
    const navigate = useNavigate()
    const p = useParams({strict: false})
    const activeGameId = (p as Record<string, string>).gameId || null
    const isDesktop = hasDesktopAPI()

    const {data: localGames = []} = useLocalGames(
        isDesktop ? {installed: true, sortBy: 'last_played_at', sortDir: 'desc'} : undefined,
    )
    const {data: popularGames = []} = usePopularGames()

    const games: DisplayGame[] = useMemo(() => {
        if (isDesktop) return localGames.map(toDisplayGame).filter((g) => g.isInstalled)
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

    const goToLibrary = useCallback(() => {
        navigate({to: '/library'})
    }, [navigate])

    return (
        <aside
            style={{
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                maxHeight: 'calc(100vh - 6rem)',
            }}
            className={
                'fixed z-30 w-[4rem] flex flex-col items-center ' +
                'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] ' +
                'backdrop-blur-lg shadow-[var(--dk-shadow-glass)] rounded-[2rem] overflow-hidden'
            }
        >
            <button
                onClick={toggleNav}
                className="z-1 absolute top-2 w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)] shrink-0 mt-2"
                title="Main Menu"
            >
                <Menu size={16}/>
            </button>

            <GameThumbList games={games} activeGameId={activeGameId} onSelect={handleSelectGame}/>

            <button title="Browse All Games" onClick={goToLibrary} className="absolute bottom-2 w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)] shrink-0 mb-2">
                <Gamepad2 size={16}/>
            </button>
        </aside>
    )
}

export default FloatingGameSelector;
