/* ── LauncherShelf — self-contained shelf: My Games + Popular tabs ── */

import {useState} from 'react'
import {cn} from '@/lib/utils'
import {MediaCard} from '@/features/dk-ui/molecules/media-card'
import {usePopularGames} from '@/features/games/games-queries'
import {useLocalGames} from '@/features/game-scanner/game-queries'

type ShelfTab = 'my-games' | 'popular'

const TAB_LABELS: Record<ShelfTab, string> = {
    'my-games': 'My Games',
    popular: 'Popular',
}

interface LauncherShelfProps {
    id?: string
}

export function LauncherShelf({id}: LauncherShelfProps) {
    const {data: localGames = []} = useLocalGames()
    const {data: popularGames = []} = usePopularGames()
    const [shelfTab, setShelfTab] = useState<ShelfTab>('my-games')

    return (
        <div id={id}>
            {/* ── Tab bar ── */}
            <div className="flex items-center justify-between pb-2.5 mb-5">
                <h3 className="text-sm font-black text-white/90 uppercase tracking-wider">
                    {TAB_LABELS[shelfTab]}
                </h3>

                <div className="flex gap-6 items-center">
                    {(Object.keys(TAB_LABELS) as ShelfTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setShelfTab(tab)}
                            className={cn(
                                "text-[11px] font-semibold transition-all cursor-pointer pb-0.5",
                                shelfTab === tab
                                    ? "text-white border-b border-white"
                                    : "text-white/35 hover:text-white/60"
                            )}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Poster cards ── */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x">
                {shelfTab === 'my-games' ? (
                    localGames.length === 0 ? (
                        <div className="flex items-center justify-center h-32 w-full text-white/30 text-xs font-semibold">
                            No local games matched yet. Run a scan!
                        </div>
                    ) : (
                        localGames.map((g) => (
                            <MediaCard
                                key={`shelf-${g.id}`}
                                id={g.data?.id || g.id}
                                mediaType="game"
                                title={g.title}
                                posterUrl={g.posterUrl || g.iconUrl}
                                className="shrink-0 snap-start"
                            />
                        ))
                    )
                ) : popularGames.length === 0 ? (
                    <div className="flex items-center justify-center h-32 w-full text-white/30 text-xs font-semibold">
                        No popular games loaded.
                    </div>
                ) : (
                    popularGames.map((g) => (
                        <MediaCard
                            key={`shelf-${g.id}`}
                            id={g.id}
                            mediaType="game"
                            title={g.title}
                            posterUrl={g.posterUrl}
                            avgRating={g.avgRating}
                            ratingCount={g.ratingCount}
                            className="shrink-0 snap-start"
                        />
                    ))
                )}
            </div>
        </div>
    )
}
