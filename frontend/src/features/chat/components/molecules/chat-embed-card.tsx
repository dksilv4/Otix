import { Link } from '@tanstack/react-router'
import { Gamepad2, Film, Tv, ChevronRight } from 'lucide-react'
import type { EntityEmbedMetadata } from '../../types'

interface ChatEmbedCardProps {
  embed: EntityEmbedMetadata
}

export const ChatEmbedCard = ({ embed }: ChatEmbedCardProps) => {
  const isGame = embed.entityType === 'game'
  const isMovie = embed.entityType === 'movie'
  const isShow = embed.entityType === 'show'

  const targetUrl = isGame
    ? `/game/${embed.entityId}`
    : `/media/${embed.entityId}`

  const imageSrc = embed.coverUrl || embed.posterUrl

  return (
    <Link
      to={targetUrl}
      className="mt-2 block rounded-2xl overflow-hidden bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.06] transition-all group max-w-[280px] text-left shadow-xs cursor-pointer select-none"
    >
      {imageSrc && (
        <div className="w-full h-32 overflow-hidden bg-muted relative">
          <img
            src={imageSrc}
            alt={embed.title}
            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-base)]/80 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--dk-surface-overlay)]/90 backdrop-blur-md text-[10px] font-semibold text-foreground uppercase tracking-wider">
            {isGame && <Gamepad2 className="w-3 h-3 text-primary" />}
            {isMovie && <Film className="w-3 h-3 text-primary" />}
            {isShow && <Tv className="w-3 h-3 text-primary" />}
            <span>{embed.entityType}</span>
          </div>
        </div>
      )}

      <div className="p-3">
        {!imageSrc && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {isGame && <Gamepad2 className="w-3 h-3 text-primary" />}
            {isMovie && <Film className="w-3 h-3 text-primary" />}
            {isShow && <Tv className="w-3 h-3 text-primary" />}
            <span>{embed.entityType}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <h5 className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {embed.title}
          </h5>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {embed.releaseYear && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {embed.releaseYear}
          </p>
        )}
      </div>
    </Link>
  )
};
