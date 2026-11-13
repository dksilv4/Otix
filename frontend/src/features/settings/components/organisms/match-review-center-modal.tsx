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
import { getDesktopAPI } from '@/lib/desktop/api'
import { resolveCatalogGame } from '@/features/launcher/data/queries'
import {
  useGameMatches,
  useConfirmMatch,
  useUnmatchRecord,
  useClearGameMatches,
} from '../../hooks/use-node-paths'
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
  nodeId?: number | null
}

export const MatchReviewCenterModal = ({
  open,
  onOpenChange,
  initialRecordId: _initialRecordId,
  nodeId,
}: MatchReviewCenterModalProps) => {
  const [tab, setTab] = useState<MatchFilterTab>('needs_review')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: records = [], isLoading, refetch } = useGameMatches(undefined, undefined, nodeId)
  const confirmMatchMutation = useConfirmMatch()
  const unmatchMutation = useUnmatchRecord()
  const clearMatchesMutation = useClearGameMatches(nodeId)

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

  const handleConfirmCandidate = async (recordId: number, mediaItemId: string) => {
    const record = records.find((r) => r.id === recordId)
    let resolvedMediaId = mediaItemId
    let cand = record?.candidates?.find((c) => String(c.mediaId) === String(mediaItemId))
    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)

    if (String(resolvedMediaId).startsWith('igdb:')) {
      if (api && typeof (api as any).importCatalogIgdb === 'function') {
        try {
          const imported = await (api as any).importCatalogIgdb(resolvedMediaId)
          if (imported?.id) {
            resolvedMediaId = String(imported.id)
            if (cand) {
              cand = {
                ...cand,
                ...imported,
                posterUrl: imported.poster_url || imported.posterUrl || cand.posterUrl,
                backdropUrl: imported.backdrop_url || imported.backdropUrl || cand.backdropUrl,
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (String(resolvedMediaId).startsWith('igdb:')) {
        try {
          const resolved = await resolveCatalogGame((cand || { id: resolvedMediaId }) as any)
          resolvedMediaId = String(resolved.id)
          if (cand) {
            cand = { ...cand, ...resolved }
          }
        } catch (err) {
          console.warn('[MatchReviewCenterModal] Failed to resolve IGDB catalog item:', err)
        }
      }
    }

    try {
      await confirmMatchMutation.mutateAsync({ recordId, mediaItemId: resolvedMediaId })
    } catch {
      // Backend may be unauthenticated or offline
    }
    const targetKey = record?.canonicalKey || record?.relativePath
    if (api && targetKey) {
      try {
        await api.acceptSuggestion(targetKey, {
          id: resolvedMediaId,
          title: cand?.title || record.cleanedTitle,
          slug: cand?.slug || '',
          mediaType: 'game',
          posterUrl: cand?.posterUrl || (cand as any)?.poster_url || (cand as any)?.images?.poster?.url || null,
          backdropUrl: cand?.backdropUrl || (cand as any)?.backdrop_url || (cand as any)?.images?.backdrop?.url || null,
          confidence: cand?.confidence ?? 1.0,
        })
      } catch (err) {
        console.warn('[MatchReviewCenterModal] Local acceptSuggestion error:', err)
      }
    }
    void refetch()
  }

  const handleUnmatch = async (recordId: number) => {
    const record = records.find((r) => r.id === recordId)
    try {
      await unmatchMutation.mutateAsync(recordId)
    } catch {
      // Backend may be unauthenticated or offline
    }
    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    const targetKey = record?.canonicalKey || record?.relativePath
    if (api && targetKey) {
      try {
        if (typeof (api as any).unmatchGame === 'function') {
          await (api as any).unmatchGame(targetKey)
        } else {
          await api.rejectSuggestion(targetKey, record.mediaItemId || '')
        }
      } catch (err) {
        console.warn('[MatchReviewCenterModal] Local unmatch error:', err)
      }
    }
    void refetch()
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
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer',
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
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer',
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
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer',
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
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer',
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
            {counts.all > 0 && (
              <DkButton
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await clearMatchesMutation.mutateAsync()
                  } catch {
                    // Backend may be offline or unauthenticated
                  }
                  void refetch()
                }}
                loading={clearMatchesMutation.isPending}
                title="Clear all match records"
                className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 cursor-pointer rounded-xl"
              >
                Clear All
              </DkButton>
            )}
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

              return (
                <div
                  key={record.id}
                  className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] hover:border-white/[0.08] transition-colors space-y-3"
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
                                ? 'bg-primary/10 text-primary border border-primary/20'
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
                  {record.matchStatus === 'matched' && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
                      {(() => {
                        const m = record.media
                        const poster =
                          m?.posterUrl ||
                          (m as any)?.poster_url ||
                          record.candidates?.[0]?.posterUrl ||
                          (record.candidates?.[0] as any)?.poster_url ||
                          null
                        const title = m?.title || record.cleanedTitle || record.rawTitle
                        const releaseDate =
                          m?.releaseDate ||
                          (m as any)?.release_date ||
                          (record.candidates?.[0]?.releaseYear
                            ? String(record.candidates[0].releaseYear)
                            : null)
                        return (
                          <>
                            {poster ? (
                              <img
                                src={poster}
                                alt={title}
                                className="h-14 w-10 object-cover rounded-lg shrink-0 border border-white/[0.04]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-14 w-10 rounded-lg bg-[var(--dk-surface-ghost)] flex items-center justify-center shrink-0 border border-white/[0.04]">
                                <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {title}
                              </p>
                              {releaseDate && (
                                <p className="text-[11px] text-muted-foreground">
                                  Released: {releaseDate}
                                </p>
                              )}
                              <p className="text-[11px] text-primary mt-0.5">
                                Canonical Match Confirmed
                              </p>
                            </div>
                          </>
                        )
                      })()}
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
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                          >
                            {cand.posterUrl || (cand as any).poster_url ? (
                              <img
                                src={cand.posterUrl || (cand as any).poster_url}
                                alt={cand.title}
                                className="h-12 w-8 object-cover rounded shrink-0 border border-white/[0.04]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-12 w-8 rounded bg-[var(--dk-surface-ghost)] flex items-center justify-center shrink-0 border border-white/[0.04]">
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
                </div>
              )
            })
          )}
        </div>
      </div>
    </DkDialog>
  )
}
