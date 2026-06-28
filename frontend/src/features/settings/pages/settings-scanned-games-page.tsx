import { useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2, Gamepad2, ArrowLeft, CheckCircle2, AlertCircle, Star, Trash2, Search, ArrowUpDown, Clock, Filter } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { ProviderLogo } from '../components/atoms/provider-logo'
import { CandidateReviewModal } from '../components/organisms/settings-candidate-review-modal'
import { useModal } from '@/lib/modals'

type FilterTab = 'all' | 'matched' | 'candidates' | 'unmatched'
type SortKey = 'title' | 'platform' | 'updated_at'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'unmatched', label: 'Unmatched' },
]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'platform', label: 'Platform' },
  { key: 'updated_at', label: 'Updated' },
]

export function SettingsScannedGamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const api = window.desktopAPI
  const { openModal } = useModal()
  const [resetConfirm, setResetConfirm] = useState(false)

  const handleReset = async () => {
    if (!resetConfirm) { setResetConfirm(true); return }
    if (!api?.resetGameData) return
    setResetting(true)
    try {
      await api.resetGameData()
      setGames([])
      setResetConfirm(false)
    } finally {
      setResetting(false)
    }
  }

  const fetchGames = useCallback(() => {
    if (!api?.getLocalGames) return
    setLoading(true)
    const filter: Record<string, unknown> = {}
    filter.sortBy = sortKey
    filter.sortDir = sortDir
    api.getLocalGames(filter).then((data: any[]) => {
      setGames(data || [])
    }).finally(() => setLoading(false))
  }, [api, sortKey, sortDir])

  useEffect(() => { fetchGames() }, [fetchGames])

  useEffect(() => {
    if (!api?.onGamesUpdated) return
    const unsub = api.onGamesUpdated(() => fetchGames())
    return () => unsub?.()
  }, [api, fetchGames])

  const handleGameClick = useCallback((game: any) => {
    const close = openModal(
      <CandidateReviewModal
        game={game}
        onClose={() => close()}
        onMatchResolved={() => fetchGames()}
      />
    )
  }, [openModal, fetchGames])

  // Extract unique platforms from games
  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>()
    for (const g of games) {
      if (g.platform) platforms.add(g.platform)
    }
    return [...platforms].sort()
  }, [games])

  // Client-side filter + search
  const filteredGames = useMemo(() => {
    let result = games
    // Platform filter
    if (platformFilter) {
      result = result.filter((g: any) => g.platform === platformFilter)
    }
    // Matched/candidates/unmatched filter
    if (filterTab === 'matched') result = result.filter((g: any) => !!g.otixMediaId)
    else if (filterTab === 'candidates') result = result.filter((g: any) => !g.otixMediaId && !!g.otixMatchSuggestion)
    else if (filterTab === 'unmatched') result = result.filter((g: any) => !g.otixMediaId && !g.otixMatchSuggestion)
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g: any) => g.title?.toLowerCase().includes(q) || g.otixMediaTitle?.toLowerCase().includes(q))
    }
    return result
  }, [games, filterTab, platformFilter, searchQuery])

  return (
    <div className="p-6 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/settings/library"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        <h2 className="text-lg font-semibold text-white">Scanned Games</h2>
        <span className="text-sm text-white/40">({filteredGames.length}{platformFilter || filterTab !== 'all' ? ` / ${games.length}` : ''})</span>
        <div className="flex-1" />
        <button
          onClick={handleReset}
          disabled={resetting || games.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400/70 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {resetting ? 'Resetting...' : resetConfirm ? 'Click again to confirm' : 'Reset Library'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Gamepad2 className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">No scanned games found. Scan a game library first.</p>
        </div>
      )}

      {/* Filter bar */}
      {!loading && games.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          {/* Platform filter */}
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Filter className="h-3 w-3" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-transparent text-white/60 outline-none cursor-pointer appearance-none"
            >
              <option value="" className="bg-zinc-900">All Platforms</option>
              {availablePlatforms.map((p) => (
                <option key={p} value={p} className="bg-zinc-900">{p.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-36 pl-7 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white placeholder-white/30 outline-none focus:border-white/[0.12] transition-colors"
            />
          </div>
          {/* Sort */}
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <ArrowUpDown className="h-3 w-3" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-transparent text-white/60 outline-none cursor-pointer appearance-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} className="bg-zinc-900">{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="text-white/40 hover:text-white/60 transition-colors ml-0.5"
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      )}

      {!loading && filteredGames.length === 0 && games.length > 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">No games match your filter</p>
        </div>
      )}

      {!loading && filteredGames.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filteredGames.map((game: any) => {
            const posterUrl = game.otixPosterUrl || game.posterUrl
            const isMatched = !!game.otixMediaId
            const hasSuggestion = !!game.otixMatchSuggestion
            const confidence = game.otixConfidence
            const candidateCount = (() => {
              const s = game.otixMatchSuggestion
              if (s?._candidates) return s._candidates.length
              return s ? 1 : 0
            })()
            return (
              <div key={game.id} onClick={() => handleGameClick(game)} className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer">
                {posterUrl ? (
                  <DkImage
                    src={posterUrl}
                    alt={game.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
                    <Gamepad2 className="h-12 w-12 text-white/10" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-2 py-0.5 rounded bg-black/50 flex items-center justify-center">
                    <ProviderLogo platform={game.platform} className="h-3.5" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                  {isMatched && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Matched
                    </span>
                  )}
                  {isMatched && game.otixConfidence != null && game.otixConfidence < 0.95 && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  )}
                  {!isMatched && hasSuggestion && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-1">
                      <Star className="h-3 w-3" /> {candidateCount}
                    </span>
                  )}
                  {confidence != null && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      confidence >= 0.95 ? 'bg-green-500/20 text-green-400' :
                      confidence >= 0.85 ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                  <p className="text-sm font-semibold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {game.title}
                  </p>
                  {game.otixMediaTitle && game.otixMediaTitle !== game.title && (
                    <p className="text-[11px] text-green-400/70 truncate mt-0.5">
                      {game.otixMediaTitle}
                    </p>
                  )}
                  {!isMatched && !hasSuggestion && (
                    <p className="text-[11px] text-yellow-400/50 mt-0.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Unmatched
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
