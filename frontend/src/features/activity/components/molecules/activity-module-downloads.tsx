import { useState } from 'react'
import { Clock, Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { useAuth } from '@/lib/providers/auth'
import { ActivityModuleSection } from './activity-module-section'
import { formatBytes } from '@/lib/utils'

const FIFTEEN_MIN = 15 * 60 * 1000

/** Molecule showing active and recent downloads with progress bars. */
export function ActivityModuleDownloads() {
  const { user: currentUser } = useAuth()
  const { downloads, cancelDownload } = useDownloads(currentUser?.id)
  const [cutoff] = useState(() => Date.now() - FIFTEEN_MIN)

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

  const hasDownloads = activeAndRecentDownloads.length > 0
  if (!hasDownloads) return null

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Download className="h-4 w-4 text-blue-400" />
            {activeAndRecentDownloads.some(d => d.status === 'downloading') && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-blue-400 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Downloads</span>
        </div>
        <div className="space-y-4">
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
              <div key={d.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {statusIcon}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-white/90" title={d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}>
                      {d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}
                    </p>
                    {d.nzbSize ? (
                      <p className="text-[10px] mt-0.5 font-medium text-white/35">{formatBytes(d.nzbSize)}</p>
                    ) : null}
                  </div>

                  {isActive && (
                    <div className="shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => cancelDownload(d.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-full transition-all cursor-pointer text-white/30 hover:text-red-400 hover:bg-red-400/10"
                        title="Cancel Download"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {d.status === 'failed' && d.errorMessage && (
                  <p className="text-[11px] rounded-xl px-3 py-2 leading-relaxed break-words font-medium text-rose-400/80 bg-rose-400/5">
                    {d.errorMessage}
                  </p>
                )}

                {isActive && (
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 rounded-full overflow-hidden flex-1 bg-white/[0.06]">
                      <div
                        className={"h-full rounded-full transition-all duration-700 " + progressBgClass}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums font-medium text-white/40">{pct}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
    </ActivityModuleSection>
  )
}
