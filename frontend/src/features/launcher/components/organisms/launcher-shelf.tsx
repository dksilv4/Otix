/* ── LauncherShelf — self-contained shelf: My Games + Popular tabs ── */

import { useState } from 'react'
import { LauncherMediaCard } from '@/features/launcher/components/molecules/launcher-media-card'
import { LauncherFoundGames } from '@/features/launcher/components/organisms/launcher-found-games'
import { usePopularGames } from '@/features/launcher/data/queries'
import { useLauncherVisibleGames } from '@/features/launcher/data/game-queries'
import { useVirtualRow } from '@/features/launcher/hooks/use-virtual-grid'
import { TAB_LABELS } from '@/features/launcher/utils/launcher-constants'
import type { ShelfTab } from '@/features/launcher/types'

interface LauncherShelfProps {
  id?: string
}

export const LauncherShelf = ({ id }: LauncherShelfProps) => {
  const { data: localGames = [], isLoading: localLoading } = useLauncherVisibleGames()
  const { data: popularGames = [], isLoading: popularLoading } = usePopularGames()
  const [shelfTab, setShelfTab] = useState<ShelfTab>('my-games')

  const activeGames: (Parameters<typeof LauncherMediaCard>[0]['game'])[] =
    shelfTab === 'my-games' ? localGames : popularGames
  const isLoading = shelfTab === 'my-games' ? localLoading : popularLoading
  const emptyMessage =
    shelfTab === 'my-games'
      ? 'No local games matched yet. Run a scan!'
      : 'No popular games loaded.'

  const { virtualItems, paddingStart, paddingEnd, containerRef } = useVirtualRow(
    activeGames,
    { itemWidth: 180, gap: 16, threshold: 24 },
  )

  return (
    <div id={id}>
      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between pb-2.5 mb-5">
        <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
          {TAB_LABELS[shelfTab]}
        </h3>

        <div className="flex gap-6 items-center">
          {(Object.keys(TAB_LABELS) as ShelfTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setShelfTab(tab)}
              className={
                'text-[11px] font-semibold transition-all cursor-pointer pb-0.5 ' +
                (shelfTab === tab
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Poster cards ── */}
      <div
        ref={containerRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32 w-full text-muted-foreground text-xs font-semibold">
            Loading...
          </div>
        ) : activeGames.length === 0 ? (
          <div className="flex items-center justify-center h-32 w-full text-muted-foreground text-xs font-semibold">
            {emptyMessage}
          </div>
        ) : (
          <>
            {paddingStart > 0 && (
              <div style={{ width: paddingStart, flexShrink: 0 }} aria-hidden="true" />
            )}
            {virtualItems.map(({ item: g, index }) => (
              <LauncherMediaCard
                key={`shelf-${g.id}`}
                game={g}
                priority={index < 5}
                className="w-[180px] shrink-0 snap-start"
              />
            ))}
            {paddingEnd > 0 && (
              <div style={{ width: paddingEnd, flexShrink: 0 }} aria-hidden="true" />
            )}
          </>
        )}
      </div>

      {shelfTab === 'my-games' && (
        <LauncherFoundGames className="mt-6" compact />
      )}
    </div>
  )
};
