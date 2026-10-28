import { useMemo, useState } from 'react'
import { Clock, Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import {
  useServerUsenetHistory,
  useServerUsenetQueue,
  useCancelServerQueueDownload,
} from '@/features/downloads/use-server-usenet'
import { useAuth } from '@/lib/providers/auth'
import { ActivityModuleSection } from './activity-module-section'
import { formatBytes } from '@/lib/utils'
import { resolveDownloadDisplayTitle } from '@/features/downloads/utils'

import { historyMeta } from '../../utils/downloads'

const FIFTEEN_MIN = 15 * 60 * 1000
const HISTORY_LIMIT = 12

const HistoryStatusIcon = ({ status }: { status: string }) => {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
  if (status === 'failed') return <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
  if (status === 'processing') return <RefreshCw className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
  if (status === 'paused') return <Clock className="h-4 w-4 text-amber-400 shrink-0" />
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
};

/** Molecule showing active and recent downloads with progress bars. */
export const ActivityModuleDownloads = () => {
  const { user: currentUser } = useAuth()
  const { downloads, cancelDownload } = useDownloads(currentUser?.id)
  const { data: gameServers = [] } = useGameServers()
  const activeServer = useMemo(
    () =>
      gameServers.find((s) => typeof s.id === 'number' && s.id > 0 && s.isActive) ??
      gameServers.find((s) => typeof s.id === 'number' && s.id > 0),
    [gameServers],
  )
  const activeServerId = activeServer?.id
  const { data: serverQueue } = useServerUsenetQueue(activeServerId)
  const { data: serverHistory = [] } = useServerUsenetHistory(activeServerId)
  const cancelServerQueue = useCancelServerQueueDownload(activeServerId)
  const [cutoff] = useState(() => Date.now() - FIFTEEN_MIN)

  const serverItems = useMemo(() => serverQueue?.items ?? [], [serverQueue?.items])
  const activeNzoIds = useMemo(() => new Set(serverItems.map((item) => item.nzo_id)), [serverItems])
  const historyItems = useMemo(
    () =>
      serverHistory
        .filter((item) => !activeNzoIds.has(item.nzo_id) && item.status !== 'queued' && item.status !== 'downloading')
        .slice(0, HISTORY_LIMIT),
    [serverHistory, activeNzoIds],
  )

  const activeAndRecentDownloads = downloads
    .filter(d => {
      if (d.status === 'queued' || d.status === 'downloading' || d.status === 'processing') return true
      if (d.status === 'failed') return true
      if (d.status === 'completed' && d.completedAt) {
        return new Date(d.completedAt).getTime() > cutoff
      }
      return false
    })
    .sort((a, b) => {
      const getProgress = (item: typeof a) => {
        if (item.status === 'completed') return 100
        return item.percentage ?? 0
      }
      return getProgress(b) - getProgress(a)
    })

  const hasDownloads =
    activeAndRecentDownloads.length > 0 || serverItems.length > 0 || historyItems.length > 0
  if (!hasDownloads) return null

  const serverBusy = serverItems.some((item) => {
    const status = (item.status || '').toLowerCase()
    return status.includes('download') || status.includes('queued') || status.includes('grab')
  })

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Download className="h-4 w-4 text-blue-400" />
            {(activeAndRecentDownloads.some(d => d.status === 'downloading') || serverBusy) && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-blue-400 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Downloads</span>
        </div>
        <div className="space-y-4">
          {serverItems.map((item) => {
            const pct = Math.min(100, Math.max(0, item.percentage ?? 0))
            const status = (item.status || 'Downloading').toLowerCase()
            const isPaused = status.includes('pause')

            return (
              <div key={item.nzo_id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-[var(--dk-surface-overlay)]/60 border border-[var(--dk-separator)]">
                <div className="flex items-center gap-3">
                  {isPaused ? (
                    <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-spin shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-foreground" title={resolveDownloadDisplayTitle(item)}>
                      {resolveDownloadDisplayTitle(item)}
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] mt-0.5 font-medium text-muted-foreground">
                      <span className="uppercase tracking-wider text-[9px] font-bold text-blue-500 dark:text-blue-300/70">Usenet</span>
                      {item.size_mb ? formatBytes(item.size_mb * 1024 * 1024) : null}
                      {item.speed && item.speed !== '0 B/s' ? <span>· {item.speed}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => cancelServerQueue.mutate(item.nzo_id)}
                      className="h-7 w-7 flex items-center justify-center rounded-full transition-all cursor-pointer text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      title="Cancel Download"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 rounded-full overflow-hidden flex-1 bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-500 to-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums font-medium text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
              </div>
            )
          })}

          {historyItems.map((item) => (
            <div key={item.nzo_id || item.id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-[var(--dk-surface-overlay)]/60 border border-[var(--dk-separator)]">
              <div className="flex items-center gap-3">
                <HistoryStatusIcon status={item.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-foreground" title={resolveDownloadDisplayTitle(item)}>
                    {resolveDownloadDisplayTitle(item)}
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px] mt-0.5 font-medium text-muted-foreground">
                    {historyMeta(item)}
                  </p>
                </div>
              </div>
              {item.status === 'failed' && item.error_message ? (
                <p className="text-[11px] rounded-xl px-3 py-2 leading-relaxed break-words font-medium text-rose-500 dark:text-rose-400/80 bg-rose-500/10">
                  {item.error_message}
                </p>
              ) : null}
            </div>
          ))}

          {activeAndRecentDownloads.map(d => {
            const isActive = d.status === 'queued' || d.status === 'downloading' || d.status === 'processing'
            const pct = d.percentage ?? 0

            let statusIcon = <Clock className="h-4 w-4 text-amber-400 shrink-0" />
            let progressBgClass = "bg-amber-500"

            if (d.status === 'downloading') {
              statusIcon = <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
              progressBgClass = "bg-gradient-to-r from-blue-500 to-indigo-500"
            } else if (d.status === 'processing') {
              statusIcon = <RefreshCw className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
              progressBgClass = "bg-purple-500 animate-pulse"
            } else if (d.status === 'completed') {
              statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              progressBgClass = "bg-emerald-500"
            } else if (d.status === 'failed') {
              statusIcon = <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              progressBgClass = "bg-rose-500"
            }

            return (
              <div key={d.id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-[var(--dk-surface-overlay)]/60 border border-[var(--dk-separator)]">
                <div className="flex items-center gap-3">
                  {statusIcon}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-foreground" title={d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}>
                      {d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] mt-0.5 font-medium text-muted-foreground">
                      {d.source === 'radarr' && (
                        <span className="uppercase tracking-wider text-[9px] font-bold text-blue-500 dark:text-blue-300/70">Radarr</span>
                      )}
                      {d.nzbSize ? formatBytes(d.nzbSize) : null}
                    </p>
                  </div>

                  {isActive && d.source !== 'radarr' && (
                    <div className="shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => cancelDownload(d.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-full transition-all cursor-pointer text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                        title="Cancel Download"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {d.status === 'failed' && d.errorMessage && (
                  <p className="text-[11px] rounded-xl px-3 py-2 leading-relaxed break-words font-medium text-rose-500 dark:text-rose-400/80 bg-rose-500/10">
                    {d.errorMessage}
                  </p>
                )}

                {isActive && (
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 rounded-full overflow-hidden flex-1 bg-muted">
                      <div
                        className={"h-full rounded-full transition-all duration-700 " + progressBgClass}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums font-medium text-muted-foreground">{pct}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
    </ActivityModuleSection>
  )
};
