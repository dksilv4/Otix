import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  FileCheck2,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { DkInput } from '@ui/atoms/input'
import type { ServerDownloadHistoryItem } from '../usenet-types'
import {
  resolveDownloadDisplayTitle,
  formatRelativeTime,
  statusBadgeConfig,
  filterHistoryItems,
} from '../utils'

export interface DownloadHistoryPanelProps {
  items: ServerDownloadHistoryItem[]
  isLoading?: boolean
  className?: string
}

const HistoryStatusIcon = ({ status }: { status: string }) => {
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'complete') {
    return <CheckCircle2 className="h-4 w-4 text-[var(--status-online)] shrink-0" />
  }
  if (s === 'failed' || s === 'fail' || s === 'error') {
    return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
  }
  if (s === 'cancelled' || s === 'canceled' || s === 'deleted') {
    return <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
  }
  return <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />
}

export const DownloadHistoryPanel = ({
  items = [],
  isLoading = false,
  className,
}: DownloadHistoryPanelProps) => {
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'cancelled'>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    let completed = 0
    let failed = 0
    let cancelled = 0
    for (const item of items) {
      const s = (item.status || '').toLowerCase()
      if (s === 'completed' || s === 'complete') completed++
      else if (s === 'failed' || s === 'fail' || s === 'error') failed++
      else if (s === 'cancelled' || s === 'canceled' || s === 'deleted') cancelled++
    }
    return { all: items.length, completed, failed, cancelled }
  }, [items])

  const filteredItems = useMemo(
    () => filterHistoryItems(items, filter, search),
    [items, filter, search],
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* Controls toolbar: filter pills & search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'completed', 'failed', 'cancelled'] as const).map((tab) => {
            const count = counts[tab]
            const active = filter === tab
            const label =
              tab === 'all'
                ? 'All'
                : tab === 'completed'
                  ? 'Completed'
                  : tab === 'failed'
                    ? 'Failed'
                    : 'Cancelled'

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-overlay)]',
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                    active
                      ? 'bg-black/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <DkInput
            id="download-history-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search downloads..."
            className="pl-8 text-xs h-9 bg-[var(--dk-surface-field)] border-white/[0.04]"
          />
        </div>
      </div>

      {/* History Items List */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Loading download history...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl border border-white/[0.04] text-center space-y-2">
          <FileCheck2 className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-semibold text-foreground">
            {search.trim() || filter !== 'all'
              ? 'No matching history found'
              : 'No download history yet'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {search.trim() || filter !== 'all'
              ? 'Try adjusting your status filter or search keyword.'
              : 'Completed and processed Usenet downloads will appear here with full metadata and logs.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const badge = statusBadgeConfig(item.status)
            const title = resolveDownloadDisplayTitle(item)
            const timeAgo = formatRelativeTime(item.completed_at || item.created_at)

            return (
              <div
                key={item.nzo_id || item.id}
                className="p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] border border-white/[0.04] space-y-2 transition-all hover:bg-[var(--dk-surface-raised)]/60"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="mt-0.5 sm:mt-0 p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                      <HistoryStatusIcon status={item.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4
                          className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-xl"
                          title={title}
                        >
                          {title}
                        </h4>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-semibold border border-white/[0.04]',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                        <span className="font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {item.protocol || 'Usenet'}
                        </span>
                        {item.size_bytes > 0 && (
                          <span>{formatBytes(item.size_bytes)}</span>
                        )}
                        {timeAgo && (
                          <>
                            <span>&bull;</span>
                            <span>{timeAgo}</span>
                          </>
                        )}
                        {item.nzo_id && (
                          <>
                            <span>&bull;</span>
                            <span
                              className="font-mono text-[10px] text-muted-foreground/70"
                              title={`NZO ID: ${item.nzo_id}`}
                            >
                              ID: {item.nzo_id.length > 20 ? `${item.nzo_id.slice(0, 18)}...` : item.nzo_id}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {item.status === 'failed' && item.error_message ? (
                  <div className="p-2.5 rounded-xl bg-destructive/10 border border-white/[0.04] text-xs text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed break-words">{item.error_message}</p>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
