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

export function RemoteDownloadCard({
  transfer,
  onPause,
  onResume,
  onCancel,
}: RemoteDownloadCardProps) {
  const isDownloading = transfer.status === 'downloading'
  const isPaused = transfer.status === 'paused'
  const isCompleted = transfer.status === 'completed'
  const isError = transfer.status === 'error'

  return (
    <div className="dk-download-card border border-cyan-500/20 bg-neutral-900/60 hover:border-cyan-500/40 transition-colors">
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
            className="dk-download-card__title dk-download-card__title--link font-semibold text-white hover:text-cyan-400"
          >
            {transfer.gameTitle}
          </Link>
        ) : (
          <p className="dk-download-card__title font-semibold text-white">
            {transfer.gameTitle || transfer.filename}
          </p>
        )}

        <p className="dk-download-card__subtitle text-neutral-400">
          {transfer.filename} · <span className="text-cyan-400/80">Remote Server</span>
        </p>

        <div className="dk-download-card__meta flex flex-wrap items-center gap-2 mt-1">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider text-[10px]',
              isDownloading && 'bg-cyan-500/20 text-cyan-300',
              isPaused && 'bg-amber-500/20 text-amber-300',
              isCompleted && 'bg-green-500/20 text-green-300',
              isError && 'bg-red-500/20 text-red-300'
            )}
          >
            {isDownloading ? 'Downloading' : isPaused ? 'Paused' : isCompleted ? 'Completed' : 'Error'}
          </span>

          <span className="text-xs text-neutral-300 font-medium tabular-nums">
            {transfer.percentage}%
          </span>

          <span className="text-xs text-neutral-400">
            {formatBytes(transfer.downloadedBytes)} / {formatBytes(transfer.totalBytes)}
          </span>

          {isDownloading && transfer.speedMBps > 0 && (
            <span className="text-xs font-mono text-cyan-400">
              {transfer.speedMBps.toFixed(1)} MB/s
            </span>
          )}

          {isDownloading && transfer.etaSeconds > 0 && (
            <span className="text-xs text-neutral-400">
              {formatEta(transfer.etaSeconds)}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="dk-download-card__progress mt-2">
          <div
            className={cn(
              'dk-download-card__progress-bar',
              isPaused ? 'bg-amber-500' : 'bg-cyan-400'
            )}
            style={{ width: `${Math.min(100, Math.max(0, transfer.percentage))}%` }}
          />
        </div>

        {transfer.error && (
          <p className="dk-download-card__error text-xs text-red-400 mt-1">
            {transfer.error}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="dk-download-card__actions flex items-center gap-1.5 shrink-0">
        {isDownloading && (
          <button
            onClick={() => onPause(transfer.id)}
            className="dk-download-card__action-btn p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title="Pause download"
          >
            <Pause className="h-4 w-4" />
          </button>
        )}

        {isPaused && (
          <button
            onClick={() => onResume(transfer.id)}
            className="dk-download-card__action-btn p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-white transition-colors"
            title="Resume download"
          >
            <Play className="h-4 w-4 fill-current" />
          </button>
        )}

        <button
          onClick={() => onCancel(transfer.id)}
          className="dk-download-card__action-btn p-2 rounded-lg bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
