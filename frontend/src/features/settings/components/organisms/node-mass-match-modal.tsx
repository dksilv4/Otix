import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Sparkles,
  Gamepad2,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useToast } from '@ui/molecules/toast'
import type { ScannedGameItem, CatalogCandidate } from '../../utils/scanned-summary'
import { searchCatalogGames } from '../../utils/scanned-summary'
import {
  GAME_PLATFORM_OPTIONS,
  getFileFormatBadge,
} from '../../utils/node-scan-files'
import {
  type MassMatchRowItem,
  type MassMatchFilterTab,
  type BatchApplyProgress,
  batchAnalyzeGamesForMatch,
  batchApplyMatches,
  filterMassMatchRows,
  getMassMatchStats,
} from '../../utils/mass-match'
import { cn } from '@/lib/utils'
import type { MassMatchPhase } from '../../types'

export type { MassMatchPhase }

export interface NodeMassMatchModalProps {
  open: boolean
  onClose: () => void
  unmatchedGames: ScannedGameItem[]
  onMatchSuccess?: (updatedGame: ScannedGameItem) => void
  onFinish?: () => void
}

interface InlineSearchModalProps {
  open: boolean
  onClose: () => void
  row: MassMatchRowItem | null
  onSelectCandidate: (candidate: CatalogCandidate) => void
}

const InlineSearchModal = ({
  open,
  onClose,
  row,
  onSelectCandidate,
}: InlineSearchModalProps) => {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<CatalogCandidate[]>([])

  useEffect(() => {
    if (open && row) {
      const initial = row.cleanTitle || row.game.title
      setQuery(initial)
      void executeSearch(initial)
    } else {
      setResults([])
      setQuery('')
    }
  }, [open, row])

  const executeSearch = async (searchTerm: string) => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return
    setIsSearching(true)
    try {
      const candidates = await searchCatalogGames(trimmed)
      setResults(candidates)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  if (!row) return null

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title="Search Catalog Candidate"
      description={`Find the matching game metadata for "${row.game.title}"`}
      className="max-w-xl"
    >
      <div className="space-y-4 pt-1">
        {/* Search input bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void executeSearch(query)
              }}
              placeholder="Search title on IGDB / Otix Catalog…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs sm:text-sm bg-[var(--dk-surface-ghost)] border border-white/[0.06] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <DkButton
            type="button"
            variant="primary"
              disabled={isSearching}
            onClick={() => void executeSearch(query)}
            className="rounded-xl px-4"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </DkButton>
        </div>

        {/* Results List */}
        <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
              <p className="text-xs">Searching catalog games…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              No catalog games found for "{query}". Try simplifying the title.
            </div>
          ) : (
            results.map((candidate) => {
              const poster = candidate.posterUrl || candidate.backdropUrl || candidate.iconUrl
              return (
                <div
                  key={String(candidate.id)}
                  onClick={() => {
                    onSelectCandidate(candidate)
                    onClose()
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-base)] border border-white/[0.04] cursor-pointer transition-colors group"
                >
                  <div className="w-10 h-14 rounded-lg bg-[var(--dk-surface-base)] overflow-hidden shrink-0 flex items-center justify-center">
                    {poster ? (
                      <img
                        src={poster}
                        alt={candidate.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {candidate.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
                      {candidate.slug && <span className="truncate">({candidate.slug})</span>}
                    </div>
                  </div>
                  <DkButton
                    type="button"
                    variant="ghost"
                              className="shrink-0 rounded-lg text-xs"
                  >
                    Select
                  </DkButton>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DkDialog>
  )
}

interface MassMatchRowProps {
  row: MassMatchRowItem
  onToggleSelect: (rowId: string) => void
  onPlatformChange: (rowId: string, platform: string) => void
  onCandidateChange: (rowId: string, candidate: CatalogCandidate) => void
  onOpenSearch: (row: MassMatchRowItem) => void
}

const MassMatchRow = ({
  row,
  onToggleSelect,
  onPlatformChange,
  onCandidateChange,
  onOpenSearch,
}: MassMatchRowProps) => {
  const formatBadge = getFileFormatBadge(row.game)
  const candidate = row.selectedCandidate
  const poster = candidate?.posterUrl || candidate?.backdropUrl || candidate?.iconUrl

  const platformOptions = useMemo(
    () =>
      GAME_PLATFORM_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    [],
  )

  const candidateOptions = useMemo(() => {
    if (!candidate) return []
    const all = [candidate, ...row.otherCandidates]
    return all.map((c) => ({
      value: String(c.id),
      label: c.releaseYear ? `${c.title} (${c.releaseYear})` : c.title,
    }))
  }, [candidate, row.otherCandidates])

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border transition-colors',
        row.isSelected
          ? 'bg-[var(--dk-surface-ghost)] border-primary/20 shadow-xs'
          : 'bg-[var(--dk-surface-ghost)]/60 border-white/[0.04] opacity-80 hover:opacity-100',
      )}
    >
      {/* Left: Checkbox + Scanned File Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={row.isSelected}
          disabled={!row.selectedCandidate}
          onChange={() => onToggleSelect(row.id)}
          className="h-4 w-4 rounded text-primary focus:ring-primary border-white/[0.1] bg-[var(--dk-surface-base)] cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {row.game.title}
            </span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
              {formatBadge.label}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5" title={row.game.path}>
            {row.game.path}
          </p>
        </div>
      </div>

      {/* Middle: Platform selector */}
      <div className="w-32 shrink-0">
        <DkDropdown
          value={row.selectedPlatform}
          onChange={(val) => onPlatformChange(row.id, val)}
          options={platformOptions}
          className="w-full text-xs rounded-xl"
        />
      </div>

      {/* Right: Candidate match info & actions */}
      <div className="flex items-center gap-3 shrink-0 sm:w-72 justify-between sm:justify-end">
        {candidate ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-11 rounded-md bg-[var(--dk-surface-base)] overflow-hidden shrink-0 flex items-center justify-center">
              {poster ? (
                <img
                  src={poster}
                  alt={candidate.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Gamepad2 className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {row.otherCandidates.length > 0 ? (
                <DkDropdown
                  value={String(candidate.id)}
                  onChange={(id) => {
                    const match = [candidate, ...row.otherCandidates].find((c) => String(c.id) === id)
                    if (match) onCandidateChange(row.id, match)
                  }}
                  options={candidateOptions}
                          className="w-full text-xs rounded-lg"
                />
              ) : (
                <p className="text-xs font-medium text-foreground truncate">
                  {candidate.title}
                </p>
              )}

              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded text-[10px] font-semibold',
                    row.status === 'high_confidence'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-[var(--dk-surface-base)] text-muted-foreground',
                  )}
                >
                  {Math.round(row.confidence * 100)}% match
                </span>
                {candidate.releaseYear && (
                  <span className="text-[10px] text-muted-foreground">
                    {candidate.releaseYear}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-destructive flex-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[11px]">No candidate</span>
          </div>
        )}

        {/* Change / Search Button */}
        <DkButton
          type="button"
          variant="ghost"
          onClick={() => onOpenSearch(row)}
          title="Search alternative candidate"
          className="h-8 px-2.5 text-xs rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
        >
          {candidate ? 'Change' : 'Search'}
        </DkButton>
      </div>
    </div>
  )
}

export const NodeMassMatchModal = ({
  open,
  onClose,
  unmatchedGames,
  onMatchSuccess,
  onFinish,
}: NodeMassMatchModalProps) => {
  const { toast } = useToast()

  const [phase, setPhase] = useState<MassMatchPhase>('analyzing')
  const [rows, setRows] = useState<MassMatchRowItem[]>([])
  const [activeTab, setActiveTab] = useState<MassMatchFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Progress states
  const [analysisProgress, setAnalysisProgress] = useState({ processed: 0, total: 0 })
  const [applyProgress, setApplyProgress] = useState<BatchApplyProgress>({
    processed: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    lastTitle: '',
  })

  // Inline search modal target
  const [searchTargetRow, setSearchTargetRow] = useState<MassMatchRowItem | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Start analysis on open
  useEffect(() => {
    if (!open) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setPhase('analyzing')
      setRows([])
      setActiveTab('all')
      setSearchQuery('')
      return
    }

    if (unmatchedGames.length === 0) {
      setPhase('completed')
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setPhase('analyzing')
    setAnalysisProgress({ processed: 0, total: unmatchedGames.length })

    void (async () => {
      try {
        const analyzedRows = await batchAnalyzeGamesForMatch(
          unmatchedGames,
          5,
          (processed, total) => {
            if (isMountedRef.current) {
              setAnalysisProgress({ processed, total })
            }
          },
          controller.signal,
        )

        if (!isMountedRef.current || controller.signal.aborted) return
        setRows(analyzedRows)
        setPhase('reviewing')
      } catch {
        if (!isMountedRef.current) return
        setPhase('reviewing')
      }
    })()
  }, [open, unmatchedGames])

  // Stats & filtered rows
  const stats = useMemo(() => getMassMatchStats(rows), [rows])
  const filteredRows = useMemo(
    () => filterMassMatchRows(rows, activeTab, searchQuery),
    [rows, activeTab, searchQuery],
  )

  // Toggle selection
  const handleToggleRowSelect = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, isSelected: !r.isSelected } : r)),
    )
  }, [])

  // Platform change
  const handlePlatformChange = useCallback((rowId: string, platform: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, selectedPlatform: platform } : r)),
    )
  }, [])

  // Candidate change
  const handleCandidateChange = useCallback((rowId: string, candidate: CatalogCandidate) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        return {
          ...r,
          selectedCandidate: candidate,
          isSelected: true,
        }
      }),
    )
  }, [])

  // Selection actions
  const handleSelectHighConfidence = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isSelected: r.status === 'high_confidence',
      })),
    )
  }

  const handleSelectAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isSelected: Boolean(r.selectedCandidate),
      })),
    )
  }

  const handleDeselectAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isSelected: false,
      })),
    )
  }

  // Apply batch matches
  const handleApplyMatches = async () => {
    const selected = rows.filter((r) => r.isSelected && r.selectedCandidate)
    if (selected.length === 0) return

    setPhase('applying')
    setApplyProgress({
      processed: 0,
      total: selected.length,
      succeeded: 0,
      failed: 0,
      lastTitle: '',
    })

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const result = await batchApplyMatches(
        rows,
        5,
        (progress) => {
          if (isMountedRef.current) {
            setApplyProgress(progress)
          }
        },
        controller.signal,
      )

      if (!isMountedRef.current) return

      for (const updated of result.succeeded) {
        onMatchSuccess?.(updated)
      }

      toast({
        title: 'Mass Match Completed',
        description: `Successfully applied ${result.succeeded.length} game ${result.succeeded.length === 1 ? 'match' : 'matches'}.`,
        variant: 'success',
      })

      setPhase('completed')
    } catch (err: any) {
      if (!isMountedRef.current) return
      toast({
        title: 'Mass Match Failed',
        description: err?.message || 'Could not commit matches.',
        variant: 'error',
      })
      setPhase('reviewing')
    }
  }

  const handleClose = () => {
    onFinish?.()
    onClose()
  }

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose()
        }}
        title={
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <span>Mass Match Games</span>
          </div>
        }
        description="Batch analyze and confirm metadata for unmatched game dumps and files."
        className="max-w-5xl"
      >
        <div className="space-y-4 pt-1">
          {/* ── Phase 1: Analyzing ── */}
          {phase === 'analyzing' && (
            <div className="py-12 px-4 text-center space-y-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">
                  Analyzing Catalog Matches…
                </h3>
                <p className="text-xs text-muted-foreground">
                  Processing {analysisProgress.processed} of {analysisProgress.total} games concurrently
                </p>
              </div>

              <div className="w-full max-w-md mx-auto h-2 rounded-full bg-[var(--dk-surface-base)] overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{
                    width: `${analysisProgress.total > 0 ? Math.max(5, Math.round((analysisProgress.processed / analysisProgress.total) * 100)) : 5}%`,
                  }}
                />
              </div>

              <div className="pt-2">
                <DkButton
                  type="button"
                  variant="ghost"
                          onClick={() => {
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort()
                    }
                    setPhase('reviewing')
                  }}
                  className="rounded-xl text-xs text-muted-foreground"
                >
                  Skip Analysis & Review Now
                </DkButton>
              </div>
            </div>
          )}

          {/* ── Phase 2: Bulk Review Table ── */}
          {phase === 'reviewing' && (
            <div className="space-y-3">
              {/* Filter Tabs & Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-white/[0.04]">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      activeTab === 'all'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    All ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ready')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      activeTab === 'ready'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Ready ({stats.selectedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('review')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      activeTab === 'review'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Needs Review ({stats.needsReview})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('unmatched')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      activeTab === 'unmatched'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Unmatched ({stats.unmatched})
                  </button>
                </div>

                {/* Search & Bulk Selection Actions */}
                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter title or path…"
                      className="w-full pl-8 pr-2.5 py-1 rounded-xl text-xs bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <DkButton
                    type="button"
                    variant="ghost"
                              onClick={handleSelectHighConfidence}
                    title="Select only high-confidence matches"
                    className="h-7 px-2 text-[11px] rounded-lg text-primary hover:bg-primary/10"
                  >
                    High Conf
                  </DkButton>

                  <DkButton
                    type="button"
                    variant="ghost"
                              onClick={handleSelectAll}
                    title="Select all games with candidates"
                    className="h-7 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    All
                  </DkButton>

                  <DkButton
                    type="button"
                    variant="ghost"
                              onClick={handleDeselectAll}
                    title="Clear selection"
                    className="h-7 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </DkButton>
                </div>
              </div>

              {/* Rows List */}
              <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                {filteredRows.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                    No games match the current filter.
                  </div>
                ) : (
                  filteredRows.map((row) => (
                    <MassMatchRow
                      key={row.id}
                      row={row}
                      onToggleSelect={handleToggleRowSelect}
                      onPlatformChange={handlePlatformChange}
                      onCandidateChange={handleCandidateChange}
                      onOpenSearch={(r) => setSearchTargetRow(r)}
                    />
                  ))
                )}
              </div>

              {/* Bottom Action Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {stats.selectedCount}
                  </span>{' '}
                  of {stats.total} games selected to match
                </div>

                <div className="flex items-center gap-2">
                  <DkButton
                    type="button"
                    variant="ghost"
                              onClick={handleClose}
                    className="rounded-xl"
                  >
                    Cancel
                  </DkButton>

                  <DkButton
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={stats.selectedCount === 0}
                    onClick={() => void handleApplyMatches()}
                    className="rounded-xl px-5 shadow-xs"
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    <span>Apply Matches ({stats.selectedCount})</span>
                  </DkButton>
                </div>
              </div>
            </div>
          )}

          {/* ── Phase 3: Applying ── */}
          {phase === 'applying' && (
            <div className="py-12 px-4 text-center space-y-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">
                  Applying Game Matches…
                </h3>
                <p className="text-xs text-muted-foreground">
                  Saving {applyProgress.processed} of {applyProgress.total} matches
                  {applyProgress.lastTitle && ` ("${applyProgress.lastTitle}")`}
                </p>
              </div>

              <div className="w-full max-w-md mx-auto h-2 rounded-full bg-[var(--dk-surface-base)] overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{
                    width: `${applyProgress.total > 0 ? Math.max(5, Math.round((applyProgress.processed / applyProgress.total) * 100)) : 5}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Phase 4: Completed ── */}
          {phase === 'completed' && (
            <div className="py-10 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  Mass Matching Finished!
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                  {applyProgress.succeeded > 0
                    ? `Successfully matched and linked ${applyProgress.succeeded} ${applyProgress.succeeded === 1 ? 'game' : 'games'}.`
                    : 'Mass match review completed.'}
                </p>
                {applyProgress.failed > 0 && (
                  <p className="text-xs text-destructive">
                    {applyProgress.failed} games could not be saved.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <DkButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleClose}
                  className="rounded-xl px-6"
                >
                  Done
                </DkButton>
              </div>
            </div>
          )}
        </div>
      </DkDialog>

      {/* ── Inline Manual Search Modal ── */}
      <InlineSearchModal
        open={Boolean(searchTargetRow)}
        onClose={() => setSearchTargetRow(null)}
        row={searchTargetRow}
        onSelectCandidate={(cand) => {
          if (searchTargetRow) {
            handleCandidateChange(searchTargetRow.id, cand)
          }
        }}
      />
    </>
  )
}
