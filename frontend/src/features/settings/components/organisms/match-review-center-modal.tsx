import { useState, useMemo } from 'react'
import {
  Search,
  Check,
  X,
  RefreshCw,
  Gamepad2,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { apiClient } from '@/lib/api/client'
import {
  useGameMatches,
  useConfirmMatch,
  useUnmatchRecord,
} from '../../hooks/use-node-paths'
import type { GameMatchRecord } from '../../types/node-paths'
import {
  type MatchFilterTab,
  formatFileSize,
  getConfidenceBadge,
  filterMatchRecords,
} from '../../utils/match-center'
import { cn } from '@/lib/utils'

export interface MatchReviewCenterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRecordId?: number | null
}

export const MatchReviewCenterModal = ({
  open,
  onOpenChange,
  initialRecordId,
}: MatchReviewCenterModalProps) => {
  const [tab, setTab] = useState<MatchFilterTab>('needs_review')
  const [searchQuery, setSearchQuery] = useState('')
  const [manualSearchRecordId, setManualSearchRecordId] = useState<number | null>(initialRecordId || null)
  const [manualQuery, setManualQuery] = useState('')
  const [manualResults, setManualResults] = useState<any[]>([])
  const [isSearchingManual, setIsSearchingManual] = useState(false)

  const { data: records = [], isLoading, refetch } = useGameMatches()
  const confirmMatchMutation = useConfirmMatch()
  const unmatchMutation = useUnmatchRecord()

  const filtered = useMemo(() => {
    return filterMatchRecords(records, tab, searchQuery)
  }, [records, tab, searchQuery])

  const counts = useMemo(() => {
    return {
      all: records.length,
      needs_review: records.filter((r) => r.matchStatus === 'needs_review').length,
      unmatched: records.filter((r) => r.matchStatus === 'unmatched').length,
      matched: records.filter((r) => r.matchStatus === 'matched').length,
    }
  }, [records])

  const handleManualSearch = async (record: GameMatchRecord) => {
    const q = manualQuery.trim() || record.cleanedTitle || record.rawTitle
    if (!q) return
    setIsSearchingManual(true)
    try {
      const res = await apiClient.get<any>(`/search?q=${encodeURIComponent(q)}&media_type=game`)
      const items = res.data?.results || res.data || []
      setManualResults(Array.isArray(items) ? items : [])
    } catch {
      setManualResults([])
    } finally {
      setIsSearchingManual(false)
    }
  }

  const handleConfirmCandidate = async (recordId: number, mediaItemId: string) => {
    await confirmMatchMutation.mutateAsync({ recordId, mediaItemId })
    if (manualSearchRecordId === recordId) {
      setManualSearchRecordId(null)
      setManualResults([])
    }
  }

  const handleUnmatch = async (recordId: number) => {
    await unmatchMutation.mutateAsync(recordId)
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Game Match Review Center"
      description="Review and resolve game titles identified on your local PC and storage shares."
      className="max-w-4xl max-h-[88vh] flex flex-col"
    >
      <div className="flex flex-col gap-3.5 pt-2 min-h-0 flex-1">
        {/* Filter Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('needs_review')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                tab === 'needs_review'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              Needs Review ({counts.needs_review})
            </button>
            <button
              type="button"
              onClick={() => setTab('unmatched')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                tab === 'unmatched'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              Unmatched ({counts.unmatched})
            </button>
            <button
              type="button"
              onClick={() => setTab('matched')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                tab === 'matched'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              Matched ({counts.matched})
            </button>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                tab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              All ({counts.all})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search matches or paths…"
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <DkButton
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              loading={isLoading}
              title="Refresh matches"
              className="h-8 w-8 p-0 shrink-0 cursor-pointer rounded-xl"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </DkButton>
          </div>
        </div>

        {/* Match Records List */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mb-2" />
              <p className="text-xs">Loading game match records…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center">
              <Gamepad2 className="h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold text-foreground">No matches found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {searchQuery
                  ? `No game match records matched "${searchQuery}".`
                  : tab === 'needs_review'
                    ? 'No games currently need match review! All scanned files are either matched or categorized.'
                    : 'No records in this category.'}
              </p>
            </div>
          ) : (
            filtered.map((record) => {
              const badge = getConfidenceBadge(record.confidence)
              const isManualOpen = manualSearchRecordId === record.id

              return (
                <div
                  key={record.id}
                  className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] hover:border-white/[0.08] transition-all space-y-3"
                >
                  {/* Top Bar: Title, Path, Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground truncate">
                          {record.cleanedTitle || record.rawTitle}
                        </h4>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider',
                            record.matchStatus === 'matched'
                              ? 'bg-primary/10 text-primary'
                              : record.matchStatus === 'needs_review'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-[var(--dk-surface-base)] text-muted-foreground',
                          )}
                        >
                          {record.matchStatus.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className="truncate max-w-md">{record.relativePath}</span>
                        <span>•</span>
                        <span>{formatFileSize(record.filesize)}</span>
                        {record.formatCategory && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{record.formatCategory}</span>
                          </>
                        )}
                        {record.storageShareName && (
                          <>
                            <span>•</span>
                            <span className="text-primary font-sans">{record.storageShareName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {record.matchStatus === 'matched' && (
                      <DkButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnmatch(record.id)}
                        loading={unmatchMutation.isPending}
                        className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer rounded-lg"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Unmatch
                      </DkButton>
                    )}
                  </div>

                  {/* Matched State Info */}
                  {record.matchStatus === 'matched' && record.media && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
                      {record.media.posterUrl ? (
                        <img
                          src={record.media.posterUrl}
                          alt={record.media.title}
                          className="h-14 w-10 object-cover rounded-lg shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-10 rounded-lg bg-[var(--dk-surface-ghost)] flex items-center justify-center shrink-0">
                          <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {record.media.title}
                        </p>
                        {record.media.releaseDate && (
                          <p className="text-[11px] text-muted-foreground">
                            Released: {record.media.releaseDate}
                          </p>
                        )}
                        <p className="text-[11px] text-primary mt-0.5">
                          Canonical Match Confirmed
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Candidates List (Needs Review / Unmatched) */}
                  {record.matchStatus !== 'matched' && record.candidates && record.candidates.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Suggested Catalog Matches
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {record.candidates.map((cand) => (
                          <div
                            key={cand.mediaId}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] hover:border-white/[0.08] transition-all"
                          >
                            {cand.posterUrl ? (
                              <img
                                src={cand.posterUrl}
                                alt={cand.title}
                                className="h-12 w-8 object-cover rounded shrink-0"
                              />
                            ) : (
                              <div className="h-12 w-8 rounded bg-[var(--dk-surface-ghost)] flex items-center justify-center shrink-0">
                                <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate" title={cand.title}>
                                {cand.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                {cand.releaseYear && <span>{cand.releaseYear}</span>}
                                <span>•</span>
                                <span className="text-primary font-semibold">
                                  {Math.round(cand.confidence * 100)}% match
                                </span>
                              </div>
                              <DkButton
                                size="sm"
                                variant="ghost"
                                onClick={() => handleConfirmCandidate(record.id, cand.mediaId)}
                                loading={confirmMatchMutation.isPending}
                                className="mt-1 h-6 px-2 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 w-full justify-center rounded-lg"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Match
                              </DkButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Catalog Search Toggle & Form */}
                  <div className="pt-1">
                    {!isManualOpen ? (
                      <button
                        type="button"
                        onClick={() => {
                          setManualSearchRecordId(record.id)
                          setManualQuery(record.cleanedTitle || record.rawTitle)
                          setManualResults([])
                        }}
                        className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Search className="h-3 w-3" />
                        Search catalog manually…
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            Manual Catalog Lookup
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setManualSearchRecordId(null)
                              setManualResults([])
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={manualQuery}
                            onChange={(e) => setManualQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleManualSearch(record)
                            }}
                            placeholder="Enter game title to search…"
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <DkButton
                            size="sm"
                            onClick={() => void handleManualSearch(record)}
                            loading={isSearchingManual}
                            className="h-8 text-xs shrink-0 rounded-lg"
                          >
                            Search
                          </DkButton>
                        </div>

                        {manualResults.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 max-h-48 overflow-y-auto">
                            {manualResults.map((item: any) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--dk-surface-ghost)] border border-white/[0.04]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {item.posterUrl ? (
                                    <img
                                      src={item.posterUrl}
                                      alt={item.title}
                                      className="h-10 w-7 object-cover rounded shrink-0"
                                    />
                                  ) : (
                                    <div className="h-10 w-7 rounded bg-[var(--dk-surface-base)] flex items-center justify-center shrink-0">
                                      <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">
                                      {item.title}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {item.releaseDate?.slice(0, 4) || 'Unknown year'}
                                    </p>
                                  </div>
                                </div>
                                <DkButton
                                  size="sm"
                                  onClick={() => handleConfirmCandidate(record.id, String(item.id))}
                                  loading={confirmMatchMutation.isPending}
                                  className="h-6 px-2 text-[10px] shrink-0 rounded-lg"
                                >
                                  Select
                                </DkButton>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DkDialog>
  )
}
