import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Search, Gamepad2, Package, Layers, Wrench, HelpCircle, ChevronDown, ExternalLink } from 'lucide-react'
import { SlidePanel } from '@/lib/modals'
import { API_BASE_URL } from '@/lib/config'
import { ManualSearch } from './manual-search'
import { getDesktopAPI } from '@/lib/desktop/api'
import type { PluginAPI } from './PluginSettings'

interface EpicGame {
  id: string
  title: string
  developer: string
  contentType: string
  posterUrl: string | null
  logoUrl: string | null
  appName: string
  namespace: string
  catalogItemId: string
  platforms: string[]
  description: string
}

interface SearchResult {
  id: string
  title: string
  slug: string
  posterUrl?: string
  mediaType?: string
}

interface MatchState {
  gameId: string
  suggestion: SearchResult | null
  status: 'pending' | 'matched' | 'skipped' | 'searching' | 'no_match'
}

type FilterTab = 'all' | 'game' | 'software' | 'addon' | 'tool'

const FILTER_TABS: { id: FilterTab; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Games', icon: Gamepad2 },
  { id: 'software', label: 'Software', icon: Package },
  { id: 'addon', label: 'DLC', icon: Layers },
  { id: 'tool', label: 'Tools', icon: Wrench },
]

const CONTENT_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  game: { label: 'Game', color: 'text-emerald-400 bg-emerald-500/10' },
  software: { label: 'Software', color: 'text-blue-400 bg-blue-500/10' },
  addon: { label: 'DLC', color: 'text-purple-400 bg-purple-500/10' },
  tool: { label: 'Tool', color: 'text-amber-400 bg-amber-500/10' },
  unknown: { label: 'Other', color: 'text-white/40 bg-white/5' },
}

export function EpicMatchModal({
  games,
  pluginId,
  api,
  onClose,
}: {
  games: EpicGame[]
  pluginId: string
  api: PluginAPI
  onClose: () => void
}) {
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [matches, setMatches] = useState<Record<string, MatchState>>({})
  const [matching, setMatching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveTotal, setSaveTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [manuallySearching, setManuallySearching] = useState<string | null>(null)
  const desktopAPI = getDesktopAPI()

  // ── Filter ──
  const filteredGames = useMemo(() => {
    if (filterTab === 'all') return games
    return games.filter(g => g.contentType === filterTab)
  }, [games, filterTab])

  // ── Auto-match: batch query the centralized matching API ──
  useEffect(() => {
    const initial: Record<string, MatchState> = {}
    for (const g of games) initial[g.id] = { gameId: g.id, suggestion: null, status: 'pending' }
    setMatches(initial)

    let cancelled = false

    // Build batch request for all games
    const batchGames = games.map(g => ({
      title: g.title,
      developer: g.developer || undefined,
      platforms: g.platforms?.length ? g.platforms : undefined,
      external_ids: [{
        source: 'epic',
        id: g.appName || g.catalogItemId,
      }],
      media_type: 'game',
    }))

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      try {
        const apiBaseUrl = API_BASE_URL
        const token = localStorage.getItem('otix-access-token')

        const res = await fetch(apiBaseUrl + '/media/match/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({
            games: batchGames.map(g => ({
              title: g.title,
              developer: g.developer || null,
              external_ids: [{ source: 'epic', id: g.external_ids[0].id }],
              media_type: 'game',
            })),
          }),
        })

        if (!res.ok) {
          const errBody = await res.text();
          console.error('[EpicMatch] batch match failed:', res.status, errBody);
          throw new Error('Match API error: ' + res.status);
        }

        const data = await res.json()
        if (cancelled) return

        const results = data.matches || []
        console.log('[EpicMatch] batch results:', results.length, 'matches, sample:', results[0])
        for (let i = 0; i < games.length; i++) {
          const game = games[i]
          const match = results[i]

          if (game.contentType !== 'game' && game.contentType !== 'unknown') {
            setMatches(prev => ({
              ...prev,
              [game.id]: { gameId: game.id, suggestion: null, status: 'skipped' },
            }))
            continue
          }

          if (!match || match.confidence <= 0) {
            setMatches(prev => ({
              ...prev,
              [game.id]: { gameId: game.id, suggestion: null, status: 'no_match' },
            }))
            continue
          }

          setMatches(prev => ({
            ...prev,
            [game.id]: {
              gameId: game.id,
              suggestion: {
                id: match.media_item_id,
                title: match.title,
                slug: match.media_item_id || '',
                posterUrl: match.poster_url,
                mediaType: 'game',
              },
              status: 'matched',
            },
          }))
        }
        if (!cancelled) setMatching(false)
        console.log("[EpicMatch] matching complete,", stats.matched, "matched,", stats.searching, "searching")
      } catch (err) {
        console.error('[EpicMatch] batch match failed:', err)
        if (!cancelled) {
          setMatching(false)
          setError(err instanceof Error ? err.message : 'Match request failed')
          for (const game of games) {
            setMatches(prev => {
              if (prev[game.id]?.status === 'pending' || prev[game.id]?.status === 'searching') {
                return { ...prev, [game.id]: { gameId: game.id, suggestion: null, status: 'no_match' } }
              }
              return prev
            })
          }
        }
      }
    })()

    return () => { cancelled = true }
  }, [games])

  // ── Match controls ──
  const setSuggestion = useCallback((gameId: string, suggestion: SearchResult | null) => {
    setMatches(prev => ({
      ...prev,
      [gameId]: { gameId, suggestion, status: suggestion ? 'matched' : 'skipped' },
    }))
  }, [])

  const clearSuggestion = useCallback((gameId: string) => {
    setMatches(prev => ({
      ...prev,
      [gameId]: { gameId, suggestion: null, status: 'skipped' },
    }))
  }, [])

  // ── Stats ──
  const stats = useMemo(() => {
    const vals = Object.values(matches)
    return {
      matched: vals.filter(m => m.status === 'matched').length,
      searching: vals.filter(m => m.status === 'searching' || m.status === 'pending').length,
      skipped: vals.filter(m => m.status === 'skipped' || m.status === 'no_match').length,
      total: games.length,
    }
  }, [matches, games.length])

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!desktopAPI?.saveScannedGames) return
    setSaving(true)
    setError(null)

    const confirmed = games.filter(g => matches[g.id]?.status === 'matched')
    setSaveTotal(confirmed.length)
    setSaveProgress(0)

    try {
      // Step 1: Save all confirmed games to scanned games DB
      const localGames = confirmed.map(g => ({
        id: g.id,
        title: g.title,
        exePath: g.installDir || '',
        installDir: g.installDir || '',
        platform: 'epic' as const,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || undefined,
        sources: [{
          source: 'epic',
          appName: g.appName,
          namespace: g.namespace,
          catalogItemId: g.catalogItemId,
          developer: g.developer,
          contentType: g.contentType,
          platforms: g.platforms,
        }],
      }))
      await desktopAPI.saveScannedGames(localGames)

      // Step 2: Accept suggestions (link to Otix media)
      for (let i = 0; i < confirmed.length; i++) {
        const game = confirmed[i]
        const match = matches[game.id]
        if (!match?.suggestion) continue

        await desktopAPI.acceptSuggestion(game.id, {
          id: match.suggestion.id,
          title: match.suggestion.title,
          slug: match.suggestion.slug,
          mediaType: match.suggestion.mediaType || 'game',
        })
        setSaveProgress(i + 1)
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [games, matches, desktopAPI, onClose])

  // ── Manual search override ──
  const openManualSearch = (gameId: string) => setManuallySearching(gameId)

  return (
    <SlidePanel onClose={onClose} isExiting={false}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Match Epic Games</h2>
          <p className="text-sm text-white/50 mt-0.5">
            {matching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Matching {games.length} items...
              </span>
            ) : (
              `${games.length} items from Epic Games Library`
            )}
          </p>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 px-6 pb-4 overflow-x-auto">
        {FILTER_TABS.map(tab => {
          const Icon = tab.icon
          const count = tab.id === 'all' ? games.length : games.filter(g => g.contentType === tab.id).length
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
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {tab.label}
              <span className="text-white/30 text-[0.625rem]">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Scrollable game list — shows instantly, auto-matches stream in */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
        {filteredGames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <HelpCircle className="h-8 w-8 text-white/20 mb-2" />
            <p className="text-sm text-white/40">No items in this category</p>
          </div>
        )}

        {filteredGames.map(game => {
          const match = matches[game.id]
          const badge = CONTENT_TYPE_BADGES[game.contentType] || CONTENT_TYPE_BADGES.unknown
          const isMatched = match?.status === 'matched'

          return (
            <div
              key={game.id}
              className="rounded-xl p-3 transition-colors"
              style={{
                backgroundColor: isMatched ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isMatched ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                {/* Cover */}
                <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-white/5">
                  {game.posterUrl ? (
                    <img src={game.posterUrl} alt="" className="w-full h-full object-cover"
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
                  </div>
                  <p className="text-xs text-white/40 truncate">{game.developer || 'Unknown developer'}</p>

                  {/* Match suggestion */}
                  {match?.status === 'searching' && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                      <span className="text-xs text-white/30">Searching...</span>
                    </div>
                  )}

                  {match?.status === 'matched' && match.suggestion && (
                    <div className="flex items-center gap-2 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-400 truncate">{match.suggestion.title}</span>
                      <button
                        onClick={() => openManualSearch(game.id)}
                        className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {match?.status === 'no_match' && (
                    <div className="flex items-center gap-2 mt-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-400/70">No match found</span>
                      <button
                        onClick={() => openManualSearch(game.id)}
                        className="text-xs text-white/40 hover:text-white transition-colors shrink-0"
                      >
                        Search manually
                      </button>
                    </div>
                  )}

                  {match?.status === 'skipped' && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-white/30">Skipped</span>
                      <button
                        onClick={() => openManualSearch(game.id)}
                        className="text-xs text-white/40 hover:text-white transition-colors shrink-0"
                      >
                        Search
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {match?.suggestion && match.status !== 'matched' && (
                    <button
                      onClick={() => setSuggestion(game.id, match.suggestion)}
                      className="h-7 rounded-lg px-2.5 text-[0.625rem] font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                    >
                      Match
                    </button>
                  )}
                  {isMatched && (
                    <button
                      onClick={() => clearSuggestion(game.id)}
                      className="h-7 rounded-lg px-2.5 text-[0.625rem] font-medium text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>

              {/* Manual search panel (expanded inline) */}
              {manuallySearching === game.id && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <ManualSearch
                    onSelect={(result) => {
                      setSuggestion(game.id, { ...result, slug: result.id })
                      setManuallySearching(null)
                    }}
                  />
                  <button
                    onClick={() => setManuallySearching(null)}
                    className="mt-1 text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Save progress */}
      {saving && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving matches... ({saveProgress}/{saveTotal})
          </div>
          <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${saveTotal > 0 ? (saveProgress / saveTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-white/5">
        <p className="text-xs text-white/40">
          {stats.matched} matched &middot; {stats.searching} searching &middot; {stats.skipped} skipped
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || stats.matched === 0}
            className="inline-flex items-center gap-2 h-10 rounded-xl px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              `Save ${stats.matched} Match${stats.matched !== 1 ? 'es' : ''}`
            )}
          </button>
        </div>
      </div>
    </SlidePanel>
  )
}
