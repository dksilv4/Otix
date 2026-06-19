import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Gamepad2, Search, Package, Layers, Wrench, HelpCircle } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { acceptSuggestionOnServer, rejectSuggestionOnServer, fetchGames } from '@/old-features/game-scanner/storage'
import { GameRow } from '../components/game-row'
import { MatchDetailPanel } from '../components/match-detail-panel'
import type { LocalGame } from '@/old-features/games/types'

type FilterTab = 'all' | 'game' | 'software' | 'addon' | 'tool'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Games' },
  { id: 'software', label: 'Software' },
  { id: 'addon', label: 'DLC' },
  { id: 'tool', label: 'Tools' },
]

function getEpicSource(g: LocalGame): Record<string, unknown> | null {
  if (!g.sources) return null
  for (const s of g.sources) {
    if (typeof s === 'object' && s !== null && (s as any).source === 'epic') {
      return s as Record<string, unknown>
    }
  }
  return null
}

function getContentType(g: LocalGame): string {
  const src = getEpicSource(g)
  return (src?.contentType as string) || 'unknown'
}

const CONTENT_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  game: { label: 'Game', color: 'text-emerald-400 bg-emerald-500/10' },
  software: { label: 'Software', color: 'text-blue-400 bg-blue-500/10' },
  addon: { label: 'DLC', color: 'text-purple-400 bg-purple-500/10' },
  tool: { label: 'Tool', color: 'text-amber-400 bg-amber-500/10' },
  unknown: { label: 'Other', color: 'text-white/40 bg-white/5' },
}

export function EpicLibrarySection() {
  const [games, setGames] = useState<LocalGame[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const desktopAPI = getDesktopAPI()

  const loadGames = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all games, filter by epic platform
      await fetchGames()
      const allGames = desktopAPI
        ? await desktopAPI.getScannedGamesFiltered({ platform: ['epic'] })
        : []
      // The response might not be filtered server-side, so do a client-side check too
      const epicGames = allGames.filter(g => g.platform === 'epic' || getEpicSource(g))
      setGames(epicGames)
    } catch (err) {
      console.error('[EpicLibrary] failed to load games:', err)
    } finally {
      setLoading(false)
    }
  }, [desktopAPI])

  useEffect(() => {
    if (desktopAPI) loadGames()
    // Refresh on DB changes
    const unsub = desktopAPI?.onGamesDbChanged?.(() => loadGames())
    return () => unsub?.()
  }, [desktopAPI, loadGames])

  // Listen for games-db:changed event
  useEffect(() => {
    const handler = () => loadGames()
    if (desktopAPI?.onGamesDbChanged) {
      const unsub = desktopAPI.onGamesDbChanged(handler)
      return () => unsub()
    }
  }, [desktopAPI, loadGames])

  const selectedGame = useMemo(
    () => games.find(g => g.id === selectedGameId) ?? null,
    [games, selectedGameId],
  )

  const filteredGames = useMemo(() => {
    let result = games
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(g => g.title.toLowerCase().includes(q))
    }
    if (filterTab !== 'all') {
      result = result.filter(g => getContentType(g) === filterTab)
    }
    return result
  }, [games, searchQuery, filterTab])

  const [unmatchingAll, setUnmatchingAll] = useState(false)

  const handleUnmatchAll = useCallback(async () => {
    if (!desktopAPI) return
    setUnmatchingAll(true)
    try {
      const matched = games.filter(g => g.data?.id || g.otixMediaId)
      for (const game of matched) {
        await desktopAPI.acceptSuggestion(game.id, null)
      }
      await loadGames()
    } catch (err) {
      console.error('Unmatch all failed:', err)
    } finally {
      setUnmatchingAll(false)
    }
  }, [desktopAPI, games, loadGames])

  const stats = useMemo(() => {
    const matched = games.filter(g => g.data?.id || g.otixMediaId).length
    return { total: games.length, matched, unmatched: games.length - matched }
  }, [games])

  const handleAccept = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion) return
    setAccepting(true)
    try {
      await acceptSuggestionOnServer(game.id, game.otixMatchSuggestion as unknown as Record<string, unknown>)
      await loadGames()
    } catch (err) {
      console.error('Accept failed:', err)
    } finally {
      setAccepting(false)
    }
  }, [loadGames])

  const handleReject = useCallback(async (game: LocalGame) => {
    if (!game.otixMatchSuggestion) return
    setRejecting(true)
    try {
      await rejectSuggestionOnServer(game.id, (game.otixMatchSuggestion as any).id)
      await loadGames()
    } catch (err) {
      console.error('Reject failed:', err)
    } finally {
      setRejecting(false)
    }
  }, [loadGames])

  const handleUnmatch = useCallback(async (game: LocalGame) => {
    if (!desktopAPI) return
    try {
      await desktopAPI.acceptSuggestion(game.id, null)
      await loadGames()
    } catch (err) {
      console.error('Unmatch failed:', err)
    }
  }, [desktopAPI, loadGames])

  const handleManualMatch = useCallback(async (game: LocalGame, media: { id: string; title: string; slug?: string }) => {
    try {
      await acceptSuggestionOnServer(game.id, {
        id: media.id,
        title: media.title,
        slug: media.slug || media.id,
        mediaType: 'game',
      })
      await loadGames()
    } catch (err) {
      console.error('Manual match failed:', err)
    }
  }, [loadGames])

  if (!desktopAPI) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-white/40">
        <Gamepad2 className="h-5 w-5 mr-2" />
        Epic Library requires the desktop app.
      </div>
    )
  }

  return (
    <div className="space-y-6 min-h-full">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white">Epic Games Library</h2>
        <p className="text-sm text-white/50 mt-1">
          {stats.total} games &middot; {stats.matched} matched &middot; {stats.unmatched} unmatched
          {stats.matched > 0 && (
            <button
              onClick={handleUnmatchAll}
              disabled={unmatchingAll}
              className='inline-flex items-center gap-1.5 h-7 rounded-lg px-2.5 text-[0.625rem] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50 mt-2'
            >
              {unmatchingAll ? 'Unmatching...' : 'Unmatch All'} ({stats.matched})
            </button>
          )}
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {FILTER_TABS.map(tab => {
            const count = tab.id === 'all'
              ? games.length
              : games.filter(g => getContentType(g) === tab.id).length
            return (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium transition-colors shrink-0 ${
                  filterTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                }`}
              >
                {tab.label}
                <span className="text-white/30 text-[0.625rem]">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search games..."
            className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-3 text-sm text-white outline-none shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow placeholder:text-white/30 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <HelpCircle className="h-10 w-10 text-white/20 mb-3" />
          <p className="text-sm text-white/40">
            {games.length === 0
              ? 'No Epic games found. Sync your Epic Games library from the Plugins section.'
              : 'No games match this filter.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Game list */}
          <div className="flex-1 min-w-0 space-y-2">
            {filteredGames.map(game => {
              const badge = CONTENT_TYPE_BADGES[getContentType(game)] || CONTENT_TYPE_BADGES.unknown
              return (
                <button
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={`w-full text-left rounded-xl p-3 transition-colors ${
                    selectedGameId === game.id ? 'bg-white/10' : 'hover:bg-white/5 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Cover */}
                    <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-white/5">
                      {game.posterUrl ? (
                        <img src={game.posterUrl} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : game.iconUrl ? (
                        <img src={game.iconUrl} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gamepad2 className="h-5 w-5 text-white/20" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{game.title}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.625rem] font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                        {(game.data?.id || game.otixMediaId) && (
                          <span className="inline-flex items-center gap-1 text-[0.625rem] text-green-400 bg-green-500/10 rounded-full px-1.5 py-0.5">
                            Matched
                          </span>
                        )}
                      </div>
                      {(() => {
                        const src = getEpicSource(game)
                        return src?.developer ? (
                          <p className="text-xs text-white/40 truncate mt-0.5">{String(src.developer)}</p>
                        ) : null
                      })()}
                      {(game.data?.id || game.otixMediaId) && (
                        <p className="text-xs text-white/30 mt-0.5 truncate">
                          {game.data?.title || game.otixMediaTitle || 'Unknown match'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Match detail panel */}
          {selectedGame && (
            <div className="lg:w-80 shrink-0">
              <MatchDetailPanel
                game={selectedGame}
                onAccept={handleAccept}
                onReject={handleReject}
                onUnmatch={handleUnmatch}
                accepting={accepting}
                rejecting={rejecting}
                onManualMatch={(media) => handleManualMatch(selectedGame, media)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
