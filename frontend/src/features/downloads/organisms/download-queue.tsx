// TODO: Review this file
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/providers/auth';
import { useFeature } from '@/features/_config';
import { useDownloads } from '../use-downloads';
import { DownloadCard } from '../molecules/download-card';
import { DkButton } from '@/old-features/ui/atoms/button';
import { cn } from '@/lib/utils';
import { isDesktop } from '@/lib/desktop/api';
import './download-queue.scss';

export function DownloadQueuePage() {
  const { user } = useAuth();
  const downloadsEnabled = useFeature('downloads');
  const userId = user?.id;
  const { downloads, loading, pollQueue, cancelDownload } = useDownloads(userId);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'deleted'>('all');

  const desktop = isDesktop();

  // Admin + experiment gate
  if (!user?.isAdmin || !downloadsEnabled) {
    return (
      <div className="dk-downloads__gate">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="dk-downloads__gate-heading">Downloads</h1>
        <p className="dk-downloads__gate-desc">
          This feature is not available.
        </p>
      </div>
    );
  }

  if (!desktop) {
    return (
      <div className="dk-downloads__gate">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="dk-downloads__gate-heading">Downloads</h1>
        <p className="dk-downloads__gate-desc">
          Download management is only available in the Otix desktop app.
        </p>
      </div>
    );
  }

  const filtered = downloads.filter((d) => {
    if (filter === 'active') return d.status === 'queued' || d.status === 'downloading';
    if (filter === 'completed') return d.status === 'completed' || d.status === 'failed';
    if (filter === 'deleted') return d.status === 'deleted';
    if (filter === 'all') return d.status !== 'deleted';
    return true;
  });

  const activeCount = downloads.filter(d => d.status === 'queued' || d.status === 'downloading').length;

  return (
    <div className="dk-downloads__page">
      <Helmet>
        <title>Downloads - Otix</title>
        <meta name="description" content="Manage your downloads on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <div className="dk-downloads__header">
        <div>
          <h1 className="dk-downloads__heading">Downloads</h1>
          {activeCount > 0 && (
            <p className="dk-downloads__active-count">{activeCount} active</p>
          )}
        </div>
        <DkButton size="sm" variant="ghost" onClick={pollQueue} loading={loading} className="shadow-none">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </DkButton>
      </div>

      {/* Filter tabs */}
      <div className="dk-downloads__filters">
        {(['all', 'active', 'completed', 'deleted'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'dk-downloads__filter-btn',
              filter === f
                ? 'dk-downloads__filter-btn--active'
                : 'dk-downloads__filter-btn--inactive',
            )}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'completed' ? 'Completed' : 'Deleted'}
          </button>
        ))}
      </div>

      {/* Download list */}
      {filtered.length === 0 ? (
        <div className="dk-downloads__empty">
          <Download className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="dk-downloads__empty-text">No downloads yet</p>
          <p className="dk-downloads__empty-sub">
            Browse a game and click Download to queue your first ISO.
          </p>
        </div>
      ) : (
        <div className="dk-downloads__list">
          {filtered.map((dl) => (
            <DownloadCard
              key={dl.id}
              download={dl}
              onCancel={cancelDownload}
              onDelete={cancelDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
