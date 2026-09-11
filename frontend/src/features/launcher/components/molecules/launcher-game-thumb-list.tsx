import { useEffect, useRef } from 'react'
import { SearchX } from 'lucide-react'
import { osName } from "@/lib/utils"
import GameThumb from "@/features/launcher/components/atoms/launcher-game-thumb"
import type {DisplayGame} from "@/features/launcher/types"

interface GameThumbListProps {
    games: DisplayGame[]
    activeGameId: string | null
    onSelect: (id: string) => void
    onHover?: (game: DisplayGame) => void
}

const GameThumbList = ({ games, activeGameId, onSelect, onHover }: GameThumbListProps) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const activeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (activeRef.current && containerRef.current) {
            const container = containerRef.current
            const el = activeRef.current
            const containerRect = container.getBoundingClientRect()
            const elRect = el.getBoundingClientRect()
            const scrollTop = container.scrollTop + elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2
            container.scrollTo({ top: scrollTop, behavior: 'smooth' })
        }
    }, [activeGameId])

    return (
        <div
            ref={containerRef}
            className="min-h-[2rem] flex-1 flex flex-col items-center gap-3 overflow-y-scroll overflow-x-hidden scrollbar-none w-full h-full px-1.5 pt-2 pb-4"
        >
            {games.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 px-1 text-center text-white/40 text-[10px] gap-1.5 animate-fadeIn">
                    <SearchX size={16} className="text-white/30" />
                    <span>No games</span>
                </div>
            ) : (
                games.map((game: DisplayGame) => {
                    const isActive = game.id === activeGameId
                    return (
                        <button
                            key={game.id}
                            ref={isActive ? activeRef : undefined}
                            onClick={() => onSelect(game.id)}
                            onMouseEnter={() => onHover?.(game)}
                            className={
                                "w-[46px] h-[46px] rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 relative shrink-0 " +
                                (isActive
                                    ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.25)] scale-105"
                                    : "border-transparent opacity-50 hover:opacity-100 hover:border-white/20"
                                )
                            }
                            title={`${game.title}${game.isInstalled ? ' ● Installed' : ''}`}
                        >
                            <GameThumb icon={game.iconUrl || game.posterUrl || undefined} alt={game.title} />
                            {game.isInstalled && (
                                <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] border border-black/30 shadow-sm" />
                            )}
                            {!game.isInstalled && game.platform === 'iso' && (
                                osName !== 'Windows' ? (
                                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500/50 border border-black/30 shadow-sm" title="Can't install this on macOS" />
                                ) : (
                                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border border-black/30 shadow-sm" title="Ready to Install" />
                                )
                            )}
                        </button>
                    )
                })
            )}
        </div>
    )
}

export default GameThumbList
