import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Film, Loader2, Clock, X, AlertCircle } from 'lucide-react'
import type { ServerArrQueueItem } from '../arr-types'
import { resolveMovieMetadata } from '../utils/episode-download'
import { formatBytes } from '@/lib/utils'

export interface DownloadMovieCardProps {
  item: ServerArrQueueItem
  onCancel?: (queueId: number | string) => void
  isCancelling?: boolean
  liveSpeed?: string | null
}

export const DownloadMovieCard = ({
  item,
  onCancel,
  isCancelling = false,
  liveSpeed,
}: DownloadMovieCardProps) => {
  const [imgError, setImgError] = useState(false)
  const meta = resolveMovieMetadata(item)

  const displayImage = imgError ? meta.backdropUrl : meta.posterUrl || meta.backdropUrl
  const isDownloading = meta.status.toLowerCase().includes('download')
  const isQueued = meta.status.toLowerCase().includes('queue')
  const isFailed = meta.status.toLowerCase().includes('fail') || meta.status.toLowerCase().includes('error')

  const speedText = liveSpeed || (item as any).speed

  return (
    <div
      data-testid={`download-movie-card-${item.id}`}
      className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-white/[0.04] shadow-[var(--dk-shadow-glass)] flex items-start sm:items-center gap-3.5 transition-all"
    >
      {/* 2:3 Movie Poster Thumbnail */}
      <div className="relative shrink-0 w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden bg-muted/40 shadow-inner flex items-center justify-center">
        {displayImage ? (
          <img
            src={displayImage}
            alt={meta.movieTitle}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Film className="h-6 w-6 opacity-60" />
            <span className="text-[9px] font-semibold tracking-wider uppercase opacity-60">Movie</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Title and Cancel */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {meta.mediaItemId ? (
                <Link
                  to="/media/$mediaType/$mediaId"
                  params={{ mediaType: 'movie', mediaId: String(meta.mediaItemId) }}
                  className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate"
                  title={meta.movieTitle}
                >
                  {meta.movieTitle}
                </Link>
              ) : (
                <span className="text-sm font-bold text-foreground truncate" title={meta.movieTitle}>
                  {meta.movieTitle}
                </span>
              )}

              {meta.year && (
                <span className="text-xs text-muted-foreground font-medium">
                  ({meta.year})
                </span>
              )}

              {/* Status Indicator */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                {isDownloading ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                ) : isQueued ? (
                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                ) : isFailed ? (
                  <AlertCircle className="h-2.5 w-2.5 text-destructive" />
                ) : null}
                <span className="capitalize">{meta.status}</span>
              </span>
            </div>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              disabled={isCancelling}
              className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              title="Cancel Download"
              aria-label="Cancel download"
            >
              {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Quality and Release Details */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground font-medium">
          {meta.resolution && (
            <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold">
              {meta.resolution}
            </span>
          )}
          {meta.quality && (
            <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
              {meta.quality}
            </span>
          )}
          <span className="px-1.5 py-0.2 rounded bg-muted/60 uppercase text-[9px] font-semibold tracking-wider">
            {meta.protocol}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.max(meta.percentage, 2)}%` }}
            />
          </div>

          {/* Stats Footer Row */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {meta.percentage.toFixed(1)}%
              </span>
              {meta.sizeBytes > 0 && (
                <span>
                  {formatBytes(meta.downloadedBytes)} / {formatBytes(meta.sizeBytes)}
                </span>
              )}
              {speedText && speedText !== '0 B/s' && <span>· {speedText}</span>}
            </div>

            {meta.timeleft && (
              <span className="font-mono text-muted-foreground">
                ETA: {meta.timeleft}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
