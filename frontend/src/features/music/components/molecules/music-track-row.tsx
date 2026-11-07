import { memo } from 'react'
import { Play, Pause, HardDrive } from 'lucide-react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { formatTrackDuration } from '../../utils/music-helpers'

export interface MusicTrackRowProps {
  index: number
  trackNumber?: number | null
  title: string
  artist: string
  albumName?: string
  durationMs?: number | null
  coverArtUrl?: string | null
  source?: 'plex' | 'local'
  isActive?: boolean
  isPlaying?: boolean
  onPlay: () => void
}

export const MusicTrackRow = memo(({
  index,
  trackNumber,
  title,
  artist,
  albumName,
  durationMs,
  coverArtUrl,
  source,
  isActive = false,
  isPlaying = false,
  onPlay,
}: MusicTrackRowProps) => {
  return (
    <div
      onClick={onPlay}
      className={`group flex items-center gap-3.5 rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${
        isActive ? 'bg-[var(--dk-surface-raised)] text-primary' : 'hover:bg-[var(--dk-surface-ghost-hover)]'
      }`}
    >
      {/* Index or Play icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center text-xs text-muted-foreground">
        {isActive && isPlaying ? (
          <div className="flex items-end gap-0.5 h-3.5 w-3.5">
            <span className="w-1 bg-primary rounded-full animate-equalizer" style={{ height: '60%' }} />
            <span className="w-1 bg-primary rounded-full animate-equalizer" style={{ height: '100%', animationDelay: '0.2s' }} />
            <span className="w-1 bg-primary rounded-full animate-equalizer" style={{ height: '40%', animationDelay: '0.4s' }} />
          </div>
        ) : (
          <>
            <span className="group-hover:hidden font-mono">
              {trackNumber ?? index + 1}
            </span>
            <button
              type="button"
              className="hidden group-hover:flex items-center justify-center text-foreground hover:text-primary transition-colors"
              aria-label={`Play ${title}`}
            >
              {isActive && isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            </button>
          </>
        )}
      </div>

      {/* Optional tiny thumbnail */}
      {coverArtUrl && (
        <img
          src={coverArtUrl}
          alt={title}
          className="h-9 w-9 shrink-0 rounded-lg object-cover bg-[var(--dk-surface-raised)]"
          loading="lazy"
        />
      )}

      {/* Track details */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-medium ${isActive ? 'text-primary font-semibold' : 'text-foreground'}`}>
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {artist}
        </span>
      </div>

      {/* Album name if wide */}
      {albumName && (
        <span className="hidden md:block truncate text-xs text-muted-foreground w-1/3">
          {albumName}
        </span>
      )}

      {/* Source badge */}
      {source && (
        <span
          className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--dk-surface-glass)] text-muted-foreground border border-white/[0.04]"
          title={`Source: ${source === 'plex' ? 'Plex' : 'Local Files'}`}
        >
          {source === 'plex' ? <PlexIcon className="h-2.5 w-2.5" /> : <HardDrive className="h-2.5 w-2.5" />}
          <span className="capitalize">{source}</span>
        </span>
      )}

      {/* Duration */}
      <span className="shrink-0 text-xs text-muted-foreground font-mono">
        {formatTrackDuration(durationMs)}
      </span>
    </div>
  )
})

MusicTrackRow.displayName = 'MusicTrackRow'
