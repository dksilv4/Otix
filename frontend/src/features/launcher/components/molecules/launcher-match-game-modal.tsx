/* ── MatchGameModal — full match flow with results, search, accept ── */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search, Loader2, Check, Sparkles, Gamepad2, RefreshCw, Import } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useGameSearch, resolveCatalogGame } from '@/features/launcher/data/queries'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/launcher/data/game-queries'
import { localGameKeys } from '@/features/launcher/data/game-queries'
import { useServerGames, serverKeys } from '@/features/downloads/use-server-downloads'
import { matchServerGameFile } from '@/features/downloads/server-availability'
import { DkDialog } from '@ui/molecules/dialog'
import { PLATFORM_LABELS } from '@/constants/games'
import type { LocalGame, CatalogGame, Game } from '@/features/launcher/types'

// ── Modal step enum ──────────────────────────────────────────────

type ModalStep =
  | 'matching'      // spinner — calling match API
  | 'matched'       // high confidence result shown
  | 'suggestion'    // medium confidence, needs user decision
  | 'no-match'      // no confident match, show search
  | 'accepting'     // saving match to server
  | 'done'          // brief success state before close

// ── Props ────────────────────────────────────────────────────────

interface Props {
  game: LocalGame
  onClose: () => void
  isExiting?: boolean
}

// ── Component ────────────────────────────────────────────────────

export function MatchGameModal({ game, onClose, isExiting }: Props) {
  const queryClient = useQueryClient()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const { data: serverGamesData, refetch: refetchServerGames } = useServerGames()

  const syncToNodeServer = useCallback(async (mediaId: string, confidence = 1.0) => {
    const matchingServer = matchServerGameFile(
      serverGamesData?.files,
      mediaId,
      game.title,
    )
    const serverId = game.serverId ?? matchingServer?.serverId
    const fileId = game.serverFileId ?? matchingServer?.fileId
    const filepath = game.serverFilePath ?? matchingServer?.filepath ?? matchingServer?.relativePath

    if (serverId) {
      try {
        await apiClient.post(`/library/servers/${serverId}/otix/match`, {
          mediaId,
          fileId,
          filepath,
          confidence,
        })
        refetchServerGames().catch(() => {})
        queryClient.invalidateQueries({ queryKey: serverKeys.games() })
      } catch (serverErr) {
        console.warn('[MatchGameModal] Node sidecar sync failed:', serverErr)
      }
    }
  }, [game.serverId, game.serverFileId, game.serverFilePath, game.title, queryClient, refetchServerGames, serverGamesData?.files])

  const [step, setStep] = useState<ModalStep>('matching')
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  }, [step])
  const isSaving = step === 'accepting'
  const [matchConfidence, setMatchConfidence] = useState(0)
  const [matchedId, setMatchedId] = useState<string | null>(null)
  const [matchedTitle, setMatchedTitle] = useState('')
  const [matchedSlug, setMatchedSlug] = useState('')
  const [matchedPoster, setMatchedPoster] = useState<string | null>(null)
  const [matchedBackdrop, setMatchedBackdrop] = useState<string | null>(null)
  const [matchedTextlessPoster, setMatchedTextlessPoster] = useState<string | null>(null)
  const [matchedIcon, setMatchedIcon] = useState<string | null>(null)
  const [matchedLogo, setMatchedLogo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: searchData, isLoading: searchLoading, isError: searchError } = useGameSearch(debouncedQuery)
  const searchResults = searchData?.items
  const backfillPending = Boolean(searchData?.backfillPending)

  // ── Debounce search ──
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // ── Process match result (shared between initial + retry) ──
  const processMatchResult = useCallback((results: LocalGame[]) => {
    const r = results[0]
    if (!r) { setStep('no-match'); return }

    // High confidence — mutation set data with full catalog info
    if (r.data?.id) {
      const d = r.data
      setMatchedId(d.id)
      setMatchedTitle(d.title || r.title)
      setMatchedSlug(d.slug || '')
      setMatchedPoster(d.posterUrl ?? null)
      setMatchedBackdrop(d.backdropUrl ?? null)
      setMatchedTextlessPoster(d.textlessPosterUrl ?? null)
      setMatchedLogo(d.logoUrl ?? null)
      setMatchedIcon(d.iconUrl ?? null)
      setMatchConfidence(d.confidence ?? 0)
      setStep('matched')
      return
    }

    // Medium confidence — mutation set matchSuggestion
    if (r.matchSuggestion?.id) {
      const s = r.matchSuggestion
      setMatchedId(s.id)
      setMatchedTitle(s.title || '')
      setMatchedSlug(s.slug || '')
      setMatchedPoster(s.posterUrl ?? null)
      setMatchedBackdrop(s.backdropUrl ?? null)
      setMatchedTextlessPoster(s.textlessPosterUrl ?? null)
      setMatchedLogo(s.logoUrl ?? null)
      setMatchedIcon(s.iconUrl ?? null)
      setMatchConfidence(s.confidence ?? 0)
      setStep('suggestion')
      return
    }

    // No match
    setStep('no-match')
  }, [])

  // ── Build sync-ready game from current match state ──
  const buildSyncedGame = useCallback((id: string, title: string, slug?: string): LocalGame => ({
    ...game,
    data: {
      id,
      mediaId: id,
      title,
      slug: slug || matchedSlug || '',
      posterUrl: matchedPoster,
      backdropUrl: matchedBackdrop,
      textlessPosterUrl: matchedTextlessPoster,
      iconUrl: matchedIcon,
      logoUrl: matchedLogo,
    } as Game,
  }), [game, matchedSlug, matchedPoster, matchedBackdrop, matchedTextlessPoster, matchedIcon, matchedLogo])

  // ── Reset state on mount ──
  useEffect(() => {
    setStep('no-match')
    setMatchConfidence(0)
    setMatchedId(null)
    setMatchedTitle('')
    setMatchedSlug('')
    setMatchedPoster(null)
    setMatchedBackdrop(null)
    setMatchedTextlessPoster(null)
    setMatchedIcon(null)
    setMatchedLogo(null)
    setError(null)
    // Pre-populate search with game title so catalog results show immediately
    setSearchQuery(game.title)
    setDebouncedQuery(game.title)
  }, [game.title])

  // ── Background match — runs after modal opens, upgrades to match card if found ──
  useEffect(() => {
    let cancelled = false

    matchMutation.mutateAsync([game]).then((results) => {
      if (cancelled) return
      processMatchResult(results)
    }).catch((err) => {
      if (cancelled) return
      // Non-blocking — search is already showing, auto-match failure is fine
      console.warn('[MatchGameModal] Background match failed, search still available:', err)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Accept current match ──
  const handleAccept = useCallback(async () => {
    if (!matchedId) return
    setStep('accepting')
    const synced = buildSyncedGame(matchedId, matchedTitle)
    try {
      try {
        await syncMutation.mutateAsync([synced])
      } catch (err) {
        console.warn('[MatchGameModal] Backend sync failed, saving match locally:', err)
      }

      await syncToNodeServer(matchedId, matchConfidence || 1.0)

      const api = getDesktopAPI()
      if (api?.acceptSuggestion) {
        await api.acceptSuggestion(game.id, {
          id: matchedId,
          title: matchedTitle,
          slug: matchedSlug,
          posterUrl: matchedPoster,
          backdropUrl: matchedBackdrop,
          textlessPosterUrl: matchedTextlessPoster,
          logoUrl: matchedLogo,
          iconUrl: matchedIcon,
        } as Record<string, unknown>)
      }

      // 3. Direct cache write — UI updates instantly
      queryClient.setQueryData(localGameKeys.detail(game.id), (old: LocalGame | undefined) => {
        const base = old || game
        return {
          ...base,
          title: matchedTitle || base.title,
          otixMediaId: matchedId,
          otixMediaTitle: matchedTitle,
          data: synced.data,
          matchSuggestion: undefined,
        }
      })
      queryClient.setQueriesData({ queryKey: ['local-games', 'list'] }, (old: LocalGame[] | undefined) => {
        if (!old) return old
        const next = {
          ...(old.find((item) => item.id === game.id) || game),
          title: matchedTitle || game.title,
          otixMediaId: matchedId,
          otixMediaTitle: matchedTitle,
          data: synced.data,
          matchSuggestion: undefined,
        }
        if (old.some((item) => item.id === game.id)) {
          return old.map((item) => (item.id === game.id ? next : item))
        }
        return [...old, next]
      })

      // 4. Stable mapping — survives local game re-fetches from desktop DB
      queryClient.setQueryData(['otix-game-map', game.id], matchedId)

      setStep('done')
      setTimeout(() => onClose(), 600)
    } catch (err) {
      console.error('[MatchGameModal] Sync failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save match')
      setStep('no-match')
    }
  }, [matchedId, matchedTitle, matchedSlug, matchedPoster, matchedBackdrop, matchedTextlessPoster, matchedIcon, matchedLogo, matchConfidence, buildSyncedGame, syncMutation, syncToNodeServer, queryClient, onClose, game.id])

  // ── Accept search result as match ──
  const handleSelectSearchResult = useCallback(async (result: CatalogGame) => {
    setStep('accepting')
    try {
      const catalog = await resolveCatalogGame(result)
      const { id, title, slug, posterUrl, iconUrl } = catalog
      try {
        await syncMutation.mutateAsync([buildSyncedGame(id, title, slug)])
      } catch (err) {
        console.warn('[MatchGameModal] Backend sync failed, saving match locally:', err)
      }

      await syncToNodeServer(id, 1.0)

      const api = getDesktopAPI()
      if (api?.acceptSuggestion) {
        await api.acceptSuggestion(game.id, {
          id,
          title,
          slug: slug || '',
          posterUrl: posterUrl ?? null,
          iconUrl: iconUrl ?? null,
        } as Record<string, unknown>)
      }

      // 3. Direct cache write — use result data (no stale deps)
      queryClient.setQueryData(localGameKeys.detail(game.id), (old: LocalGame | undefined) => {
        const base = old || game
        const data = {
          id,
          title,
          slug: slug || '',
          posterUrl: posterUrl ?? null,
          iconUrl: iconUrl ?? null,
        } as Game
        return {
          ...base,
          title: title || base.title,
          otixMediaId: id,
          otixMediaTitle: title,
          data,
          matchSuggestion: undefined,
        }
      })
      queryClient.setQueriesData({ queryKey: ['local-games', 'list'] }, (old: LocalGame[] | undefined) => {
        if (!old) return old
        const data = {
          id,
          title,
          slug: slug || '',
          posterUrl: posterUrl ?? null,
          iconUrl: iconUrl ?? null,
        } as Game
        const next = {
          ...(old.find((item) => item.id === game.id) || game),
          title: title || game.title,
          otixMediaId: id,
          otixMediaTitle: title,
          data,
          matchSuggestion: undefined,
        }
        if (old.some((item) => item.id === game.id)) {
          return old.map((item) => (item.id === game.id ? next : item))
        }
        return [...old, next]
      })

      // 4. Stable mapping — survives local game re-fetches from desktop DB
      queryClient.setQueryData(['otix-game-map', game.id], id)

      setStep('done')
      setTimeout(() => onClose(), 600)
    } catch (err) {
      console.error('[MatchGameModal] Search match sync failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save match')
      setStep('no-match')
    }
  }, [buildSyncedGame, syncMutation, syncToNodeServer, queryClient, onClose, game.id])

  // ── Re-try matching ──
  const handleRetry = useCallback(() => {
    setStep('matching')
    setError(null)
    matchMutation.mutateAsync([game]).then((results) => {
      processMatchResult(results)
    }).catch((err) => {
      console.error('[MatchGameModal] Retry failed:', err)
      setError(err instanceof Error ? err.message : 'Match request failed')
      setStep('no-match')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, processMatchResult])

  // ── Wrapped open change — guards close during accepting ──
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next && stepRef.current === 'accepting') return
    onClose()
  }, [onClose])

  const platformLabel = PLATFORM_LABELS[game.platform] || game.platform.toUpperCase()

  const confidenceColor =
    matchConfidence >= 0.9 ? 'text-green-400' :
    matchConfidence >= 0.7 ? 'text-yellow-400' :
    matchConfidence >= 0.5 ? 'text-orange-400' :
    'text-red-400'

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={handleOpenChange}
      className="w-full max-w-lg bg-[#0e0e12] border border-white/[0.06] shadow-2xl"
    >
      {/* Custom header with icon */}
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.04]">
        <Sparkles size={16} className="text-yellow-500" />
        <h2 className="text-sm font-bold text-white">Match to Catalog</h2>
      </div>
      <div className="space-y-4">

        {/* ── Game info card ── */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
            {game.iconUrl ? (
              <img src={game.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Gamepad2 size={18} className="text-white/30" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{game.title}</p>
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-white/5 text-white/50">
              {platformLabel}
            </span>
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
            <button onClick={handleRetry} className="ml-2 underline hover:text-red-300">
              Retry
            </button>
          </div>
        )}

        {/* ── Matching spinner ── */}
        {step === 'matching' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 size={28} className="text-blue-400 animate-spin" />
            <p className="text-sm text-white/50">
              Searching catalog for <span className="text-white/80 font-medium">{game.title}</span>...
            </p>
          </div>
        )}

        {/* ── High-confidence match ── */}
        {step === 'matched' && matchedId && (
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Match Found</div>
            <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {matchedPoster && (
                <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-white/5">
                  <img src={matchedPoster} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                <p className="text-sm font-bold text-white truncate">{matchedTitle}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${confidenceColor}`}>
                    {Math.round(matchConfidence * 100)}% match
                  </span>
                  {matchConfidence >= 0.9 && (
                    <span className="flex items-center gap-1 text-[10px] text-green-400 font-semibold">
                      <Check size={10} /> Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleAccept}
              disabled={isSaving}
              className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/50 text-white text-[11px] font-black flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
            >
              {isSaving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                <><Check size={14} /> Confirm Match</>
              )}
            </button>
          </div>
        )}

        {/* ── Medium-confidence suggestion ── */}
        {step === 'suggestion' && matchedId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Suggested Match</span>
              <span className={`text-xs font-bold ${confidenceColor}`}>
                {Math.round(matchConfidence * 100)}% confidence
              </span>
            </div>
            <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-blue-500/20">
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                <p className="text-sm font-bold text-white">{matchedTitle}</p>
                <p className="text-xs text-white/50">Does {game.title} match this catalog entry?</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/50 text-white text-[11px] font-black flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                {isSaving ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={14} /> Yes, Match</>
                )}
              </button>
              <button
                onClick={() => setStep('no-match')}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 text-[11px] font-semibold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-30"
              >
                Not Right
              </button>
            </div>
          </div>
        )}

        {/* ── No match / Search ── */}
        {step === 'no-match' && (
          <div className="space-y-3">
            <div className="text-center py-4">
              <Gamepad2 size={32} className="mx-auto text-white/15 mb-2" />
              <p className="text-sm text-white/60">No confident match found.</p>
              <p className="text-xs text-white/30 mt-1">Search Otix; missing titles are filled in from IGDB.</p>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-white/30 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setDebouncedQuery('') }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Search results */}
            {searchLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={18} className="text-blue-400 animate-spin" />
              </div>
            )}

            {debouncedQuery && (backfillPending || searchResults?.some((result) => String(result.id).startsWith('igdb:'))) && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-500/10 text-[10px] text-blue-400">
                <Import className="h-3 w-3" />
                {backfillPending
                  ? 'Importing games from IGDB — new matches will appear shortly'
                  : 'Results from IGDB — matching imports them into Otix'}
              </div>
            )}

            {debouncedQuery && searchResults && searchResults.length > 0 && !searchLoading && (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    onClick={() => handleSelectSearchResult(result)}
                    disabled={isSaving}
                    className="flex items-center gap-3 w-full text-left p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div className="w-9 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                      {result.posterUrl ? (
                        <img src={result.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gamepad2 size={12} className="text-white/20" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white/90 truncate">{result.title}</p>
                      <p className="text-[10px] text-white/30 truncate">
                        {String(result.id).startsWith('igdb:') ? 'IGDB' : result.slug}
                      </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-blue-500/80 text-white text-[10px] font-bold shrink-0">
                      Match
                    </span>
                  </button>
                ))}
              </div>
            )}

            {debouncedQuery && searchResults?.length === 0 && !searchLoading && !searchError && !backfillPending && (
              <p className="text-xs text-white/30 text-center py-2">
                No catalog results for "{debouncedQuery}"
              </p>
            )}

            {debouncedQuery && searchError && !searchLoading && (
              <p className="text-xs text-red-400/70 text-center py-2">
                Search failed. Try again or type a different name.
                <button onClick={() => { setSearchQuery(''); setDebouncedQuery('') }} className="ml-1 underline hover:text-red-300">Clear</button>
              </p>
            )}

            {!debouncedQuery && !searchLoading && (
              <button
                onClick={handleRetry}
                className="w-full py-2 rounded-xl border border-white/5 hover:border-white/10 text-white/40 hover:text-white/60 text-[11px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw size={12} /> Re-match
              </button>
            )}
          </div>
        )}

        {/* ── Done state ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check size={20} className="text-green-400" />
            </div>
            <p className="text-sm font-semibold text-white">Game Matched!</p>
            <p className="text-xs text-white/50">&quot;{matchedTitle}&quot; linked to {game.title}</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="pt-3 mt-3 border-t border-white/[0.04] flex justify-end">
        <button
          onClick={() => handleOpenChange(false)}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-30"
        >
          {step === 'matched' || step === 'suggestion' ? 'Cancel' : 'Close'}
        </button>
      </div>
    </DkDialog>
  )
}

export { MatchGameModal as LauncherMatchGameModal }
export default MatchGameModal
