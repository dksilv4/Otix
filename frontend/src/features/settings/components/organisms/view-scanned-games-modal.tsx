import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Gamepad2,
  Disc,
  Loader2,
  Sparkles,
  Check,
  X,
  RefreshCw,
  ArrowDown,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useOptionalToast } from '@ui/molecules/toast'
import {
  type ScannedGameItem,
  type CatalogCandidate,
  type ScannedFilterTab,
  fetchScannedGamesList,
  searchCatalogGames,
  matchScannedGameItem,
  filterScannedGames,
  computeScannedGamesCounts,
  formatMatchConfidence,
  formatBytes,
} from '../../utils/scanned-summary'
import { useMatchingProgress } from '../../hooks/use-matching-progress'
import { MatchingProgressCard } from '../molecules/matching-progress-card'
import { getDesktopAPI } from '@/lib/desktop/api'
import { cn } from '@/lib/utils'

export interface ViewScannedGamesModalProps {
  open?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  isExiting?: boolean
  nodeId?: number | null
  nodeName?: string
}

interface InlineMatchSearchProps {
  game: ScannedGameItem
  onSelectCandidate: (candidate: CatalogCandidate) => Promise<void>
  onCancel: () => void
  isMatching: boolean
}

const InlineMatchSearch = ({
  game,
  onSelectCandidate,
  onCancel,
  isMatching,
}: InlineMatchSearchProps) => {
  const [query, setQuery] = useState(game.title)
  const [results, setResults] = useState<CatalogCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedCandId, setSelectedCandId] = useState<string | number | null>(null)

  const handleSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setHasSearched(false)
      return
    }
    setSearching(true)
    setHasSearched(true)
    try {
      const candidates = await searchCatalogGames(trimmed)
      setResults(candidates)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    void handleSearch(game.title)
  }, [game.title, handleSearch])

  return (
    <div className="mt-3 p-3.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-primary" />
          <span>Match with Catalog</span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          <span>Cancel</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch(query)
            }}
            placeholder="Search catalog for game title…"
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
          />
        </div>
        <DkButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleSearch(query)}
          loading={searching}
          className="h-8 px-3 text-xs shrink-0"
        >
          Search
        </DkButton>
      </div>

      <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
        {searching ? (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs">Searching catalog games…</span>
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {results.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {candidate.posterUrl ? (
                    <img
                      src={candidate.posterUrl}
                      alt={candidate.title}
                      className="h-12 w-9 rounded-md object-cover bg-[var(--dk-surface-base)] shrink-0 shadow-xs"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                      <Gamepad2 className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="text-xs font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                        {candidate.title}
                      </h5>
                      {Boolean(candidate.releaseYear) && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
                          {candidate.releaseYear}
                        </span>
                      )}
                    </div>
                    {candidate.overview && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {candidate.overview}
                      </p>
                    )}
                  </div>
                </div>

                <DkButton
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setSelectedCandId(candidate.id)
                    void onSelectCandidate(candidate)
                  }}
                  loading={isMatching && selectedCandId === candidate.id}
                  disabled={isMatching}
                  className="h-7 px-3 text-xs shrink-0"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Match
                </DkButton>
              </div>
            ))}
          </div>
        ) : hasSearched ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            No games found matching &ldquo;{query}&rdquo;.
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface ScannedGameCardProps {
  game: ScannedGameItem
  isMatchingOpen: boolean
  onToggleMatching: () => void
  onMatch: (candidate: CatalogCandidate) => Promise<void>
  isMatchingPending: boolean
}

const ScannedGameCard = ({
  game,
  isMatchingOpen,
  onToggleMatching,
  onMatch,
  isMatchingPending,
}: ScannedGameCardProps) => {
  return (
    <div className="relative rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] p-3.5 transition-colors overflow-hidden group">
      {/* Soft glassmorphic backdrop preview */}
      {game.backdropUrl && (
        <div
          className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.14] pointer-events-none transition-opacity bg-cover bg-center"
          style={{ backgroundImage: `url(${game.backdropUrl})` }}
        />
      )}

      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Poster image or fallback */}
            {game.posterUrl ? (
              <img
                src={game.posterUrl}
                alt={game.title}
                className="h-24 w-16 sm:h-28 sm:w-20 rounded-xl object-cover bg-[var(--dk-surface-base)] shrink-0 shadow-xs border border-white/[0.04]"
                loading="lazy"
              />
            ) : (
              <div className="flex h-24 w-16 sm:h-28 sm:w-20 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 border border-white/[0.04]">
                {game.isIso ? <Disc className="h-8 w-8" /> : <Gamepad2 className="h-8 w-8" />}
              </div>
            )}

            {/* Title, Badges, Overview, and Path */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                  {game.title}
                </h4>

                {Boolean(game.releaseYear) && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
                    {game.releaseYear}
                  </span>
                )}

                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
                  {game.format}
                </span>

                {game.matched ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/15 text-primary shrink-0 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>
                      Matched{game.confidence != null ? ` (${formatMatchConfidence(game.confidence)})` : ''}
                    </span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
                    Unmatched
                  </span>
                )}
              </div>

              {game.overview && (
                <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                  {game.overview}
                </p>
              )}

              <div className="pt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/70 font-mono">
                <span className="truncate max-w-xs sm:max-w-md" title={game.path}>
                  {game.path}
                </span>
                {Boolean(game.sizeBytes) && (
                  <>
                    <span>•</span>
                    <span className="shrink-0">{formatBytes(game.sizeBytes)}</span>
                  </>
                )}
                {game.serverName && (
                  <>
                    <span>•</span>
                    <span className="shrink-0 font-sans text-muted-foreground">
                      {game.serverName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="shrink-0 self-start">
            <DkButton
              type="button"
              variant={game.matched ? 'ghost' : 'secondary'}
              size="sm"
              onClick={onToggleMatching}
              className={cn(
                'text-xs h-7 px-2.5 rounded-lg cursor-pointer transition-colors',
                game.matched && 'text-muted-foreground hover:text-foreground',
              )}
            >
              {game.matched ? (
                'Change Match'
              ) : (
                <>
                  <Search className="h-3 w-3 mr-1" />
                  Match Game
                </>
              )}
            </DkButton>
          </div>
        </div>

        {/* Inline matching drawer */}
        {isMatchingOpen && (
          <InlineMatchSearch
            game={game}
            onSelectCandidate={onMatch}
            onCancel={onToggleMatching}
            isMatching={isMatchingPending}
          />
        )}
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

export const ViewScannedGamesModal = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  isExiting,
  nodeId,
  nodeName = 'Node',
}: ViewScannedGamesModalProps) => {
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting
  const handleClose = () => {
    onOpenChange?.(false)
    onClose?.()
  }

  const queryClient = useQueryClient()
  const { toast } = useOptionalToast()
  const matching = useMatchingProgress()

  const [games, setGames] = useState<ScannedGameItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ScannedFilterTab>('all')
  const [activeMatchingId, setActiveMatchingId] = useState<string | number | null>(null)
  const [matchingPending, setMatchingPending] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const loadGames = useCallback(() => {
    setLoading(true)
    fetchScannedGamesList(nodeId)
      .then((items) => {
        setGames(items)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [nodeId])

  useEffect(() => {
    if (!isModalOpen) return
    loadGames()
  }, [isModalOpen, loadGames])

  // Listen to external games updates / background matching commit
  useEffect(() => {
    if (!isModalOpen || typeof window === 'undefined') return
    const onScannedUpdated = () => {
      loadGames()
    }
    window.addEventListener('scanned-games-updated', onScannedUpdated)

    const api = getDesktopAPI() ?? (window as any).desktopAPI
    const unsubDb = api?.onGamesDbChanged?.(() => {
      loadGames()
    })

    return () => {
      window.removeEventListener('scanned-games-updated', onScannedUpdated)
      unsubDb?.()
    }
  }, [isModalOpen, loadGames])

  const counts = useMemo(() => computeScannedGamesCounts(games), [games])
  const filteredGames = useMemo(
    () => filterScannedGames(games, filter, search),
    [games, filter, search],
  )

  // Reset pagination when filter or search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filter, search])

  const paginatedGames = useMemo(
    () => filteredGames.slice(0, visibleCount),
    [filteredGames, visibleCount],
  )

  const handleMatchCandidate = async (game: ScannedGameItem, candidate: CatalogCandidate) => {
    setMatchingPending(true)
    try {
      const updated = await matchScannedGameItem(game, candidate)
      setGames((prev) =>
        prev.map((item) => (item.id === game.id ? updated : item)),
      )
      toast({
        title: 'Game matched',
        description: `Matched "${candidate.title}" successfully.`,
        variant: 'success',
      })
      setActiveMatchingId(null)
      void queryClient.invalidateQueries({ queryKey: ['local-games'] })
      void queryClient.invalidateQueries({ queryKey: ['server-games'] })
      void queryClient.invalidateQueries({ queryKey: ['game-matches'] })
    } catch {
      toast({
        title: 'Match failed',
        description: `Could not match "${candidate.title}".`,
        variant: 'error',
      })
    } finally {
      setMatchingPending(false)
    }
  }

  const handleStartMatchAll = async () => {
    try {
      await matching.startMatching({ rematchAll: true })
      toast({
        title: 'Matching started',
        description: 'Running catalog matching in the background…',
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Match failed to start',
        description: err?.message || 'Could not start background matching.',
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      title={`Scanned Games — ${nodeName}`}
      description="Browse indexed game libraries and disk images discovered on this node with full catalog artwork."
      className="max-w-4xl max-h-[90vh] flex flex-col"
    >
      <div className="flex flex-col gap-3.5 pt-2 min-h-0 flex-1">
        {/* Dedicated Matching Progress Card if active */}
        <MatchingProgressCard
          data={matching}
          onCancel={matching.cancelMatching}
        />

        {/* Search, Filter Tabs & Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scanned titles, formats, or paths…"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
            {(
              [
                { tab: 'all', label: `All (${counts.all})` },
                { tab: 'matched', label: `Matched (${counts.matched})` },
                { tab: 'unmatched', label: `Unmatched (${counts.unmatched})` },
                { tab: 'iso', label: `ISOs (${counts.iso})` },
              ] as const
            ).map(({ tab, label }) => {
              const active = filter === tab
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                  )}
                >
                  {label}
                </button>
              )
            })}

            {/* Run Catalog Matching Action */}
            <DkButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartMatchAll}
              disabled={matching.isMatching}
              className="h-7 px-2.5 text-xs bg-[var(--dk-surface-base)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
              title="Run catalog matcher on all unmatched games"
            >
              <Sparkles className="h-3 w-3 mr-1 text-primary" />
              <span>Match All</span>
            </DkButton>

            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadGames}
              loading={loading}
              title="Refresh scanned games"
              className="h-7 w-7 p-0 shrink-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </DkButton>
          </div>
        </div>

        {/* Scanned Games List Content */}
        <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[300px] max-h-[55vh] pr-1 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs">Loading scanned games…</span>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-muted-foreground p-6 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              {search ? (
                <>
                  <Search className="h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs">No scanned games matched &ldquo;{search}&rdquo;.</p>
                </>
              ) : filter === 'unmatched' ? (
                <>
                  <Sparkles className="h-7 w-7 text-primary/60 mb-1" />
                  <p className="text-sm font-semibold text-foreground">All Games Matched!</p>
                  <p className="text-xs max-w-sm">
                    Every title indexed from this node has been matched with catalog metadata.
                  </p>
                </>
              ) : (
                <>
                  <Gamepad2 className="h-8 w-8 text-primary/40 mb-1" />
                  <p className="text-sm font-semibold text-foreground">No Games Indexed Yet</p>
                  <p className="text-xs max-w-sm">
                    Configure your monitored library paths and click &ldquo;Scan Now&rdquo; to populate games from this node.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {paginatedGames.map((game) => (
                <ScannedGameCard
                  key={`${game.id}-${game.path}`}
                  game={game}
                  isMatchingOpen={activeMatchingId === game.id}
                  onToggleMatching={() =>
                    setActiveMatchingId((curr) => (curr === game.id ? null : game.id))
                  }
                  onMatch={(candidate) => handleMatchCandidate(game, candidate)}
                  isMatchingPending={matchingPending}
                />
              ))}

              {visibleCount < filteredGames.length && (
                <div className="flex justify-center pt-2 pb-1">
                  <DkButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span>
                      Load More ({visibleCount} of {filteredGames.length} shown)
                    </span>
                  </DkButton>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] shrink-0 text-xs text-muted-foreground">
          <span>
            {Math.min(visibleCount, filteredGames.length)} of {filteredGames.length} games displayed
            {filteredGames.length !== games.length && ` (filtered from ${games.length} total)`}
          </span>
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            className="text-xs h-7 px-3"
          >
            Close
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
