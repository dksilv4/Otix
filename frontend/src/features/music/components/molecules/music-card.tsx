import { Disc3, Play, HardDrive } from 'lucide-react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'

export interface MusicCardProps {
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  year?: number | string | null
  trackCount?: number | null
  source?: 'plex' | 'local'
  onPlay: () => void
  onClick?: () => void
}

export const MusicCard = ({
  title,
  subtitle,
  imageUrl,
  year,
  trackCount,
  source,
  onPlay,
  onClick,
}: MusicCardProps) => {
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-2 rounded-2xl p-3 bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-sm)] border border-white/[0.04] transition-colors duration-300 hover:scale-[1.02] cursor-pointer"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[var(--dk-surface-raised)]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-12 w-12 stroke-[1.5]" />
          </div>
        )}

        {/* Source Badge */}
        {source && (
          <div
            className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg bg-[var(--dk-surface-overlay)] backdrop-blur-md px-1.5 py-0.5 text-[10px] font-semibold text-foreground border border-white/[0.06] shadow-sm pointer-events-none"
            title={`Source: ${source === 'plex' ? 'Plex' : 'Local Files'}`}
          >
            {source === 'plex' ? <PlexIcon className="h-2.5 w-2.5" /> : <HardDrive className="h-2.5 w-2.5" />}
            <span className="capitalize">{source}</span>
          </div>
        )}

        {/* Hover play action overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--dk-surface-overlay)] opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
            aria-label={`Play ${title}`}
          >
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col min-w-0">
        <h4 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {title}
        </h4>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {year && (
            <>
              <span className="text-muted-foreground/30">/</span>
              <span>{year}</span>
            </>
          )}
          {trackCount !== undefined && trackCount !== null && (
            <>
              <span className="text-muted-foreground/30">/</span>
              <span>{trackCount} {trackCount === 1 ? 'track' : 'tracks'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
