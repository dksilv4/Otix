import { memo, useMemo } from 'react'
import { Play, Loader2, Check } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { formatDate, formatRuntime } from '@media'
import { cn } from '@/lib/utils'
import type { EpisodeOut, SeasonOut } from '@media/queries/media-queries'
import type { EpisodeDownloadActivity } from '@/features/media/hooks/use-media-download-activity'

export interface MediaShowEpisodeCardProps {
  episode: EpisodeOut
  seasonNumber: number
  showId: string
  showTitle?: string
  seasonPoster?: string | null
  seasons: SeasonOut[]
  isWatched?: boolean
  isLoading?: boolean
  download?: EpisodeDownloadActivity | null
  onPlay: (episode: EpisodeOut) => void
  onOpenDetails: (episode: EpisodeOut, sourceRect: DOMRect | null) => void
  onToggleWatched?: (episodeId: string, watched: boolean) => void
  className?: string
}

export const MediaShowEpisodeCard = memo(({
  episode,
  seasonNumber,
  showId,
  showTitle,
  seasonPoster,
  seasons: _seasons,
  isWatched = false,
  isLoading = false,
  download,
  onPlay,
  onOpenDetails,
  onToggleWatched,
  className,
}: MediaShowEpisodeCardProps) => {
  const thumb = episode.stillUrl || seasonPoster || undefined
  const runtime = useMemo(() => formatRuntime(episode.runtime), [episode.runtime])
  const formattedDate = useMemo(() => formatDate(episode.airDate), [episode.airDate])
  const epTitle = episode.name || `Episode ${episode.episodeNumber}`

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-stop-card-action]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    onOpenDetails(episode, rect)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-stop-card-action]')) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      onOpenDetails(episode, rect)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-thumb
      data-testid={`media-show-episode-card-${episode.id}`}
      data-context-type="episode"
      data-episode-id={episode.id}
      data-episode-number={episode.episodeNumber}
      data-season-number={seasonNumber}
      data-episode-title={epTitle}
      data-show-id={showId}
      data-show-title={showTitle}
      data-episode-still={thumb}
      data-episode-watched={isWatched ? 'true' : 'false'}
      aria-label={`Episode ${episode.episodeNumber}: ${epTitle}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative aspect-video w-[270px] sm:w-[310px] shrink-0 rounded-3xl overflow-hidden cursor-pointer select-none text-left',
        'border border-white/[0.06] shadow-md hover:shadow-2xl hover:-translate-y-1 transition duration-300',
        'bg-[var(--dk-surface-glass)]',
        className,
      )}
    >
      {/* ── 16:9 Full Bleed Cinematic Artwork ── */}
      <div className="absolute inset-0 overflow-hidden">
        <DkImage
          src={thumb}
          alt={epTitle}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          fallback={
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30 text-xs font-semibold">
              E{episode.episodeNumber}
            </div>
          }
        />
      </div>

      {/* Atmospheric Vignette Gradients */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

      {/* ── Top Bar: Unified Episode & Watched Pill (Left), Duration & Download (Right) ── */}
      <div className="absolute top-2.5 inset-x-3 flex items-center justify-between z-10 pointer-events-none">
        {onToggleWatched ? (
          <button
            type="button"
            data-stop-card-action
            data-watch-toggle
            aria-label={isWatched ? 'Mark episode as unwatched' : 'Mark episode as watched'}
            title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleWatched(episode.id, !isWatched)
            }}
            className={cn(
              'group/watch pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider transition-all duration-200 shadow-sm cursor-pointer border',
              isWatched
                ? 'bg-primary text-primary-foreground border-transparent shadow-primary/25'
                : 'bg-background/60 backdrop-blur-xl text-foreground/90 hover:bg-background/80 hover:text-foreground border-white/[0.06]',
            )}
          >
            {isWatched ? (
              <Check className="h-3 w-3 stroke-[2.5]" />
            ) : (
              <Check className="h-3 w-3 text-muted-foreground/35 group-hover/watch:text-foreground transition-colors" />
            )}
            <span>E{episode.episodeNumber}</span>
          </button>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider text-foreground bg-background/60 backdrop-blur-xl shadow-sm border border-white/[0.06]">
            E{episode.episodeNumber}
          </span>
        )}

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {runtime && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-foreground/90 bg-background/60 backdrop-blur-xl shadow-sm border border-white/[0.06] tabular-nums">
              {runtime}
            </span>
          )}

          {download && (
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[10px] tabular-nums bg-primary text-primary-foreground shadow-sm shadow-primary/30">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span>{download.percentage.toFixed(0)}%</span>
              </span>
              {download.timeleft && download.timeleft !== '00:00:00' && (
                <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[9px] tabular-nums text-foreground/90 bg-background/60 backdrop-blur-xl border border-white/[0.06]">
                  {download.timeleft}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Internal Floating Glass Action Dock (Full-Width Balanced Razor Dock: Zero Wasted Space) ── */}
      <div className="absolute inset-x-2.5 bottom-2.5 z-10 rounded-2xl p-2 sm:p-2.5 bg-background/70 backdrop-blur-2xl border border-white/[0.08] shadow-md group-hover:bg-background/88 group-hover:border-white/[0.12] group-hover:shadow-2xl transition-all duration-300 ease-out text-left flex flex-col gap-1">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Integrated Stream Play Button (Positioned on the LEFT) */}
          <button
            type="button"
            data-stop-card-action
            data-stream-btn
            aria-label={`Play ${epTitle}`}
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation()
              onPlay(episode)
            }}
            className="w-6 h-6 group-hover:w-7 group-hover:h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/30 group-hover:shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-3 h-3 group-hover:w-3.5 group-hover:h-3.5 animate-spin text-primary-foreground transition-all duration-300" />
            ) : (
              <Play className="w-2.5 h-2.5 group-hover:w-3.5 group-hover:h-3.5 fill-current ml-0.5 text-primary-foreground transition-all duration-300" />
            )}
          </button>

          {/* Title in Center (flex-1) */}
          <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate min-w-0 flex-1 group-hover:text-primary transition-colors leading-tight">
            {epTitle}
          </h4>

          {/* Air Date / Download Status on the RIGHT */}
          {formattedDate && !download && (
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formattedDate}
            </span>
          )}

          {download && (
            <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-muted-foreground shrink-0">
              <span className="text-primary font-medium">Downloading</span>
              {download.speed && <span>· {download.speed}</span>}
              {download.timeleft && download.timeleft !== '00:00:00' && (
                <span className="truncate">· {download.timeleft}</span>
              )}
            </div>
          )}
        </div>

        {/* Story Synopsis Preview (Full width across dock, reveals on hover with zero wasted indent) */}
        {episode.overview && (
          <p className="text-[11px] text-muted-foreground/85 line-clamp-2 max-h-0 opacity-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mt-1 transition-all duration-300 ease-out overflow-hidden leading-relaxed">
            {episode.overview}
          </p>
        )}

        {/* Floating Download Progress Bar inside the Dock */}
        {download && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-background/40 backdrop-blur-md overflow-hidden border border-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_var(--primary)]"
              style={{ width: `${Math.min(100, Math.max(0, download.percentage))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

MediaShowEpisodeCard.displayName = 'MediaShowEpisodeCard'
