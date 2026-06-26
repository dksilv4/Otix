import { memo } from 'react'
import type { ShelfCardProps } from '../../types'

export const MinimalShelfCard = memo(function MinimalShelfCard({
  game,
  catalogGame,
  onClick,
}: ShelfCardProps) {
  const id = game?.id ?? catalogGame?.id ?? ''
  const name = game?.name ?? catalogGame?.name ?? 'Unknown'
  const cover = game?.cover_url ?? catalogGame?.cover_url

  return (
    <button
      onClick={() => onClick(id)}
      className="group w-full aspect-[3/4] bg-[#1a1a1a] border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
    >
      {cover ? (
        <img src={cover} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs uppercase tracking-wider p-2 text-center">
          {name}
        </div>
      )}
    </button>
  )
})
