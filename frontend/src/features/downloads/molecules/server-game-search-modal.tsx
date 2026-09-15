import React, { useMemo, useState } from 'react'
import {
  Search,
  DownloadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { DkDialog } from '@/old-features/ui/molecules/dialog'
import { cn, formatBytes } from '@/lib/utils'
import { useToast } from '@/old-features/ui/molecules/toast'
import {
  useServerUsenetSearch,
  useStartServerDownload,
} from '../use-server-usenet'
import {
  cleanReleaseTitle,
  extractReleaseBadges,
  formatAgeDays,
  sortReleasesByQuality,
} from '../usenet-utils'
import { getProtocolBadgeInfo } from '../provider-utils'
import type { ServerProwlarrRelease } from '../usenet-types'

type ProtocolFilter = 'all' | 'usenet' | 'torrent'

interface ServerGameSearchModalProps {
  serverId?: number
  serverName?: string
  initialQuery?: string
  onClose: () => void
  onDownloadStarted?: () => void
  isExiting?: boolean
}

export function ServerGameSearchModal({
  serverId,
  serverName = 'Server',
  initialQuery = '',
  onClose,
  onDownloadStarted,
  isExiting,
}: ServerGameSearchModalProps) {
  const { toast } = useToast()
  const [searchInput, setSearchInput] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [pendingGuid, setPendingGuid] = useState<string | null>(null)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(() => new Set())

  const {
    data: releases = [],
    isLoading,
    isRefetching,
    error,
  } = useServerUsenetSearch(serverId, activeQuery)

  const startDownloadMutation = useStartServerDownload(serverId)
  const searching = isLoading || isRefetching

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchInput.trim()) return
    setProtocolFilter('all')
    setActiveQuery(searchInput.trim())
  }

  const handleQueueRelease = async (release: ServerProwlarrRelease) => {
    if (!release.download_url) return
    try {
      setPendingGuid(release.guid)
      await startDownloadMutation.mutateAsync({
        title: release.title,
        download_url: release.download_url,
        category: 'games',
      })
      setQueuedGuids((prev) => new Set(prev).add(release.guid))
      toast({
        title: 'Download queued on server',
        description: `Sent “${cleanReleaseTitle(release.title) || release.title}” to ${serverName}.`,
        variant: 'success',
      })
      onDownloadStarted?.()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Check SABnzbd connection and API key.'
      toast({
        title: 'Failed to queue download',
        description: message,
        variant: 'error',
      })
    } finally {
      setPendingGuid(null)
    }
  }

  const sortedReleases = useMemo(() => sortReleasesByQuality(releases), [releases])
  const usenetCount = sortedReleases.filter((r) => r.protocol?.toLowerCase() === 'usenet').length
  const torrentCount = sortedReleases.filter((r) => r.protocol?.toLowerCase() === 'torrent').length
  const visibleReleases =
    protocolFilter === 'all'
      ? sortedReleases
      : sortedReleases.filter((r) => r.protocol?.toLowerCase() === protocolFilter)

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Indexer results"
      description={`Search Prowlarr indexers on ${serverName} and queue a release to the server.`}
      className="w-full max-w-3xl"
      showAmbient={false}
    >
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            required
            autoFocus
            placeholder="Search a game title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-blue-500/40 focus:bg-white/[0.06]"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchInput.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-400 disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </button>
      </form>

      <div className="mt-4 max-h-[min(56vh,560px)] min-h-[240px] overflow-y-auto pr-1">
        {!activeQuery ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-blue-400/50" />}
            title="Search your indexers"
            body="Type a game name to search Prowlarr across your configured Usenet and torrent indexers."
          />
        ) : searching ? (
          <EmptyState
            icon={<Loader2 className="h-7 w-7 animate-spin text-blue-400" />}
            title={`Searching for “${activeQuery}”`}
            body="Querying Prowlarr and waiting on your indexers."
          />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle className="h-7 w-7 text-rose-400" />}
            title="Search failed"
            body={
              (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
              error.message ||
              'Make sure Prowlarr is running and configured with an API key.'
            }
            tone="error"
          />
        ) : sortedReleases.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8 text-white/20" />}
            title={`No releases for “${activeQuery}”`}
            body="Try a different spelling, or check that the right indexers are enabled in Prowlarr."
          />
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5">
                {(['all', 'usenet', 'torrent'] as const).map((filter) => {
                  const count =
                    filter === 'all' ? sortedReleases.length : filter === 'usenet' ? usenetCount : torrentCount
                  if (filter !== 'all' && count === 0) return null
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setProtocolFilter(filter)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                        protocolFilter === filter
                          ? 'bg-white/10 text-white'
                          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
                      )}
                    >
                      {filter === 'all' ? 'All' : filter}
                      <span className="ml-1 tabular-nums text-white/40">{count}</span>
                    </button>
                  )
                })}
              </div>
              <span className="text-[11px] text-white/35">Sorted by quality</span>
            </div>

            {visibleReleases.length === 0 ? (
              <EmptyState
                icon={<Search className="h-7 w-7 text-white/20" />}
                title={`No ${protocolFilter} releases`}
                body="Switch back to All to see every indexer hit for this search."
              />
            ) : (
              visibleReleases.map((release, index) => (
                <ReleaseRow
                  key={release.guid || `${release.title}-${release.indexer}-${index}`}
                  release={release}
                  isQueued={queuedGuids.has(release.guid)}
                  isPending={pendingGuid === release.guid}
                  disabled={startDownloadMutation.isPending}
                  onQueue={() => handleQueueRelease(release)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </DkDialog>
  )
}

function EmptyState({
  icon,
  title,
  body,
  tone = 'default',
}: {
  icon: React.ReactNode
  title: string
  body: string
  tone?: 'default' | 'error'
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon}
      <p className={cn('text-sm font-semibold', tone === 'error' ? 'text-rose-300' : 'text-white/80')}>
        {title}
      </p>
      <p className="max-w-sm text-[12px] leading-relaxed text-white/40">{body}</p>
    </div>
  )
}

function ReleaseRow({
  release,
  isQueued,
  isPending,
  disabled,
  onQueue,
}: {
  release: ServerProwlarrRelease
  isQueued: boolean
  isPending: boolean
  disabled: boolean
  onQueue: () => void
}) {
  const badges = extractReleaseBadges(release.title)
  const protocolBadge = getProtocolBadgeInfo(release.protocol)
  const cleaned = cleanReleaseTitle(release.title)
  const canQueue = Boolean(release.download_url)
  const protocol = (release.protocol || '').toLowerCase()

  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.045] sm:flex-row sm:items-center',
        protocol === 'usenet' && 'border-l-2 border-l-amber-400/70',
        protocol === 'torrent' && 'border-l-2 border-l-cyan-400/70',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-white/90 group-hover:text-white">
            {cleaned || release.title}
          </span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border',
              protocolBadge.bg,
              protocolBadge.text,
              protocolBadge.border,
            )}
          >
            {protocolBadge.label}
          </span>
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                badge.bg,
                badge.text,
              )}
            >
              {badge.label}
            </span>
          ))}
        </div>

        {cleaned && cleaned !== release.title && (
          <p className="truncate font-mono text-[11px] text-white/30">{release.title}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
          <span className="font-semibold tabular-nums text-white/75">{formatBytes(release.size)}</span>
          <span className="text-white/20">·</span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            {release.indexer}
          </span>
          {release.seeders != null && (
            <>
              <span className="text-white/20">·</span>
              <span className={cn('tabular-nums', seederClass(release.seeders))}>
                {release.seeders} seeders
              </span>
            </>
          )}
          {release.age_days != null && (
            <>
              <span className="text-white/20">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatAgeDays(release.age_days)}
              </span>
            </>
          )}
          {release.info_url && (
            <>
              <span className="text-white/20">·</span>
              <a
                href={release.info_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-white/45 hover:text-white/80"
              >
                <ExternalLink className="h-3 w-3" />
                Info
              </a>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 self-end sm:self-center">
        {isQueued ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Queued
          </span>
        ) : (
          <button
            type="button"
            onClick={onQueue}
            disabled={disabled || !canQueue}
            title={canQueue ? 'Queue this release on the server' : 'No download URL from this indexer'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-400 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DownloadCloud className="h-3.5 w-3.5" />
            )}
            {isPending ? 'Queuing…' : 'Download'}
          </button>
        )}
      </div>
    </div>
  )
}

function seederClass(seeders: number) {
  if (seeders >= 20) return 'text-emerald-400'
  if (seeders >= 5) return 'text-amber-400'
  return 'text-white/45'
}
