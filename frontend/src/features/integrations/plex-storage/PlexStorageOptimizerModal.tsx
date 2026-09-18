import { useState, useMemo } from 'react'
import {
  HardDrive,
  RefreshCw,
  Film,
  Tv,
  Layers,
  Zap,
  Clock,
  Check,
  Copy,
  Download,
  AlertCircle,
  FolderOpen,
  Sparkles,
  Search,
  ChevronDown,
} from 'lucide-react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { formatBytes } from '@/lib/utils'
import {
  usePlexStorageServers,
  usePlexStorageSummary,
  usePlexStorageRecommendations,
  useRefreshPlexStorage,
} from './use-plex-storage'
import type { PlexStorageRecommendationItem, PlexStorageSummary } from './types'

export interface PlexStorageOptimizerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialServerId?: number | null
}

type SavingsCategory = 'duplicates' | 'transcode' | 'unwatched' | 'watched_shows' | 'largest_files'

interface TabDef {
  id: SavingsCategory
  label: string
  icon: typeof Layers
  badgeColor: string
  description: string
}

const TABS: TabDef[] = [
  {
    id: 'duplicates',
    label: 'Duplicates & Multi-Versions',
    icon: Layers,
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    description: 'Items with multiple files or qualities. Remove redundant copies to immediately free up space.',
  },
  {
    id: 'transcode',
    label: 'Transcode Candidates',
    icon: Zap,
    badgeColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    description: 'Large H.264 and MPEG-2 files. Re-encoding to HEVC (H.265) or AV1 saves ~45–60% with equal quality.',
  },
  {
    id: 'unwatched',
    label: 'Dead Weight (Unwatched)',
    icon: Clock,
    badgeColor: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    description: 'Media added over 6 months ago that has never been played by anyone on this server.',
  },
  {
    id: 'watched_shows',
    label: 'Watched TV Series',
    icon: Tv,
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    description: 'Series where all available episodes have been watched. Ideal for archiving or cleanup.',
  },
  {
    id: 'largest_files',
    label: 'Space Hogs (Largest)',
    icon: HardDrive,
    badgeColor: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    description: 'Top largest individual titles consuming the biggest portions of server storage.',
  },
]

export function PlexStorageOptimizerModal({
  open,
  onOpenChange,
  initialServerId,
}: PlexStorageOptimizerModalProps) {
  const { toast } = useToast()
  const { data: servers = [] } = usePlexStorageServers({ enabled: open })

  // Find owned server or pre-selected
  const [selectedServerId, setSelectedServerId] = useState<number | null>(() => {
    if (initialServerId) return initialServerId
    return null
  })

  // Pick first owned server if none selected
  const activeServerId = useMemo(() => {
    if (selectedServerId !== null) return selectedServerId
    if (servers.length > 0) {
      const owned = servers.find((s) => s.owned)
      return (owned ?? servers[0]).id
    }
    return null
  }, [selectedServerId, servers])

  const [activeTab, setActiveTab] = useState<SavingsCategory>('duplicates')
  const [searchFilter, setSearchFilter] = useState('')
  const [copiedPaths, setCopiedPaths] = useState(false)

  const { data: summary, isLoading: summaryLoading, isFetching: summaryFetching } = usePlexStorageSummary(
    activeServerId,
    { enabled: open && Boolean(activeServerId) }
  )

  const {
    data: recommendations,
    isLoading: recsLoading,
  } = usePlexStorageRecommendations(activeServerId, activeTab, {
    enabled: open && Boolean(activeServerId),
  })

  const refreshMutation = useRefreshPlexStorage()

  const handleRefresh = async () => {
    try {
      await refreshMutation.mutateAsync(activeServerId)
      toast({
        title: 'Storage refreshed',
        description: 'Plex storage metrics have been re-calculated.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Refresh failed',
        description: 'Could not refresh Plex storage metrics.',
        variant: 'error',
      })
    }
  }

  // Safe accessor values handling both camelCase (from apiClient) and snake_case
  const totalBytes = summary?.totalBytes ?? summary?.total_bytes ?? 0
  const totalItems = summary?.totalItems ?? summary?.total_items ?? 0
  const totalFiles = summary?.totalFiles ?? summary?.total_files ?? 0
  const potentialSavingsBytes = summary?.potentialSavingsBytes ?? summary?.potential_savings_bytes ?? 0
  const watchedBytes = summary?.watchStatus?.watchedBytes ?? summary?.watch_status?.watched_bytes ?? 0
  const unwatchedBytes = summary?.watchStatus?.unwatchedBytes ?? summary?.watch_status?.unwatched_bytes ?? 0
  const breakdownByResolution = summary?.breakdownByResolution ?? summary?.breakdown_by_resolution ?? []
  const breakdownByCodec = summary?.breakdownByCodec ?? summary?.breakdown_by_codec ?? []

  // Filter items in current tab
  const filteredItems = useMemo(() => {
    const list = recommendations?.items ?? []
    if (!searchFilter.trim()) return list
    const q = searchFilter.toLowerCase().trim()
    return list.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        (it.year && String(it.year).includes(q)) ||
        (it.parts && it.parts.some((p) => (p.file || '').toLowerCase().includes(q)))
    )
  }, [recommendations?.items, searchFilter])

  // Copy all file paths in current tab
  const handleCopyPaths = () => {
    const paths: string[] = []
    filteredItems.forEach((it) => {
      const redFiles = it.redundantFiles ?? it.redundant_files
      if (activeTab === 'duplicates' && redFiles) {
        redFiles.forEach((p) => p.file && paths.push(p.file))
      } else if (it.parts) {
        it.parts.forEach((p) => p.file && paths.push(p.file))
      }
    })

    if (paths.length === 0) {
      toast({ title: 'No file paths found to copy' })
      return
    }

    navigator.clipboard.writeText(paths.join('\n'))
    setCopiedPaths(true)
    setTimeout(() => setCopiedPaths(false), 2000)
    toast({
      title: 'File paths copied',
      description: `Copied ${paths.length} file paths to clipboard.`,
      variant: 'success',
    })
  }

  // Export current recommendations as CSV
  const handleExportCsv = () => {
    if (filteredItems.length === 0) {
      toast({ title: 'No items to export' })
      return
    }

    const headers = [
      'Title',
      'Year',
      'Media Type',
      'Library',
      'Current Size (Bytes)',
      'Current Size (Formatted)',
      'Potential Savings (Bytes)',
      'Potential Savings (Formatted)',
      'Primary Codec',
      'Resolution',
      'View Count',
      'File Paths',
    ]

    const rows = filteredItems.map((it) => {
      const size = it.totalSize ?? it.total_size ?? 0
      const savings =
        it.reclaimableBytes ??
        it.reclaimable_bytes ??
        it.estimatedSavingsBytes ??
        it.estimated_savings_bytes ??
        (activeTab === 'unwatched' ? size : 0)
      const paths = (it.parts || []).map((p) => p.file).join('; ')
      const libTitle = it.libraryTitle ?? it.library_title ?? ''
      const mediaType = it.mediaType ?? it.media_type ?? ''
      const codec = it.primaryCodecLabel ?? it.primary_codec_label ?? ''
      const res = it.primaryResolutionLabel ?? it.primary_resolution_label ?? ''
      const views = it.viewCount ?? it.view_count ?? 0

      return [
        `"${it.title.replace(/"/g, '""')}"`,
        it.year ?? '',
        mediaType,
        `"${libTitle.replace(/"/g, '""')}"`,
        size,
        `"${formatBytes(size)}"`,
        savings,
        `"${formatBytes(savings)}"`,
        codec,
        res,
        views,
        `"${paths.replace(/"/g, '""')}"`,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `plex-storage-savings-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Export generated',
      description: `Exported ${filteredItems.length} recommendations to CSV.`,
      variant: 'success',
    })
  }

  const currentTabDef = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-zinc-950 border border-white/10"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e5a00d]/15 text-[#e5a00d] ring-1 ring-inset ring-[#e5a00d]/30">
            <PlexIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Plex Storage Optimizer</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                <Sparkles className="h-3 w-3" /> Reclaim Space
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Analyze disk usage across linked Plex servers and discover waste to reclaim.
            </p>
          </div>
        </div>

        {/* Server selector & Refresh action */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          {servers.length > 1 && (
            <div className="relative">
              <select
                value={activeServerId ?? ''}
                onChange={(e) => setSelectedServerId(Number(e.target.value))}
                className="appearance-none rounded-xl bg-white/[0.06] hover:bg-white/[0.1] pl-3 pr-8 py-2 text-xs font-medium text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
              >
                {servers.map((srv) => {
                  const cnt = srv.itemCount ?? srv.item_count ?? 0
                  return (
                    <option key={srv.id} value={srv.id} className="bg-zinc-900 text-white">
                      {srv.name} {srv.owned ? '(Owner)' : ''} · {cnt} items
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 pointer-events-none" />
            </div>
          )}

          <DkButton
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            loading={refreshMutation.isPending || summaryFetching}
            disabled={refreshMutation.isPending || summaryFetching}
            leftIcon={RefreshCw}
            className="bg-white/5 hover:bg-white/10 text-white/80"
          >
            Refresh
          </DkButton>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Top Summary Metrics Cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Media Storage */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Total Scanned Storage</span>
                <HardDrive className="h-4 w-4 text-white/40" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {formatBytes(totalBytes)}
                </span>
                <p className="text-[11px] text-white/40 mt-1">
                  Across {totalItems} items ({totalFiles} media files)
                </p>
              </div>
            </div>

            {/* Potential Reclaimable Savings */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-emerald-400/80">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Reclaimable Storage</span>
                <Sparkles className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-emerald-300 tabular-nums">
                  Up to {formatBytes(potentialSavingsBytes)}
                </span>
                <p className="text-[11px] text-emerald-400/60 mt-1">
                  From duplicates, transcode savings & dead weight
                </p>
              </div>
            </div>

            {/* Watch Distribution */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Watch Footprint</span>
                <Film className="h-4 w-4 text-white/40" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-white/80 font-medium">Watched: {formatBytes(watchedBytes)}</span>
                  <span className="text-rose-400 font-medium">Unwatched: {formatBytes(unwatchedBytes)}</span>
                </div>
                {/* Visual Ratio Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] mt-2 flex">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${totalBytes > 0 ? (watchedBytes / totalBytes) * 100 : 50}%`,
                    }}
                  />
                  <div
                    className="h-full bg-rose-500/60 transition-all duration-500"
                    style={{
                      width: `${totalBytes > 0 ? (unwatchedBytes / totalBytes) * 100 : 50}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visual Distribution Breakdowns (Resolutions & Codecs) */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Resolution Distribution */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="font-semibold text-white/80">Storage by Resolution</span>
                <span className="text-[11px] text-white/40">Media files</span>
              </div>
              <div className="space-y-2">
                {breakdownByResolution.slice(0, 4).map((r) => {
                  const rBytes = r.totalBytes ?? r.total_bytes ?? 0
                  const pct = totalBytes > 0 ? (rBytes / totalBytes) * 100 : 0
                  return (
                    <div key={r.resolution} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/70 font-medium">{r.resolution}</span>
                        <span className="text-white/40 tabular-nums">
                          {formatBytes(rBytes)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Codec Distribution */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="font-semibold text-white/80">Storage by Codec</span>
                <span className="text-[11px] text-white/40">Efficiency</span>
              </div>
              <div className="space-y-2">
                {breakdownByCodec.slice(0, 4).map((c) => {
                  const cBytes = c.totalBytes ?? c.total_bytes ?? 0
                  const pct = totalBytes > 0 ? (cBytes / totalBytes) * 100 : 0
                  const isLegacy = c.codec?.includes('H.264') || c.codec?.includes('MPEG')
                  return (
                    <div key={c.codec} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/70 font-medium flex items-center gap-1.5">
                          {c.codec}
                          {isLegacy && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 font-semibold">
                              Can Transcode
                            </span>
                          )}
                        </span>
                        <span className="text-white/40 tabular-nums">
                          {formatBytes(cBytes)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isLegacy ? 'bg-amber-400/70' : 'bg-emerald-400/70'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="border-b border-white/10">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {TABS.map((tab) => {
              const TabIcon = tab.icon
              const catMap = summary?.categoriesSummary ?? summary?.categories_summary
              const catInfo = catMap ? (catMap as any)[tab.id] : undefined
              const count = catInfo?.count
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    setSearchFilter('')
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm ring-1 ring-inset ring-white/15'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                        isActive ? tab.badgeColor : 'text-white/40 bg-white/5 border-white/10'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Description & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] p-3.5 rounded-2xl border border-white/[0.06]">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
            <p className="text-xs text-white/60 leading-relaxed">{currentTabDef.description}</p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <input
                type="text"
                placeholder="Filter titles..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-36 sm:w-44 rounded-xl bg-white/[0.05] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Copy file paths */}
            <DkButton
              size="sm"
              variant="ghost"
              onClick={handleCopyPaths}
              leftIcon={copiedPaths ? Check : Copy}
              className="bg-white/5 hover:bg-white/10 text-white/80 text-xs px-2.5"
            >
              {copiedPaths ? 'Copied' : 'Copy Paths'}
            </DkButton>

            {/* Export CSV */}
            <DkButton
              size="sm"
              variant="ghost"
              onClick={handleExportCsv}
              leftIcon={Download}
              className="bg-white/5 hover:bg-white/10 text-white/80 text-xs px-2.5"
            >
              Export CSV
            </DkButton>
          </div>
        </div>

        {/* Item List */}
        {recsLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">Analyzing media items for {currentTabDef.label}...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-2 rounded-2xl bg-white/[0.01] border border-dashed border-white/10">
            <Check className="h-7 w-7 text-emerald-400/80 mb-1" />
            <p className="text-sm font-semibold text-white/70">No items found</p>
            <p className="text-xs text-white/40 max-w-sm text-center">
              {searchFilter
                ? 'No items matched your search filter.'
                : `Your server is already optimized for this category! No ${currentTabDef.label.toLowerCase()} detected.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <StorageItemCard
                key={`${item.id}-${item.ratingKey ?? item.rating_key}`}
                item={item}
                category={activeTab}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 border-t border-white/10 bg-white/[0.02] text-xs text-white/40">
        <span>
          Showing {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-xl px-4 py-1.5 font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </DkDialog>
  )
}

function StorageItemCard({
  item,
  category,
}: {
  item: PlexStorageRecommendationItem
  category: SavingsCategory
}) {
  const [expanded, setExpanded] = useState(false)
  const totalSize = item.totalSize ?? item.total_size ?? 0
  const reclaimableBytes = item.reclaimableBytes ?? item.reclaimable_bytes
  const estimatedSavingsBytes = item.estimatedSavingsBytes ?? item.estimated_savings_bytes
  const savingsPercentage = item.savingsPercentage ?? item.savings_percentage
  const targetCodec = item.targetCodec ?? item.target_codec
  const daysSinceAdded = item.daysSinceAdded ?? item.days_since_added
  const mediaType = item.mediaType ?? item.media_type
  const libraryTitle = item.libraryTitle ?? item.library_title
  const resLabel = item.primaryResolutionLabel ?? item.primary_resolution_label
  const codecLabel = item.primaryCodecLabel ?? item.primary_codec_label
  const views = item.viewCount ?? item.view_count ?? 0
  const redundantFiles = item.redundantFiles ?? item.redundant_files
  const parts = item.parts || []

  return (
    <div className="rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] p-4 transition-all space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Title & Metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white tracking-tight truncate">{item.title}</span>
            {item.year && <span className="text-xs text-white/40">({item.year})</span>}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-white/60">
              {mediaType === 'movie' ? <Film className="h-3 w-3" /> : <Tv className="h-3 w-3" />}
              {libraryTitle}
            </span>
            {resLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-white/60">
                {resLabel}
              </span>
            )}
            {codecLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-white/60">
                {codecLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-white/40 mt-1 flex-wrap">
            <span>Current Size: <strong className="text-white/70">{formatBytes(totalSize)}</strong></span>
            <span>·</span>
            <span>Plays: {views}</span>
            {daysSinceAdded !== undefined && daysSinceAdded !== null && (
              <>
                <span>·</span>
                <span>Added {daysSinceAdded} days ago</span>
              </>
            )}
          </div>
        </div>

        {/* Category-Specific Highlight Badge */}
        <div className="shrink-0 flex items-center gap-3">
          {category === 'duplicates' && reclaimableBytes !== undefined && (
            <div className="text-right">
              <span className="text-xs font-bold text-amber-400 block tabular-nums">
                Save {formatBytes(reclaimableBytes)}
              </span>
              <span className="text-[10px] text-white/40">
                {parts.length} files detected
              </span>
            </div>
          )}

          {category === 'transcode' && estimatedSavingsBytes !== undefined && (
            <div className="text-right">
              <span className="text-xs font-bold text-sky-400 block tabular-nums">
                Save ~{formatBytes(estimatedSavingsBytes)} ({savingsPercentage}%)
              </span>
              <span className="text-[10px] text-white/40">
                via {targetCodec}
              </span>
            </div>
          )}

          {category === 'unwatched' && (
            <div className="text-right">
              <span className="text-xs font-bold text-rose-400 block tabular-nums">
                {formatBytes(totalSize)}
              </span>
              <span className="text-[10px] text-white/40">Never watched</span>
            </div>
          )}

          {category === 'watched_shows' && (
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-400 block tabular-nums">
                {formatBytes(totalSize)}
              </span>
              <span className="text-[10px] text-white/40">Fully watched</span>
            </div>
          )}

          {category === 'largest_files' && (
            <div className="text-right">
              <span className="text-xs font-bold text-purple-400 block tabular-nums">
                {formatBytes(totalSize)}
              </span>
              <span className="text-[10px] text-white/40">Top file</span>
            </div>
          )}

          {parts.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs"
              title="Toggle file paths"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded File Paths & Media Details */}
      {expanded && parts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-xs">
          <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">File Paths on Disk:</p>
          {parts.map((p, idx) => {
            const pId = p.partId ?? p.part_id ?? String(idx)
            const isRedundant =
              category === 'duplicates' &&
              redundantFiles?.some((rf) => (rf.partId ?? rf.part_id) === pId)
            const pRes = p.videoResolutionLabel ?? p.video_resolution_label
            const pCodec = p.videoCodecLabel ?? p.video_codec_label

            return (
              <div
                key={pId}
                className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[11px] ${
                  isRedundant
                    ? 'bg-amber-500/[0.07] border-amber-500/20 text-amber-200'
                    : 'bg-black/30 border-white/5 text-white/70'
                }`}
              >
                <div className="truncate min-w-0 flex-1">
                  <span className="select-all break-all">{p.file || 'Unknown path'}</span>
                </div>
                <div className="shrink-0 flex items-center gap-2 text-[10px] font-sans">
                  {isRedundant && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                      Redundant Copy
                    </span>
                  )}
                  {pRes && <span className="text-white/40 font-mono">{pRes}</span>}
                  {pCodec && <span className="text-white/40 font-mono">{pCodec}</span>}
                  <span className="font-semibold text-white/80 tabular-nums">{formatBytes(p.size)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
