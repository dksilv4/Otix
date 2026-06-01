import { Link } from '@tanstack/react-router';
import { Loader2, CheckCircle2, XCircle, Clock, FolderOpen, X } from 'lucide-react';
import type { Download as DownloadType } from '../types';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  queued: Clock,
  downloading: Loader2,
  processing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  queued: 'text-amber-400',
  downloading: 'text-blue-400',
  processing: 'text-purple-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface DownloadCardProps {
  download: DownloadType;
  onCancel?: (id: string) => void;
  onOpenFolder?: (path: string) => void;
}

export function DownloadCard({ download, onCancel, onOpenFolder }: DownloadCardProps) {
  const StatusIcon = STATUS_ICONS[download.status] ?? Clock;
  const colorClass = STATUS_COLORS[download.status] ?? 'text-muted-foreground';
  const isActive = download.status === 'queued' || download.status === 'downloading';
  const gameTitle = download.mediaItemTitle ?? download.nzbName ?? 'Unknown';
  const hasMediaLink = !!download.mediaItemId;

  return (
    <div className="flex items-center gap-4 rounded-xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]">
      {/* Icon */}
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/20', colorClass)}>
        <StatusIcon className={cn('h-5 w-5', download.status === 'downloading' && 'animate-spin')} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        {hasMediaLink ? (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: 'game', mediaId: download.mediaItemId! }}
            className="text-sm font-medium truncate block hover:text-primary transition-colors"
          >
            {gameTitle}
          </Link>
        ) : (
          <p className="text-sm font-medium truncate">{gameTitle}</p>
        )}
        {download.mediaItemTitle && download.nzbName && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{download.nzbName}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-xs font-medium', colorClass)}>
            {STATUS_LABELS[download.status] ?? download.status}
          </span>
          {isActive && download.percentage != null && (
            <span className="text-xs text-muted-foreground tabular-nums">{download.percentage}%</span>
          )}
          {download.nzbSize && (
            <span className="text-xs text-muted-foreground">{formatSize(download.nzbSize)}</span>
          )}
          {download.completedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(download.completedAt).toLocaleString()}
            </span>
          )}
        </div>
        {isActive && download.percentage != null && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--dk-surface-raised)] overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${download.percentage}%` }}
            />
          </div>
        )}
        {download.errorMessage && (
          <p className="text-xs text-red-400 mt-1 line-clamp-2">{download.errorMessage}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isActive && onCancel && (
          <button
            onClick={() => onCancel(download.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Cancel download"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {download.status === 'completed' && download.isoPath && onOpenFolder && (
          <button
            onClick={() => onOpenFolder(download.isoPath!)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            title="Open folder"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
