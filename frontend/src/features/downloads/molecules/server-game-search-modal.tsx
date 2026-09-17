import React, { useEffect, useMemo, useState } from 'react'
import { Search, DownloadCloud, Loader2, CheckCircle2, AlertCircle, Clock, Sparkles, ExternalLink, ChevronDown, ArrowUpCircle } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { cn, formatBytes } from '@/lib/utils'
import { useToast } from '@ui/molecules/toast'
import {
  useServerUsenetConfig,
  useServerUsenetSearch,
  useStartServerDownload,
} from '../use-server-usenet'
import { useServerProviders } from '../use-server-providers'
import {
  cleanReleaseTitle,
  extractReleaseBadges,
  formatAgeDays,
  releaseDownloadUrl,
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
import type { ServerProwlarrRelease } from '../usenet-types'

type ProtocolFilter = 'all' | 'usenet' | 'torrent'

interface ServerGameSearchModalProps {
  serverId?: number
  serverName?: string
  initialQuery?: string
  mediaItemId?: string
  onClose: () => void
  onDownloadStarted?: () => void
  isExiting?: boolean
}

export function ServerGameSearchModal({
  serverId,
  serverName = 'Server',
  initialQuery = '',
  mediaItemId,
  onClose,
  onDownloadStarted,
  isExiting,
}: ServerGameSearchModalProps) {
  const { toast } = useToast()
  const [searchInput, setSearchInput] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [versionFilter, setVersionFilter] = useState('all')
  const [pendingGuid, setPendingGuid] = useState<string | null>(null)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(() => new Set())

  const {
    data: releases = [],
    isLoading,
    isRefetching,
    error,
  } = useServerUsenetSearch(serverId, activeQuery)

  const startDownloadMutation = useStartServerDownload(serverId)
  const { data: providers } = useServerProviders(serverId)
  const { data: usenetConfig } = useServerUsenetConfig(serverId)
  const torrentConfigured = hasConfiguredDownloader(providers?.downloaders, 'torrent')
  const usenetConfigured =
    hasConfiguredDownloader(providers?.downloaders, 'usenet') ||
    Boolean(usenetConfig?.sabnzbd?.configured)
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
      const downloadUrl = releaseDownloadUrl(update)
      return !releaseQueueBlockReason(
        { protocol: inferReleaseProtocol(update), download_url: downloadUrl },
        { torrentConfigured, usenetConfigured },
      )
    })

  const queueReleaseOnServer = async (release: ServerProwlarrRelease) => {
    const downloadUrl = releaseDownloadUrl(release)
    const blocked = releaseQueueBlockReason(
      { protocol: inferReleaseProtocol(release), download_url: downloadUrl },
      { torrentConfigured, usenetConfigured },
    )
    if (blocked) throw new Error(blocked)
    setPendingGuid(release.guid)
    await startDownloadMutation.mutateAsync({
      title: release.title,
      download_url: downloadUrl,
      category: 'games',
      protocol: inferReleaseProtocol(release),
      media_item_id: mediaItemId || null,
      size: release.size || null,
    })
    setQueuedGuids((prev) => new Set(prev).add(release.guid))
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
      await queueReleaseOnServer(release)
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
          await queueReleaseOnServer(item)
          queuedCount += 1
        } catch (err: unknown) {
          failed = err instanceof Error ? err.message : 'Check SABnzbd connection and API key.'
          break
        }
      }
      if (queuedCount > 0) {
        const extraCount = Math.max(0, queuedCount - 1)
        toast({
          title: extraCount > 0 ? 'Game and updates queued' : 'Download queued on server',
          description:
            extraCount > 0
              ? `Sent the release and ${extraCount} update${extraCount === 1 ? '' : 's'} to ${serverName}.`
              : `Sent “${cleanReleaseTitle(release.title) || release.title}” to ${serverName}.`,
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
      description={`Search Prowlarr indexers on ${serverName} and queue a release to the server.`}
      className="flex max-h-[min(88vh,860px)] min-h-0 w-full max-w-3xl flex-col overflow-hidden"
      showAmbient={false}
    >
      <form onSubmit={handleSearch} className="flex shrink-0 gap-2">
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

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
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
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8 text-white/20" />}
            title={`No releases for “${activeQuery}”`}
            body="Try a different spelling, or check that the right indexers are enabled in Prowlarr."
          />
        ) : (
          <>
            <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 bg-[oklch(from_var(--dk-surface-base)_l_c_h_/_0.92)] pb-3">
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
                        active && filter === 'usenet' && 'bg-blue-500/15 text-blue-400',
                        active && filter === 'torrent' && 'bg-red-500/15 text-red-400',
                        active && filter === 'all' && 'bg-white/10 text-white',
                        !active && 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
                      )}
                    >
                      {filter === 'all' ? 'All' : filter}
                      <span className="ml-1 tabular-nums text-white/40">{count}</span>
                    </button>
                  )
                })}
                {versionOptions.length > 0 && (
                  <select
                    value={versionFilter}
                    onChange={(e) => setVersionFilter(e.target.value)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white outline-none"
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
              <span className="text-[11px] text-white/35">
                {releases.length} result{releases.length === 1 ? '' : 's'}
              </span>
            </div>

            {visibleGroups.length === 0 ? (
              <EmptyState
                icon={<Search className="h-7 w-7 text-white/20" />}
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
                    onQueue={handleQueueRelease}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {updatePrompt && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[oklch(from_var(--dk-surface-base)_l_c_h_/_0.95)] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Queue updates too?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">
              {updatePrompt.updates.length === 1
                ? 'This version has 1 update. Queue it with this download?'
                : `This version has ${updatePrompt.updates.length} updates. Queue them with this download?`}
            </p>
            <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-[12px] text-white/45">
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
                className="inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-400"
              >
                Queue game + updates
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmQueue(false)}
                className="inline-flex items-center justify-center rounded-xl bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.12]"
              >
                Just this release
              </button>
            </div>
          </div>
        </div>
      )}
    </DkDialog>
  )
}

function EditionBlock({
  group,
  queuedGuids,
  pendingGuid,
  queueDisabled,
  torrentConfigured,
  usenetConfigured,
  onQueue,
}: {
  group: EditionResultGroup
  queuedGuids: Set<string>
  pendingGuid: string | null
  queueDisabled: boolean
  torrentConfigured: boolean
  usenetConfigured: boolean
  onQueue: (release: ServerProwlarrRelease, companionUpdates?: ServerProwlarrRelease[]) => void
}) {
  return (
    <section>
      {group.title ? (
        <h3 className="sticky top-0 z-[1] bg-[oklch(from_var(--dk-surface-base)_l_c_h)] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 sm:px-7">
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
          onQueue={onQueue}
        />
      ))}
    </section>
  )
}

function PackBlock({
  pack,
  queuedGuids,
  pendingGuid,
  queueDisabled,
  torrentConfigured,
  usenetConfigured,
  onQueue,
}: {
  pack: GamePack
  queuedGuids: Set<string>
  pendingGuid: string | null
  queueDisabled: boolean
  torrentConfigured: boolean
  usenetConfigured: boolean
  onQueue: (release: ServerProwlarrRelease, companionUpdates?: ServerProwlarrRelease[]) => void
}) {
  const [updatesOpen, setUpdatesOpen] = useState(pack.updates.length > 0)
  const releaseCount = pack.releases.length
  const updateCount = pack.updates.length

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-6 pb-1 pt-3 sm:px-7">
        <h4 className="min-w-0 truncate text-sm font-semibold text-white">{pack.title}</h4>
        <p className="shrink-0 text-[11px] tabular-nums text-white/35">
          {releaseCount} release{releaseCount === 1 ? '' : 's'}
          {updateCount > 0 ? ` · ${updateCount} update${updateCount === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      {pack.releases.map((item) => (
        <ReleaseRow
          key={item.release.guid}
          release={item.release}
          version={item.parsed.version}
          isQueued={queuedGuids.has(item.release.guid)}
          isPending={pendingGuid === item.release.guid}
          disabled={queueDisabled}
          torrentConfigured={torrentConfigured}
          usenetConfigured={usenetConfigured}
          onQueue={() => onQueue(item.release, pack.updates.map((update) => update.release))}
        />
      ))}
      {pack.updates.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setUpdatesOpen((open) => !open)}
            className="flex w-full items-center gap-2 px-6 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45 hover:text-white/70 sm:px-7"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            <span>Updates</span>
            <span className="tabular-nums text-white/30">{pack.updates.length}</span>
            <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', updatesOpen && 'rotate-180')} />
          </button>
          {updatesOpen &&
            pack.updates.map((item) => (
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
                onQueue={() => onQueue(item.release)}
              />
            ))}
        </div>
      )}
    </div>
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
    <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 px-2 py-14 text-center">
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
  kind,
  version,
  indented,
  isQueued,
  isPending,
  disabled,
  torrentConfigured,
  usenetConfigured,
  onQueue,
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
  onQueue: () => void
}) {
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

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 border-b border-white/[0.05] py-3 transition-colors hover:bg-white/[0.035] sm:flex-row sm:items-center',
        indented ? 'pl-10 pr-6 sm:pl-12 sm:pr-7' : 'px-6 sm:px-7',
        protocol === 'usenet' && 'border-l-2 border-l-blue-400',
        protocol === 'torrent' && 'border-l-2 border-l-red-400',
        protocol !== 'usenet' && protocol !== 'torrent' && 'border-l-2 border-l-transparent',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-white/90 group-hover:text-white">
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
            title={canQueue ? 'Queue this release on the server' : blockReason || 'Cannot queue this release'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors disabled:opacity-50',
              protocol === 'torrent' ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-500 hover:bg-blue-400',
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
}

function kindLabel(kind?: 'game' | 'update' | 'dlc' | 'other', version?: string | null) {
  if (kind === 'update') {
    return {
      label: version ? `Update ${version}` : 'Update',
      className: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    }
  }
  if (kind === 'dlc') {
    return {
      label: 'DLC',
      className: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
    }
  }
  if (kind === 'game') {
    return {
      label: version ? `Game v${version}` : 'Game',
      className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    }
  }
  return null
}

function seederClass(seeders: number) {
  if (seeders >= 20) return 'text-emerald-400'
  if (seeders >= 5) return 'text-amber-400'
  return 'text-white/45'
}
