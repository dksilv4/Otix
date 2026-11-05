import { useState, useEffect, useCallback } from 'react'
import { Search, Gamepad2, Check, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useToast } from '@ui/molecules/toast'
import type { ScannedGameItem, CatalogCandidate } from '../../utils/scanned-summary'
import {
  searchCatalogGames,
  matchScannedGameItem,
  updateScannedGamePlatform,
} from '../../utils/scanned-summary'
import {
  GAME_PLATFORM_OPTIONS,
  normalizePlatformValue,
  resolvePlatformLabel,
} from '../../utils/node-scan-files'

export interface NodeFileMatchModalProps {
  open: boolean
  onClose: () => void
  game: ScannedGameItem | null
  onMatchSuccess?: (updatedGame: ScannedGameItem) => void
}

export const NodeFileMatchModal = ({
  open,
  onClose,
  game,
  onMatchSuccess,
}: NodeFileMatchModalProps) => {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [matchingCandId, setMatchingCandId] = useState<string | number | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<string>('pc')
  const [isSavingPlatform, setIsSavingPlatform] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const candidates = await searchCatalogGames(trimmed)
      setResults(candidates)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (open && game) {
      setQuery(game.title)
      const initialPlat = normalizePlatformValue(game.platform || resolvePlatformLabel(game))
      setSelectedPlatform(initialPlat)
      void handleSearch(game.title)
    } else {
      setResults([])
      setQuery('')
      setMatchingCandId(null)
    }
  }, [open, game, handleSearch])

  useEffect(() => {
    if (!open || !query.trim()) return
    const timer = setTimeout(() => {
      void handleSearch(query)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, open, handleSearch])

  const handleSelectCandidate = async (candidate: CatalogCandidate) => {
    if (!game) return
    setMatchingCandId(candidate.id)
    try {
      const updated = await matchScannedGameItem(game, candidate, selectedPlatform)
      toast({
        title: 'Match Saved',
        description: `Linked ${updated.title} (${resolvePlatformLabel(updated)}) to catalog.`,
        variant: 'success',
      })
      onMatchSuccess?.(updated)
      onClose()
    } catch (err: any) {
      toast({
        title: 'Match Failed',
        description: err?.message || 'Could not link game.',
        variant: 'error',
      })
    } finally {
      setMatchingCandId(null)
    }
  }

  const handleSavePlatformOnly = async () => {
    if (!game) return
    setIsSavingPlatform(true)
    try {
      const updated = await updateScannedGamePlatform(game, selectedPlatform)
      toast({
        title: 'Platform Updated',
        description: `Set platform to ${resolvePlatformLabel(updated)}.`,
        variant: 'success',
      })
      onMatchSuccess?.(updated)
      onClose()
    } catch (err: any) {
      toast({
        title: 'Update Failed',
        description: err?.message || 'Could not update platform.',
        variant: 'error',
      })
    } finally {
      setIsSavingPlatform(false)
    }
  }

  if (!game) return null

  const currentPlatformNorm = normalizePlatformValue(game.platform || resolvePlatformLabel(game))
  const hasPlatformChanged = selectedPlatform !== currentPlatformNorm

  // Other candidates: filter out the already-matched media ID if present
  const otherCandidates = results.filter((c) => String(c.id) !== String(game.mediaId))

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title={game.matched ? 'Edit Game Match' : 'Match Game with Catalog'}
      description={`Link catalog metadata for "${game.title}".`}
      className="max-w-xl"
    >
      <div className="space-y-4 pt-2">
        {/* ── 1. Existing Active Match Card (if matched) ── */}
        {game.matched && (
          <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-primary/20 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span>Current Active Match</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {game.confidence
                  ? `${Math.round(game.confidence <= 1 ? game.confidence * 100 : game.confidence)}% Match`
                  : 'Linked'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {game.posterUrl || game.iconUrl ? (
                <img
                  src={game.posterUrl || game.iconUrl || ''}
                  alt=""
                  className="h-12 w-9 rounded-lg object-cover shrink-0 bg-[var(--dk-surface-base)]"
                  loading="lazy"
                />
              ) : (
                <div className="h-12 w-9 rounded-lg bg-[var(--dk-surface-base)] flex items-center justify-center text-muted-foreground shrink-0">
                  <Gamepad2 className="h-5 w-5 opacity-40" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground truncate">
                  {game.title}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                  {game.releaseYear && <span>{game.releaseYear}</span>}
                  <span className="text-[9px] uppercase font-semibold px-1.5 py-0.2 rounded bg-[var(--dk-surface-base)] text-primary">
                    {resolvePlatformLabel(game)}
                  </span>
                  {game.format && (
                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.2 rounded bg-[var(--dk-surface-base)] text-muted-foreground">
                      {game.format}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/70 truncate mt-0.5">
                  {game.path}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Other Potential Matches Header & Search ── */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{game.matched ? 'Other Potential Matches' : 'Search Catalog Matches'}</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-normal">
              Source: Otix Cloud Catalog
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch(query)
              }}
              placeholder="Search by game title, ID, or slug..."
              className="w-full pl-9 pr-24 py-2 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04] text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40 transition-all"
            />
            <DkButton
              type="button"
              size="sm"
              variant="primary"
              onClick={() => void handleSearch(query)}
              disabled={searching}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 text-xs rounded-lg"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
            </DkButton>
          </div>
        </div>

        {/* ── 3. Potential Candidates List ── */}
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {searching ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Querying catalog candidates...</span>
            </div>
          ) : otherCandidates.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {query ? 'No additional matches found in catalog.' : 'Type a title above and press Search.'}
            </div>
          ) : (
            otherCandidates.map((candidate) => {
              const isSelected = matchingCandId === candidate.id
              return (
                <div
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {candidate.posterUrl ? (
                      <img
                        src={candidate.posterUrl}
                        alt=""
                        className="h-12 w-9 rounded-lg object-cover shrink-0 bg-[var(--dk-surface-base)]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-9 rounded-lg bg-[var(--dk-surface-base)] flex items-center justify-center text-muted-foreground shrink-0">
                        <Gamepad2 className="h-5 w-5 opacity-40" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {candidate.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
                        {candidate.slug && (
                          <span className="font-mono text-[10px] text-muted-foreground/70 truncate">
                            {candidate.slug}
                          </span>
                        )}
                      </div>
                      {candidate.overview && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                          {candidate.overview}
                        </p>
                      )}
                    </div>
                  </div>

                  <DkButton
                    type="button"
                    size="sm"
                    variant={game.matched ? 'secondary' : 'primary'}
                    disabled={isSelected}
                    onClick={() => void handleSelectCandidate(candidate)}
                    className="h-8 px-3 text-xs rounded-xl shrink-0"
                  >
                    {isSelected ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        <span>{game.matched ? 'Switch to This' : 'Select'}</span>
                      </span>
                    )}
                  </DkButton>
                </div>
              )
            })
          )}
        </div>

        {/* ── 4. Footer: Platform Selection Dropdown ── */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Gamepad2 className="h-3.5 w-3.5 text-primary" />
              <span>Platform:</span>
            </span>
            <DkDropdown
              label="Platform"
              options={GAME_PLATFORM_OPTIONS}
              value={selectedPlatform}
              onChange={(val) => setSelectedPlatform(val || 'pc')}
              variant="filter"
              className="min-w-[160px]"
            />
          </div>

          {game.matched && hasPlatformChanged && (
            <DkButton
              type="button"
              size="sm"
              variant="primary"
              disabled={isSavingPlatform}
              onClick={handleSavePlatformOnly}
              className="h-8 px-3 text-xs rounded-xl shrink-0"
            >
              {isSavingPlatform ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Save Platform'
              )}
            </DkButton>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
