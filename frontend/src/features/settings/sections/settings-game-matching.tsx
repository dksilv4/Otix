import { useState, useCallback, useMemo, useEffect } from 'react'
import { Search, Loader2, Gamepad2 } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { useMatchLocalGames, useSyncLocalGames } from '@/old-features/game-scanner/queries'
import { useClaimGame, useUnclaimGame } from '@/old-features/library/library-queries'
import { acceptSuggestionOnServer, rejectSuggestionOnServer, fetchGames } from '@/old-features/game-scanner/storage'
import { GameRow } from '../components/molecules/settings-game-row'
import { MatchDetailPanel } from '../components/organisms/settings-match-detail-panel'
import { CandidateReviewModal } from '../components/organisms/settings-candidate-review-modal'
import { useModal } from '@/lib/modals'
import { isDesktop } from '@/lib/desktop/api'

type FilterTab = 'all' | 'matched' | 'unmatched' | 'suggested'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched' },
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'suggested', label: 'Suggested' },
]

export function GameMatchingSection() {
  const { data: allGames = [], isLoading, refetch } = useLocalGames()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const claimMutation = useClaimGame()

  // Refresh when plugin scan saves games
  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener('scanned-games-updated', handler)
    return () => window.removeEventListener('scanned-games-updated', handler)
  }, [refetch])
  const unclaimMutation = useUnclaimGame()

  const { openModal } = useModal()
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const handleGameClick = useCallback((game: LocalGame) => {
    setSelectedGameId(game.id)
    // Open candidate review modal for games with suggestions or matches
    const close = openModal(
      <CandidateReviewModal
        game={game}
        onClose={() => close()}
        onMatchResolved={() => refetch()}
      />
    )
  }, [openModal, refetch])

  const filteredGames = useMemo(() => {
    let games = allGames
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      games = games.filter((g) => g.title.toLowerCase().includes(q))
    }
    // Status filter
    switch (filterTab) {
      case 'matched':
        return games.filter((g) => g.data?.id || g.otixMediaId)
      case 'unmatched':
        return games.filter((g) => !g.data?.id && !g.otixMediaId && !g.otixMatchSuggestion)
      case 'suggested':
        return games.filter((g) => g.otixMatchSuggestion)
      default:
        return games
    }
  }, [allGames, filterTab, searchQuery])

  const selectedGame = useMemo(
    () => allGames.find((g) => g.id === selectedGameId) ?? null,
    [allGames, selectedGameId],
  )

  // Refresh games from DB
  const refreshGames = useCallback(async () => {
    await fetchGames()
    refetch()
  }, [refetch])

  // Accept a suggestion
  const handleAccept = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion) return
    setAccepting(true)
    try {
      const suggestion = game.otixMatchSuggestion
      await acceptSuggestionOnServer(game.id, suggestion as unknown as Record<string, unknown>)
      // Claim on backend
      if (suggestion.id) {
        claimMutation.mutate({ mediaType: 'game', mediaId: suggestion.id })
      }
      await refreshGames()
    } catch (err) {
      console.error('Accept failed:', err)
    } finally {
      setAccepting(false)
    }
  }, [claimMutation, refreshGames])

  // Reject a suggestion
  const handleReject = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion?.id) return
    setRejecting(true)
    try {
      await rejectSuggestionOnServer(game.id, game.otixMatchSuggestion.id)
      await refreshGames()
    } catch (err) {
      console.error('Reject failed:', err)
    } finally {
      setRejecting(false)
    }
  }, [refreshGames])

  // Unmatch a game
  const handleUnmatch = useCallback(async (game: LocalGame) => {
    const mediaId = game.data?.id || game.otixMediaId
    if (!game.id) return
    try {
      const api = (await import('@/lib/desktop/api')).getDesktopAPI()
      if (api) {
        await api.unmatchGame(game.id)
      }
      // Unclaim on backend if we have the media ID
      if (mediaId) {
        unclaimMutation.mutate({ mediaType: 'game', mediaId })
      }
      await refreshGames()
    } catch (err) {
      console.error('Unmatch failed:', err)
    }
  }, [unclaimMutation, refreshGames])

  // Manual match
  const handleManualMatch = useCallback(async (game: LocalGame, media: { id: string; title: string; posterUrl?: string | null }) => {
    try {
      await acceptSuggestionOnServer(game.id, media as unknown as Record<string, unknown>)
      claimMutation.mutate({ mediaType: 'game', mediaId: media.id })
      await refreshGames()
    } catch (err) {
      console.error('Manual match failed:', err)
    }
  }, [claimMutation, refreshGames])

  if (!isDesktop()) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <p className="text-sm font-medium text-white">Desktop Only</p>
        <p className="text-xs text-white/60 mt-1">Matching is only available in the desktop app.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (allGames.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <p className="text-sm font-medium text-white">No Games Found</p>
        <p className="text-xs text-white/60 mt-1">
          Scan your library first to discover installed games.
        </p>
      </div>
    )
  }

  const stats = {
    total: allGames.length,
    matched: allGames.filter((g) => g.data?.id || g.otixMediaId).length,
    unmatched: allGames.filter((g) => !g.data?.id && !g.otixMediaId && !g.otixMatchSuggestion).length,
    suggested: allGames.filter((g) => g.otixMatchSuggestion).length,
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-white/50">
        <span>{stats.total} total</span>
        <span className="text-green-400/70">{stats.matched} matched</span>
        {stats.suggested > 0 && <span className="text-blue-400/70">{stats.suggested} suggested</span>}
        {stats.unmatched > 0 && <span className="text-white/30">{stats.unmatched} unmatched</span>}
      </div>

      {/* Filter + search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter games..."
            className="w-full h-8 rounded-lg bg-white/5 pl-8 pr-3 text-xs outline-none text-white/70 placeholder:text-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] transition-shadow"
          />
        </div>
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setFilterTab(tab.id); setSelectedGameId(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split layout */}
      <div className="flex gap-4 min-h-[500px]">
        {/* Game list - left */}
        <div className="w-[40%] shrink-0 space-y-0.5 overflow-y-auto max-h-[600px] pr-1">
          {filteredGames.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-white/30">
              {searchQuery ? 'No games match your search' : 'No games in this filter'}
            </div>
          ) : (
            filteredGames.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                selected={selectedGame?.id === g.id}
                onClick={handleGameClick}
              />
            ))
          )}
        </div>

        {/* Detail panel - right */}
        <div className="flex-1 rounded-2xl p-5 bg-white/5 overflow-y-auto max-h-[600px]">
          <MatchDetailPanel
            game={selectedGame}
            onAccept={handleAccept}
            onReject={handleReject}
            onUnmatch={handleUnmatch}
            onManualMatch={handleManualMatch}
            accepting={accepting}
            rejecting={rejecting}
          />
        </div>
      </div>
    </div>
  )
}
