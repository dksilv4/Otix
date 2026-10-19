import React, { useEffect, useMemo, useState } from 'react'
import {
  Search,
  DownloadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ArrowUpCircle,
  Pause,
  X,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { cn, formatBytes } from '@/lib/utils'
import { useToast } from '@ui/molecules/toast'
import {
  useNodeUsenetConfig,
  useNodeUsenetSearch,
  useStartNodeDownload,
  useNodeUsenetQueue,
  useNodeUsenetHistory,
  useCancelNodeQueueDownload,
} from '../use-node-usenet'
import { useNodeProviders } from '../use-node-providers'
import {
  cleanReleaseTitle,
  extractReleaseBadges,
  formatAgeDays,
  releaseDownloadUrl,
  isSabnzbdConfigured,
} from '../usenet-utils'
import {
  collectEditionPackVersions,
  filterEditionGroups,
  groupResultsByEditionAndPack,
  type EditionResultGroup,
  type GamePack,
} from '../release-parse'
import {
  getProtocolBadgeInfo,
  hasConfiguredDownloader,
  inferReleaseProtocol,
  releaseQueueBlockReason,
} from '../provider-utils'
import type {
  ServerProwlarrRelease,
  ServerSabnzbdQueueItem,
  ServerDownloadHistoryItem,
} from '../usenet-types'

type ProtocolFilter = 'all' | 'usenet' | 'torrent'

export interface NodeGameSearchModalProps {
  nodeId?: number
  nodeName?: string
  serverId?: number
  serverName?: string
  initialQuery?: string
  mediaItemId?: string
  onClose: () => void
  onDownloadStarted?: () => void
  isExiting?: boolean
}

export type ServerGameSearchModalProps = NodeGameSearchModalProps

export const NodeGameSearchModal = ({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  initialQuery = '',
  mediaItemId,
  onClose,
  onDownloadStarted,
  isExiting,
}: NodeGameSearchModalProps) => {
  const effectiveId = nodeId ?? serverId
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node')
  const { toast } = useToast()
  const [searchInput, setSearchInput] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [versionFilter, setVersionFilter] = useState('all')
  const [pendingGuid, setPendingGuid] = useState<string | null>(null)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(() => new Set())
  const [trackedNzoMap, setTrackedNzoMap] = useState<Map<string, string>>(() => new Map())

  const {
    data: releases = [],
    isLoading,
    isRefetching,
    error,
  } = useNodeUsenetSearch(effectiveId, activeQuery)

  const startDownloadMutation = useStartNodeDownload(effectiveId)
  const cancelQueueMutation = useCancelNodeQueueDownload(effectiveId)
  const { data: queueData, refetch: refetchQueue } = useNodeUsenetQueue(
    effectiveId,
    queuedGuids.size > 0 ? 1500 : 3000,
  )
  const { data: historyItems = [], refetch: refetchHistory } = useNodeUsenetHistory(effectiveId)
  const { data: providers } = useNodeProviders(effectiveId)
  const { data: usenetConfig } = useNodeUsenetConfig(effectiveId)
  const torrentConfigured = hasConfiguredDownloader(providers?.downloaders, 'torrent')
  const usenetConfigured =
    hasConfiguredDownloader(providers?.downloaders, 'usenet') ||
    isSabnzbdConfigured(usenetConfig?.sabnzbd)
  const searching = isLoading || isRefetching

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchInput.trim()) return
    setProtocolFilter('all')
    setVersionFilter('all')
    setActiveQuery(searchInput.trim())
  }

  const [updatePrompt, setUpdatePrompt] = useState<{
    release: ServerProwlarrRelease
    updates: ServerProwlarrRelease[]
  } | null>(null)

  const queueableCompanions = (updates: ServerProwlarrRelease[]) =>
    updates.filter((update) => {
      if (queuedGuids.has(update.guid)) return false
      const qItem = findReleaseQueueItem(update, queueData?.items ?? [], trackedNzoMap.get(update.guid))
      if (qItem) return false
      const downloadUrl = releaseDownloadUrl(update)
      return !releaseQueueBlockReason(
        { protocol: inferReleaseProtocol(update), download_url: downloadUrl },
        { torrentConfigured, usenetConfigured },
      )
    })

  const queueReleaseOnNode = async (release: ServerProwlarrRelease) => {
    const downloadUrl = releaseDownloadUrl(release)
    const blocked = releaseQueueBlockReason(
      { protocol: inferReleaseProtocol(release), download_url: downloadUrl },
      { torrentConfigured, usenetConfigured },
    )
    if (blocked) throw new Error(blocked)
    setPendingGuid(release.guid)
    try {
      const res = await startDownloadMutation.mutateAsync({
        title: release.title,
        download_url: downloadUrl,
        category: 'games',
        protocol: inferReleaseProtocol(release),
        media_item_id: mediaItemId || null,
        size: release.size || null,
      })
      const nzoId = (res as { nzo_id?: string } | undefined)?.nzo_id
      if (nzoId) {
        setTrackedNzoMap((prev) => new Map(prev).set(release.guid, nzoId))
      }
      setQueuedGuids((prev) => new Set(prev).add(release.guid))
      void refetchQueue()
      void refetchHistory()
    } finally {
      setPendingGuid(null)
    }
  }

  const handleCancelQueue = async (nzoId: string, guid: string) => {
    try {
      await cancelQueueMutation.mutateAsync(nzoId)
      setQueuedGuids((prev) => {
        const next = new Set(prev)
        next.delete(guid)
        return next
      })
      setTrackedNzoMap((prev) => {
        const next = new Map(prev)
        next.delete(guid)
        return next
      })
      void refetchQueue()
      toast({
        title: 'Download cancelled',
        description: 'Download removed from downloader queue.',
        variant: 'neutral',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel download'
      toast({
        title: 'Cancel failed',
        description: message,
        variant: 'error',
      })
    }
  }

  const handleQueueRelease = async (
    release: ServerProwlarrRelease,
    companionUpdates: ServerProwlarrRelease[] = [],
  ) => {
    const extras = queueableCompanions(companionUpdates)
    if (extras.length > 0) {
      setUpdatePrompt({ release, updates: extras })
      return
    }
    try {
      await queueReleaseOnNode(release)
      toast({
        title: 'Download queued on node',
        description: `Sent “${cleanReleaseTitle(release.title) || release.title}” to ${effectiveName}.`,
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

  const handleConfirmQueue = async (includeUpdates: boolean) => {
    if (!updatePrompt) return
    const { release, updates } = updatePrompt
    const batch = includeUpdates ? [release, ...updates] : [release]
    setUpdatePrompt(null)
    let queuedCount = 0
    let failed: string | null = null
    try {
      for (const item of batch) {
        try {
          await queueReleaseOnNode(item)
          queuedCount += 1
        } catch (err: unknown) {
          failed = err instanceof Error ? err.message : 'Check SABnzbd connection and API key.'
          break
        }
      }
      if (queuedCount > 0) {
        const extraCount = Math.max(0, queuedCount - 1)
        toast({
          title: extraCount > 0 ? 'Game and updates queued' : 'Download queued on node',
          description:
            extraCount > 0
              ? `Sent the release and ${extraCount} update${extraCount === 1 ? '' : 's'} to ${effectiveName}.`
              : `Sent “${cleanReleaseTitle(release.title) || release.title}” to ${effectiveName}.`,
          variant: 'success',
        })
        onDownloadStarted?.()
      }
      if (failed) {
        toast({
          title: queuedCount > 0 ? 'Some downloads failed to queue' : 'Failed to queue download',
          description: failed,
          variant: 'error',
        })
      }
    } finally {
      setPendingGuid(null)
    }
  }

  useEffect(() => {
    if (!updatePrompt) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setUpdatePrompt(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [updatePrompt])

  const groups = useMemo(
    () => groupResultsByEditionAndPack(releases, activeQuery),
    [releases, activeQuery],
  )
  const versionOptions = useMemo(() => collectEditionPackVersions(groups), [groups])
  const usenetCount = releases.filter((r) => r.protocol?.toLowerCase() === 'usenet').length
  const torrentCount = releases.filter((r) => r.protocol?.toLowerCase() === 'torrent').length
  const visibleGroups = useMemo(
    () => filterEditionGroups(groups, protocolFilter, versionFilter),
    [groups, protocolFilter, versionFilter],
  )

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Indexer results"
      description={`Search Prowlarr indexers on ${effectiveName} and queue a release to the node.`}
      className="flex max-h-[min(88vh,860px)] min-h-0 w-full max-w-3xl flex-col overflow-hidden"
    >
      <form onSubmit={handleSearch} className="flex shrink-0 gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            required
            autoFocus
            placeholder="Search a game title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] py-2.5 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 transition-colors focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchInput.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </button>
      </form>

      {queueData && queueData.items && queueData.items.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-blue-500/25 bg-blue-500/10 px-3.5 py-2 text-xs text-blue-700 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400 shrink-0" />
            <span>
              Downloader: <strong>{queueData.items.length}</strong> {queueData.items.length === 1 ? 'item' : 'items'} in queue
            </span>
            {queueData.speed && queueData.speed !== '0 B/s' && (
              <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                {queueData.speed}
              </span>
            )}
            {queueData.time_left && (
              <span className="text-muted-foreground tabular-nums">
                ETA: {queueData.time_left}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground capitalize font-medium">
            {queueData.status || 'Downloading'}
          </span>
        </div>
      )}

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        {!activeQuery ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-primary/50" />}
            title="Search your indexers"
            body="Type a game name to search Prowlarr across your configured Usenet and torrent indexers."
          />
        ) : searching ? (
          <EmptyState
            icon={<Loader2 className="h-7 w-7 animate-spin text-primary" />}
            title={`Searching for “${activeQuery}”`}
            body="Querying Prowlarr and waiting on your indexers."
          />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle className="h-7 w-7 text-rose-500" />}
            title="Search failed"
            body={
              (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
              error.message ||
              'Make sure Prowlarr is running and configured with an API key.'
            }
            tone="error"
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8 text-muted-foreground/30" />}
            title={`No releases for “${activeQuery}”`}
            body="Try a different spelling, or check that the right indexers are enabled in Prowlarr."
          />
        ) : (
          <>
            <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 bg-[var(--dk-surface-base)] pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'usenet', 'torrent'] as const).map((filter) => {
                  const count =
                    filter === 'all' ? releases.length : filter === 'usenet' ? usenetCount : torrentCount
                  if (filter !== 'all' && count === 0) return null
                  const active = protocolFilter === filter
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setProtocolFilter(filter)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                        active && filter === 'usenet' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                        active && filter === 'torrent' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                        active && filter === 'all' && 'bg-primary text-primary-foreground',
                        !active && 'text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
                      )}
                    >
                      {filter === 'all' ? 'All' : filter}
                      <span className="ml-1 tabular-nums opacity-70">{count}</span>
                    </button>
                  )
                })}
                {versionOptions.length > 0 && (
                  <select
                    value={versionFilter}
                    onChange={(e) => setVersionFilter(e.target.value)}
                    className="rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2 py-1 text-[11px] font-semibold text-foreground outline-none"
                  >
                    <option value="all">All versions</option>
                    {versionOptions.map((version) => (
                      <option key={version} value={version}>
                        v{version}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {releases.length} result{releases.length === 1 ? '' : 's'}
              </span>
            </div>

            {visibleGroups.length === 0 ? (
              <EmptyState
                icon={<Search className="h-7 w-7 text-muted-foreground/30" />}
                title={versionFilter !== 'all' ? `No v${versionFilter} releases` : `No ${protocolFilter} releases`}
                body="Switch back to All to see every indexer hit for this search."
              />
            ) : (
              <div className="-mx-6 -mb-6 min-h-0 flex-1 overflow-y-auto pb-6 sm:-mx-7 sm:-mb-7 sm:pb-7">
                {visibleGroups.map((group) => (
                  <EditionBlock
                    key={group.key}
                    group={group}
                    queuedGuids={queuedGuids}
                    pendingGuid={pendingGuid}
                    queueDisabled={startDownloadMutation.isPending}
                    torrentConfigured={torrentConfigured}
                    usenetConfigured={usenetConfigured}
                    queueItems={queueData?.items ?? []}
                    historyItems={historyItems}
                    trackedNzoMap={trackedNzoMap}
                    onQueue={handleQueueRelease}
                    onCancelQueue={handleCancelQueue}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {updatePrompt && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-overlay)] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Queue updates too?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {updatePrompt.updates.length === 1
                ? 'This version has 1 update. Queue it with this download?'
                : `This version has ${updatePrompt.updates.length} updates. Queue them with this download?`}
            </p>
            <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-[12px] text-muted-foreground">
              {updatePrompt.updates.map((update) => (
                <li key={update.guid} className="truncate">
                  {cleanReleaseTitle(update.title) || update.title}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmQueue(true)}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Queue game + updates
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmQueue(false)}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
              >
                Just this release
              </button>
            </div>
          </div>
        </div>
      )}
    </DkDialog>
  )
};

export const ServerGameSearchModal = NodeGameSearchModal

import {
  findReleaseQueueItem,
  findReleaseHistoryItem,
  kindLabel,
  seederClass,
} from '../utils'

export { findReleaseQueueItem, findReleaseHistoryItem }

const EditionBlock = ({
  group,
  queuedGuids,
  pendingGuid,
  queueDisabled,
  torrentConfigured,
  usenetConfigured,
  queueItems,
  historyItems,
  trackedNzoMap,
  onQueue,
  onCancelQueue,
}: {
  group: EditionResultGroup
  queuedGuids: Set<string>
  pendingGuid: string | null
  queueDisabled: boolean
  torrentConfigured: boolean
  usenetConfigured: boolean
  queueItems: ServerSabnzbdQueueItem[]
  historyItems: ServerDownloadHistoryItem[]
  trackedNzoMap: Map<string, string>
  onQueue: (release: ServerProwlarrRelease, companionUpdates?: ServerProwlarrRelease[]) => void
  onCancelQueue: (nzoId: string, guid: string) => void
}) => {
  return (
    <section>
      {group.title ? (
        <h3 className="sticky top-0 z-[1] bg-[var(--dk-surface-base)] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:px-7">
          {group.title}
        </h3>
      ) : null}
      {group.packs.map((pack) => (
        <PackBlock
          key={pack.key}
          pack={pack}
          queuedGuids={queuedGuids}
          pendingGuid={pendingGuid}
          queueDisabled={queueDisabled}
          torrentConfigured={torrentConfigured}
          usenetConfigured={usenetConfigured}
          queueItems={queueItems}
          historyItems={historyItems}
          trackedNzoMap={trackedNzoMap}
          onQueue={onQueue}
          onCancelQueue={onCancelQueue}
        />
      ))}
    </section>
  )
};

const PackBlock = ({
  pack,
  queuedGuids,
  pendingGuid,
  queueDisabled,
  torrentConfigured,
  usenetConfigured,
  queueItems,
  historyItems,
  trackedNzoMap,
  onQueue,
  onCancelQueue,
}: {
  pack: GamePack
  queuedGuids: Set<string>
  pendingGuid: string | null
  queueDisabled: boolean
  torrentConfigured: boolean
  usenetConfigured: boolean
  queueItems: ServerSabnzbdQueueItem[]
  historyItems: ServerDownloadHistoryItem[]
  trackedNzoMap: Map<string, string>
  onQueue: (release: ServerProwlarrRelease, companionUpdates?: ServerProwlarrRelease[]) => void
  onCancelQueue: (nzoId: string, guid: string) => void
}) => {
  const [updatesOpen, setUpdatesOpen] = useState(pack.updates.length > 0)
  const releaseCount = pack.releases.length
  const updateCount = pack.updates.length

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-6 pb-1 pt-3 sm:px-7">
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">{pack.title}</h4>
        <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {releaseCount} release{releaseCount === 1 ? '' : 's'}
          {updateCount > 0 ? ` · ${updateCount} update${updateCount === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      {pack.releases.map((item) => {
        const trackedNzo = trackedNzoMap.get(item.release.guid)
        const qItem = findReleaseQueueItem(item.release, queueItems, trackedNzo)
        const hItem = findReleaseHistoryItem(item.release, historyItems, trackedNzo)
        const isHistoryCompleted = hItem?.status === 'completed'
        return (
          <ReleaseRow
            key={item.release.guid}
            release={item.release}
            version={item.parsed.version}
            isQueued={queuedGuids.has(item.release.guid)}
            isPending={pendingGuid === item.release.guid}
            disabled={queueDisabled}
            torrentConfigured={torrentConfigured}
            usenetConfigured={usenetConfigured}
            queueItem={qItem}
            isHistoryCompleted={isHistoryCompleted}
            onQueue={() => onQueue(item.release, pack.updates.map((update) => update.release))}
            onCancelQueue={qItem ? () => onCancelQueue(qItem.nzo_id, item.release.guid) : undefined}
          />
        )
      })}
      {pack.updates.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setUpdatesOpen((open) => !open)}
            className="flex w-full items-center gap-2 px-6 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground sm:px-7"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            <span>Updates</span>
            <span className="tabular-nums text-muted-foreground/60">{pack.updates.length}</span>
            <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', updatesOpen && 'rotate-180')} />
          </button>
          {updatesOpen &&
            pack.updates.map((item) => {
              const trackedNzo = trackedNzoMap.get(item.release.guid)
              const qItem = findReleaseQueueItem(item.release, queueItems, trackedNzo)
              const hItem = findReleaseHistoryItem(item.release, historyItems, trackedNzo)
              const isHistoryCompleted = hItem?.status === 'completed'
              return (
                <ReleaseRow
                  key={item.release.guid}
                  release={item.release}
                  kind="update"
                  version={item.parsed.version}
                  indented
                  isQueued={queuedGuids.has(item.release.guid)}
                  isPending={pendingGuid === item.release.guid}
                  disabled={queueDisabled}
                  torrentConfigured={torrentConfigured}
                  usenetConfigured={usenetConfigured}
                  queueItem={qItem}
                  isHistoryCompleted={isHistoryCompleted}
                  onQueue={() => onQueue(item.release)}
                  onCancelQueue={qItem ? () => onCancelQueue(qItem.nzo_id, item.release.guid) : undefined}
                />
              )
            })}
        </div>
      )}
    </div>
  )
};

const EmptyState = ({
  icon,
  title,
  body,
  tone = 'default',
}: {
  icon: React.ReactNode
  title: string
  body: string
  tone?: 'default' | 'error'
}) => {
  return (
    <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 px-2 py-14 text-center">
      {icon}
      <p className={cn('text-sm font-semibold', tone === 'error' ? 'text-rose-500' : 'text-foreground')}>
        {title}
      </p>
      <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
};

const ReleaseRow = ({
  release,
  kind,
  version,
  indented,
  isQueued,
  isPending,
  disabled,
  torrentConfigured,
  usenetConfigured,
  queueItem,
  isHistoryCompleted,
  onQueue,
  onCancelQueue,
}: {
  release: ServerProwlarrRelease
  kind?: 'game' | 'update' | 'dlc' | 'other'
  version?: string | null
  indented?: boolean
  isQueued: boolean
  isPending: boolean
  disabled: boolean
  torrentConfigured: boolean
  usenetConfigured: boolean
  queueItem?: ServerSabnzbdQueueItem | null
  isHistoryCompleted?: boolean
  onQueue: () => void
  onCancelQueue?: () => void
}) => {
  const badges = extractReleaseBadges(release.title)
  const protocolBadge = getProtocolBadgeInfo(release.protocol)
  const cleaned = cleanReleaseTitle(release.title)
  const downloadUrl = releaseDownloadUrl(release)
  const blockReason = releaseQueueBlockReason(
    { protocol: inferReleaseProtocol({ ...release, download_url: downloadUrl }), download_url: downloadUrl },
    { torrentConfigured, usenetConfigured },
  )
  const canQueue = !blockReason
  const protocol = (release.protocol || '').toLowerCase()
  const kindBadge = kindLabel(kind, version)

  const pct = Math.min(100, Math.max(0, queueItem?.percentage ?? 0))
  const queueStatus = (queueItem?.status || 'Downloading').toLowerCase()
  const isPaused = queueStatus.includes('pause')
  const isExtracting =
    queueStatus.includes('unpack') ||
    queueStatus.includes('extract') ||
    queueStatus.includes('verif')

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 border-b border-[var(--dk-separator)] py-3 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] sm:flex-row sm:items-center',
        indented ? 'pl-10 pr-6 sm:pl-12 sm:pr-7' : 'px-6 sm:px-7',
        protocol === 'usenet' && 'border-l-2 border-l-blue-400',
        protocol === 'torrent' && 'border-l-2 border-l-red-400',
        protocol !== 'usenet' && protocol !== 'torrent' && 'border-l-2 border-l-transparent',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {cleaned || release.title}
          </span>
          {kindBadge && (
            <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border', kindBadge.className)}>
              {kindBadge.label}
            </span>
          )}
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
          <p className="truncate font-mono text-[11px] text-muted-foreground/60">{release.title}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground/80">{formatBytes(release.size)}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="rounded bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {release.indexer}
          </span>
          {release.protocol === 'torrent' && release.seeders != null && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className={cn('tabular-nums', seederClass(release.seeders))}>
                {release.seeders} seeders
              </span>
            </>
          )}
          {release.age_days != null && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatAgeDays(release.age_days)}
              </span>
            </>
          )}
          {release.info_url && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <a
                href={release.info_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Info
              </a>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 self-end sm:self-center">
        {queueItem ? (
          <div className="flex items-center gap-2">
            <div
              className="relative inline-flex min-w-[150px] max-w-[220px] items-center justify-between overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-200 shadow-sm"
              title={`${queueItem.status} — ${pct.toFixed(1)}%${queueItem.speed ? ` at ${queueItem.speed}` : ''}${queueItem.time_left ? ` (${queueItem.time_left} left)` : ''}`}
            >
              {/* Animated Progress Fill */}
              <span
                className={cn(
                  'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
                  isPaused ? 'bg-amber-500/35' : isExtracting ? 'bg-purple-500/35' : 'bg-blue-500/40',
                )}
                style={{ width: `${Math.max(4, pct)}%` }}
              />
              <span className="relative z-10 flex items-center gap-1.5">
                {isPaused ? (
                  <Pause className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 dark:text-blue-400 shrink-0" />
                )}
                <span className="tabular-nums font-mono font-semibold text-[11px]">
                  {pct.toFixed(0)}%
                </span>
                {queueItem.speed && queueItem.speed !== '0 B/s' && (
                  <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
                    {queueItem.speed}
                  </span>
                )}
              </span>
              {queueItem.time_left && (
                <span className="relative z-10 text-[10px] text-muted-foreground hidden md:inline ml-2 tabular-nums">
                  {queueItem.time_left}
                </span>
              )}
            </div>
            {onCancelQueue && (
              <button
                type="button"
                onClick={onCancelQueue}
                title="Cancel download in SABnzbd"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : isHistoryCompleted ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
          </span>
        ) : isQueued ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/15 px-3 py-1.5 text-xs font-bold text-blue-500 dark:text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 dark:text-blue-400" />
              Queued…
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onQueue}
            disabled={disabled || !canQueue}
            title={canQueue ? 'Queue this release on the node' : blockReason || 'Cannot queue this release'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors disabled:opacity-50',
              protocol === 'torrent' ? 'bg-red-500 hover:bg-red-400' : 'bg-primary hover:bg-primary/90',
            )}
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
};

