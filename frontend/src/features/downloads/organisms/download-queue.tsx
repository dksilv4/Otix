import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useExperiment } from '@/features/experiments/experiments-provider';
import { useDownloads } from '../use-downloads';
import { DownloadCard } from '../molecules/download-card';
import { DkButton } from '@/features/dk-ui/atoms/button';
import { cn } from '@/lib/utils';

export function DownloadQueuePage() {
  const { user } = useAuth();
  const { enabled: downloadsEnabled } = useExperiment('download_integration');
  const userId = user?.id;
  const { downloads, loading, pollQueue, cancelDownload } = useDownloads(userId);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'deleted'>('all');

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  // Admin + experiment gate
  if (!user?.isAdmin || !downloadsEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="text-xl font-bold tracking-[-0.02em]">Downloads</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          This feature is not available.
        </p>
      </div>
    );
  }

  if (!isElectron) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Download className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="text-xl font-bold tracking-[-0.02em]">Downloads</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
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
    <div className="mx-auto max-w-3xl pb-16">
      <Helmet>
        <title>Downloads - Otix</title>
        <meta name="description" content="Manage your downloads on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">Downloads</h1>
          {activeCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{activeCount} active</p>
          )}
        </div>
        <DkButton size="sm" variant="ghost" onClick={pollQueue} loading={loading} className="shadow-none">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </DkButton>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'completed', 'deleted'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === f
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]',
            )}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'completed' ? 'Completed' : 'Deleted'}
          </button>
        ))}
      </div>

      {/* Download list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center rounded-2xl bg-[var(--dk-surface-base)]">
          <Download className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No downloads yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Browse a game and click Download to queue your first ISO.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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
