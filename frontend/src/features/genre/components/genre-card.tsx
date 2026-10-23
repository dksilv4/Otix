import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { DkImage } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import type { GenreOption } from '../types'
import { getGenreVisual, DEFAULT_VISUAL } from '../visual'

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show: 'TV Shows',
  game: 'Games',
  music: 'Music',
}

export interface GenreCardProps {
  genre: GenreOption
  mediaType?: 'movie' | 'show' | 'game' | 'music'
  className?: string
  priority?: boolean
}

export const GenreCard = memo(({
  genre,
  mediaType,
  className,
  priority = false,
}: GenreCardProps) => {
  const visual = getGenreVisual(genre.slug) !== DEFAULT_VISUAL
    ? getGenreVisual(genre.slug)
    : getGenreVisual(genre.name)
  const Icon = visual.icon

  return (
    <Link
      to="/genre/$genreId"
      data-context-type="genre"
      data-genre-id={genre.slug}
      data-genre-name={genre.name}
      data-genre-media-type={mediaType}
      params={{ genreId: genre.slug }}
      search={mediaType ? { type: mediaType } : undefined}
      style={{
        '--genre-accent': visual.accentColor,
        '--genre-glow': `${visual.accentColor}40`,
      } as React.CSSProperties}
      className={cn(
        // Outer shell: no overflow clip so hover glow/shadow can breathe
        'group relative block select-none rounded-2xl',
        'shadow-[0_4px_20px_-2px_rgba(0,0,0,0.45)]',
        'hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.65),0_0_28px_0_var(--genre-glow)]',
        'hover:-translate-y-1.5 active:scale-[0.98]',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      aria-label={`Explore ${genre.name} genre`}
    >
      {/* Inner media plane: clips image/gradients only */}
      <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl aspect-[16/10] min-h-[175px] bg-neutral-950/80">
        <div className="absolute inset-0">
          <DkImage
            src={visual.image}
            alt={genre.name}
            priority={priority}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25" />
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-br opacity-50 group-hover:opacity-70 transition-opacity duration-500',
            visual.gradient,
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Soft watermark — no hard mask edge */}
        <Icon
          className="absolute right-3 bottom-3 h-16 w-16 text-white/[0.07] pointer-events-none select-none transition-all duration-500 ease-out group-hover:scale-105 group-hover:text-[var(--genre-accent)] group-hover:opacity-30"
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white/90 bg-black/50 backdrop-blur-md border border-white/[0.12] group-hover:border-white/[0.2] transition-colors duration-300">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: visual.accentColor }} />
              <span className="text-[11px] font-medium tracking-wide">
                {mediaType ? MEDIA_TYPE_LABELS[mediaType] || mediaType : 'Category'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <h3
              className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight"
              style={{
                textShadow: '0 2px 10px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)',
              }}
            >
              {genre.name}
            </h3>
            <p className="text-xs font-medium text-white/60 group-hover:text-white/90 transition-colors duration-200">
              Explore collection
            </p>
          </div>
        </div>

        {/* Clean bottom accent hairline */}
        <div
          className="absolute bottom-0 inset-x-0 h-px pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${visual.accentColor} 35%, ${visual.accentColor} 65%, transparent 100%)`,
          }}
        />
      </div>
    </Link>
  )
})
