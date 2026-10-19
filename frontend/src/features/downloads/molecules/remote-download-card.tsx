import { Link } from '@tanstack/react-router'
import { Server, Pause, Play, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RemoteDownloadProgress } from '@/lib/desktop/api'
import { formatBytes, cn } from '@/lib/utils'
import { formatEta } from '../utils'
import './download-card.scss'

interface RemoteDownloadCardProps {
  transfer: RemoteDownloadProgress
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
}

export const RemoteDownloadCard = ({
  transfer,
  onPause,
  onResume,
  onCancel,
}: RemoteDownloadCardProps) => {
  const isDownloading = transfer.status === 'downloading'
  const isPaused = transfer.status === 'paused'
  const isCompleted = transfer.status === 'completed'
  const isError = transfer.status === 'error'

  return (
    <div className="dk-download-card border border-[var(--dk-separator)] bg-[var(--dk-surface-base)] hover:border-primary/40 transition-colors">
      {/* Icon */}
      <div
        className={cn(
          'dk-download-card__icon',
          isDownloading && 'bg-cyan-500/20 text-cyan-400',
          isPaused && 'bg-amber-500/20 text-amber-400',
          isCompleted && 'bg-green-500/20 text-green-400',
          isError && 'bg-red-500/20 text-red-400'
        )}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : isError ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <Server className={cn('h-5 w-5', isDownloading && 'animate-pulse')} />
        )}
      </div>

      {/* Info */}
      <div className="dk-download-card__info">
        {transfer.mediaItemId ? (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: 'game', mediaId: transfer.mediaItemId }}
            className="dk-download-card__title dk-download-card__title--link font-semibold text-foreground hover:text-primary transition-colors"
          >
            {transfer.gameTitle}
          </Link>
        ) : (
          <p className="dk-download-card__title font-semibold text-foreground">
            {transfer.gameTitle || transfer.filename}
          </p>
        )}

        <p className="dk-download-card__subtitle text-muted-foreground">
          {transfer.filename} · <span className="text-primary font-medium">Remote Server</span>
        </p>

        <div className="dk-download-card__meta flex flex-wrap items-center gap-2 mt-1">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider text-[10px]',
              isDownloading && 'bg-primary/20 text-primary',
              isPaused && 'bg-amber-500/20 text-amber-500 dark:text-amber-300',
              isCompleted && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300',
              isError && 'bg-destructive/20 text-destructive'
            )}
          >
            {isDownloading ? 'Downloading' : isPaused ? 'Paused' : isCompleted ? 'Completed' : 'Error'}
          </span>

          <span className="text-xs text-foreground/80 font-medium tabular-nums">
            {transfer.percentage}%
          </span>

          <span className="text-xs text-muted-foreground">
            {formatBytes(transfer.downloadedBytes)} / {formatBytes(transfer.totalBytes)}
          </span>

          {isDownloading && transfer.speedMBps > 0 && (
            <span className="text-xs font-mono text-primary font-semibold">
              {transfer.speedMBps.toFixed(1)} MB/s
            </span>
          )}

          {isDownloading && transfer.etaSeconds > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatEta(transfer.etaSeconds)}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="dk-download-card__progress mt-2">
          <div
            className={cn(
              'dk-download-card__progress-bar',
              isPaused ? 'bg-amber-500' : 'bg-primary'
            )}
            style={{ width: `${Math.min(100, Math.max(0, transfer.percentage))}%` }}
          />
        </div>

        {transfer.error && (
          <p className="dk-download-card__error text-xs text-destructive mt-1">
            {transfer.error}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="dk-download-card__actions flex items-center gap-1.5 shrink-0">
        {isDownloading && (
          <button
            onClick={() => onPause(transfer.id)}
            className="dk-download-card__action-btn p-2 rounded-lg bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
            title="Pause download"
          >
            <Pause className="h-4 w-4" />
          </button>
        )}

        {isPaused && (
          <button
            onClick={() => onResume(transfer.id)}
            className="dk-download-card__action-btn p-2 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary transition-colors cursor-pointer"
            title="Resume download"
          >
            <Play className="h-4 w-4 fill-current" />
          </button>
        )}

        <button
          onClick={() => onCancel(transfer.id)}
          className="dk-download-card__action-btn p-2 rounded-lg bg-[var(--dk-surface-ghost)] hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
};
