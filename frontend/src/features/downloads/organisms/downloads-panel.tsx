import { useState } from 'react'
import { Download as DownloadIcon, Loader2, Clock, X } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-provider'
import { useDownloads } from '@/features/downloads/use-downloads'
import type { Download } from '@/features/downloads/types'
import { cn } from '@/lib/utils'

// ── Helpers ──

const dlIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  queued: Clock,
  downloading: Loader2,
  processing: Loader2,
}

const dlColors: Record<string, string> = {
  queued: 'text-amber-400',
  downloading: 'text-blue-400',
  processing: 'text-purple-400',
}

const dlLabels: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  processing: 'Processing',
}

function formatDLBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

// ── Compact row ──

export function CompactDownloadRow({ download, onCancel }: { download: Download; onCancel: (id: string) => void }) {
  const isActive = download.status === 'queued' || download.status === 'downloading'
  const StatusIcon = dlIcons[download.status] ?? Clock
  const colorClass = dlColors[download.status] ?? 'text-muted-foreground'
  const progress = download.percentage ?? 0

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors group">
      <StatusIcon className={cn('h-4 w-4 shrink-0', colorClass, download.status === 'downloading' && 'animate-spin')} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate text-white/80">
          {download.mediaItemTitle ?? download.nzbName ?? 'Unknown'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[10px] font-medium', colorClass)}>
            {dlLabels[download.status] ?? download.status}
          </span>
          <span className="text-[10px] text-white/30 tabular-nums">{progress}%</span>
          {download.nzbSize && (
            <span className="text-[10px] text-white/20">{formatDLBytes(download.nzbSize)}</span>
          )}
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {isActive && (
        <button
          onClick={() => onCancel(download.id)}
          className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-all"
          title="Cancel download"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Downloads Panel ──

export function DownloadsPanel() {
  const [dismissed, setDismissed] = useState(false)
  const { user: currentUser } = useAuth()
  const { downloads, cancelDownload } = useDownloads(currentUser?.id)

  const active = downloads.filter(d => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing')
  if (active.length === 0 || dismissed) return null

  return (
    <div
      className={cn(
        'rounded-xl bg-white/[0.04] p-3',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DownloadIcon className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-semibold text-muted-foreground">
            Downloads &middot; {active.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.08] transition-colors"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1.5">
        {active.map(d => (
          <CompactDownloadRow key={d.id} download={d} onCancel={cancelDownload} />
        ))}
      </div>
    </div>
  )
}
