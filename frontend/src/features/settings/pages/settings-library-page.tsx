import { useState, useEffect, useCallback, useMemo } from 'react'
import { Gamepad2, Loader2, Library, CheckCircle2, AlertCircle, Sparkles, FolderOpen, Search, X, Monitor } from 'lucide-react'
import { PluginSlot } from '@/features/plugins/components/organisms/plugin-slot'
import { getPluginAPI } from '@/features/plugins/pages/plugins-page'
import type { PluginAPI } from '@/features/plugins/components/organisms/plugin-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { CandidateReviewModal } from '../components/organisms/settings-candidate-review-modal'
import { DkDialog } from '@/old-features/ui/molecules/dialog'
import { useModal } from '@/lib/modals'
import { isDesktop } from '@/lib/desktop/api'

type ItemFilter = 'all' | 'games' | 'dlcs' | 'matched' | 'candidates' | 'unmatched'

export function SettingsLibraryPage() {
  const desktop = isDesktop()
  const [pluginApi, setPluginApi] = useState<PluginAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<any[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<ItemFilter>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [providersModalOpen, setProvidersModalOpen] = useState(false)

  const api = (window as any).desktopAPI
  const { openModal } = useModal()

  // Load plugin API
  useEffect(() => {
    const pApi = getPluginAPI()
    setPluginApi(pApi)
    const t = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(t)
  }, [])

  // Fetch all games
  const fetchGames = useCallback(() => {
    if (!api?.getLocalGames) {
      setGamesLoading(false)
      return
    }
    setGamesLoading(true)
    api.getLocalGames()
      .then((data: any[]) => setGames(data || []))
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false))
  }, [api])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  // Listen for scanned games updates
  useEffect(() => {
    const handleUpdated = () => fetchGames()
    window.addEventListener('scanned-games-updated', handleUpdated)
    const unsub = api?.onGamesUpdated?.(() => fetchGames())
    return () => {
      window.removeEventListener('scanned-games-updated', handleUpdated)
      unsub?.()
    }
  }, [api, fetchGames])

  // Stats calculation
  const stats = useMemo(() => {
    let dlcs = 0
    let baseGames = 0
    let matched = 0
    let candidates = 0
    let unmatched = 0
    for (const g of games) {
      if (g.isDlc) dlcs++
      else baseGames++
      if (g.otixMediaId) matched++
      else if (g.otixMatchSuggestion) candidates++
      else unmatched++
    }
    return { total: games.length, baseGames, dlcs, matched, candidates, unmatched }
  }, [games])

  // Extract unique platforms
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>()
    for (const g of games) {
      if (g.platform) set.add(g.platform)
    }
    return [...set].sort()
  }, [games])

  // Filtered games list
  const filteredGames = useMemo(() => {
    let result = games
    if (filterTab === 'games') result = result.filter((g) => !g.isDlc)
    else if (filterTab === 'dlcs') result = result.filter((g) => !!g.isDlc)
    else if (filterTab === 'matched') result = result.filter((g) => !!g.otixMediaId)
    else if (filterTab === 'candidates') result = result.filter((g) => !g.otixMediaId && !!g.otixMatchSuggestion)
    else if (filterTab === 'unmatched') result = result.filter((g) => !g.otixMediaId && !g.otixMatchSuggestion)

    if (platformFilter) {
      result = result.filter((g) => g.platform === platformFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) =>
        (g.title || '').toLowerCase().includes(q) ||
        (g.platform || '').toLowerCase().includes(q) ||
        (g.developer || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [games, filterTab, platformFilter, searchQuery])

  // Handle game click -> open candidate review modal
  const handleGameClick = useCallback((game: any) => {
    const close = openModal(
      <CandidateReviewModal
        game={game}
        onClose={() => close()}
        onMatchResolved={() => fetchGames()}
      />
    )
  }, [openModal, fetchGames])

  if (loading) {
    return (
      <div id="settings-library-section" className="space-y-4">
        <SectionHeader variant="page" title="Game Library" description="Scanned collection and provider settings." />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  if (!desktop && !pluginApi) {
    return (
      <div id="settings-library-section" className="space-y-4">
        <SectionHeader variant="page" title="Game Library" description="Scanned collection and provider settings." />
        <SettingsCard className="p-8 text-center space-y-4 max-w-xl mx-auto my-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Otix Desktop Feature</h3>
            <p className="text-xs text-white/60 mt-1 max-w-md mx-auto leading-relaxed">
              Local game directory scanning and platform provider plugins are available in the Otix Desktop App.
            </p>
          </div>
          <div className="pt-1 flex justify-center">
            <a
              href="https://otix.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-4 py-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              <Monitor className="h-4 w-4" />
              <span>Download Otix Desktop</span>
            </a>
          </div>
        </SettingsCard>
      </div>
    )
  }

  return (
    <div id="settings-library-section" className="space-y-4">
      {/* Page Title & Top Action: Manage Providers Modal */}
      <SectionHeader
        variant="page"
        title="Game Library"
        description={`${stats.total} titles scanned across your providers.`}
        action={
          <button
            onClick={() => setProvidersModalOpen(true)}
            className="inline-flex items-center gap-2 h-8.5 rounded-xl px-3.5 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <FolderOpen className="h-3.5 w-3.5 text-primary" />
            <span>Providers</span>
          </button>
        }
      />

      {/* ===== ALL GAMES LIBRARY CARD ===== */}
      <SettingsCard compact>
        {/* Filter bar, Platform filter & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scanned games..."
              className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-8 text-xs text-white outline-none placeholder:text-white/30 focus:bg-white/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Status & Category Filter Tabs */}
            <div className="flex rounded-xl p-1 bg-white/5 gap-1 text-xs">
              {(['all', 'games', 'dlcs', 'matched', 'candidates', 'unmatched'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1.5 rounded-lg capitalize text-xs font-semibold transition-all cursor-pointer ${
                    filterTab === tab
                      ? 'bg-white/15 text-white shadow-xs'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tab === 'all'
                    ? `All (${stats.total})`
                    : tab === 'games'
                    ? `Games (${stats.baseGames})`
                    : tab === 'dlcs'
                    ? `DLCs (${stats.dlcs})`
                    : tab === 'candidates'
                    ? `Review (${stats.candidates})`
                    : tab === 'matched'
                    ? `Matched (${stats.matched})`
                    : `Unmatched (${stats.unmatched})`}
                </button>
              ))}
            </div>

            {/* Platform Filter Dropdown */}
            {availablePlatforms.length > 0 && (
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="h-9 rounded-xl bg-white/5 px-3 text-xs text-white/80 outline-none capitalize cursor-pointer focus:bg-white/10 transition-colors"
              >
                <option value="" className="bg-neutral-900 text-white">All Platforms</option>
                {availablePlatforms.map((p) => (
                  <option key={p} value={p} className="bg-neutral-900 text-white capitalize">{p}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* All Games Grid */}
        {gamesLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-white/40 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading games...
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-white/20">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/80">No games found</p>
              <p className="text-[11px] text-white/40 mt-0.5 max-w-xs mx-auto leading-relaxed">
                {searchQuery || filterTab !== 'all' || platformFilter
                  ? 'Try clearing active filters.'
                  : 'Click "Providers" above to add local game folders.'}
              </p>
            </div>
            {(searchQuery || filterTab !== 'all' || platformFilter) && (
              <div className="pt-1">
                <button
                  onClick={() => { setSearchQuery(''); setFilterTab('all'); setPlatformFilter('') }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
            {filteredGames.map((game: any) => {
              const isMatched = !!game.otixMediaId
              const isCandidate = !isMatched && !!game.otixMatchSuggestion
              const iconUrl = game.posterUrl || game.localIconUrl || game.iconUrl

              return (
                <button
                  key={game.id || game.title}
                  onClick={() => handleGameClick(game)}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left transition-all group cursor-pointer relative overflow-hidden"
                  style={{
                    boxShadow: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {/* Poster / Cover Thumbnail */}
                  <div className="h-12 w-12 rounded-xl bg-white/10 shrink-0 overflow-hidden flex items-center justify-center relative">
                    {iconUrl ? (
                      <img src={iconUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    ) : (
                      <Gamepad2 className="h-5 w-5 text-white/30" />
                    )}
                  </div>

                  {/* Title & Provider + Status Row */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate whitespace-nowrap group-hover:text-primary transition-colors">
                      {game.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      <span className="text-[11px] text-white/40 truncate capitalize whitespace-nowrap shrink-0">
                        {game.platform || game.providerName || 'PC'}
                      </span>
                      {game.isDlc && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          DLC
                        </span>
                      )}
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                          Matched
                        </span>
                      ) : isCandidate ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
                          Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/40 bg-white/5 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                          Unmatched
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SettingsCard>

      {/* ===== PROVIDERS & SCANNERS MODAL ===== */}
      <DkDialog
        open={providersModalOpen}
        onOpenChange={setProvidersModalOpen}
        title="Library Providers"
        description="Configure scanner paths and platform plugins."
        className="max-w-4xl"
      >
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
          {pluginApi ? (
            <PluginSlot location="library:scan" pluginApi={pluginApi} />
          ) : (
            <div className="py-8 text-center text-xs text-white/40">
              No library providers currently active.
            </div>
          )}
        </div>
      </DkDialog>
    </div>
  )
}
