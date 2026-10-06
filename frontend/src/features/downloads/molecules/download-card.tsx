// TODO: Review this file
import { Link } from '@tanstack/react-router';
import { Loader2, CheckCircle2, XCircle, Clock, FolderOpen, X, Trash2, ArchiveX } from 'lucide-react';
import type { Download as DownloadType } from '../types';
import { cn } from '@/lib/utils';
import './download-card.scss';

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  queued: Clock,
  downloading: Loader2,
  processing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  deleted: ArchiveX,
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  deleted: 'Deleted',
};

import { formatSize } from '../utils'

interface DownloadCardProps {
  download: DownloadType;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenFolder?: (path: string) => void;
}

export const DownloadCard = ({ download, onCancel, onDelete, onOpenFolder }: DownloadCardProps) => {
  const StatusIcon = STATUS_ICONS[download.status] ?? Clock;
  const isActive = download.status === 'queued' || download.status === 'downloading';
  const gameTitle = download.mediaItemTitle ?? download.nzbName ?? 'Unknown';
  const hasMediaLink = !!download.mediaItemId;

  return (
    <div className="dk-download-card">
      {/* Icon */}
      <div className={cn('dk-download-card__icon', `dk-download-card__icon--${download.status}`)}>
        <StatusIcon className={cn('h-5 w-5', download.status === 'downloading' && 'animate-spin')} />
      </div>

      {/* Info */}
      <div className="dk-download-card__info">
        {hasMediaLink ? (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: 'game', mediaId: download.mediaItemId! }}
            className="dk-download-card__title dk-download-card__title--link"
          >
            {gameTitle}
          </Link>
        ) : (
          <p className="dk-download-card__title">{gameTitle}</p>
        )}
        {download.mediaItemTitle && download.nzbName && (
          <p className="dk-download-card__subtitle">{download.nzbName}</p>
        )}
        <div className="dk-download-card__meta">
          <span className={cn('dk-download-card__status', `dk-download-card__status--${download.status}`)}>
            {STATUS_LABELS[download.status] ?? download.status}
          </span>
          {isActive && download.percentage != null && (
            <span className="dk-download-card__percentage">{download.percentage}%</span>
          )}
          {download.nzbSize && (
            <span className="dk-download-card__size">{formatSize(download.nzbSize)}</span>
          )}
          {download.completedAt && (
            <span className="dk-download-card__date">
              {new Date(download.completedAt).toLocaleString()}
            </span>
          )}
        </div>
        {isActive && download.percentage != null && (
          <div className="dk-download-card__progress">
            <div
              className="dk-download-card__progress-bar"
              style={{ width: `${download.percentage}%` }}
            />
          </div>
        )}
        {download.errorMessage && (
          <p className="dk-download-card__error">{download.errorMessage}</p>
        )}
      </div>

      {/* Actions */}
      <div className="dk-download-card__actions">
        {isActive && onCancel && (
          <button
            onClick={() => onCancel(download.id)}
            className="dk-download-card__action-btn"
            title="Cancel download"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!isActive && onDelete && (
          <button
            onClick={() => onDelete(download.id)}
            className="dk-download-card__action-btn"
            title="Delete download"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {download.status === 'completed' && download.isoPath && onOpenFolder && (
          <button
            onClick={() => onOpenFolder(download.isoPath!)}
            className="dk-download-card__action-btn dk-download-card__action-btn--primary"
            title="Open folder"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
