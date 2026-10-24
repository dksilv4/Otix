import { useState, useEffect, useCallback, useMemo } from 'react'
import { Gamepad2, Loader2, CheckCircle2, Sparkles, FolderOpen, Search, X, ArrowUpDown, HardDrive, ArrowUpRight } from 'lucide-react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { PluginSlot } from '@/features/plugins/components/organisms/plugin-slot'
import { getPluginAPI, type PluginAPI } from '@/features/plugins/api'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkButton } from '@ui/atoms/button'
import { ProviderLogo } from '../components/atoms/provider-logo'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { CandidateReviewModal } from '../components/organisms/settings-candidate-review-modal'
import {
  SettingsLibraryTabs,
  type LibrarySettingsTab,
} from '../components/organisms/settings-library-tabs'
import {
  resolveLibrarySettingsTab,
} from '../components/organisms/settings-library-tab-utils'
import { DkDialog } from '@ui/molecules/dialog'
import { useModal } from '@/lib/modals'
import { cn } from '@/lib/utils'
import { ProposalsPage } from '@/features/proposals/pages/proposals-page'
import {
  fetchAllLibraryPages,
  fetchInstalledGames,
  mapSteamMatched,
  mapSteamUnmatched,
  mapEpicMatched,
  mapEpicUnmatched,
  mapGOGMatched,
  mapGOGUnmatched,
  deduplicateGames,
} from '../utils/library-games'

type ItemFilter = 'all' | 'games' | 'dlcs' | 'expansions' | 'demos' | 'betas' | 'mods' | 'soundtracks' | 'matched' | 'candidates' | 'unmatched'
type SortKey = 'title' | 'recent' | 'playtime' | 'platform' | 'status'
type SortDir = 'asc' | 'desc'

export const SettingsLibraryPage = () => {
  const [pluginApi, setPluginApi] = useState<PluginAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<any[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<ItemFilter>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')


  const api = (window as any).desktopAPI
  const { openModal } = useModal()

  const location = useLocation()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<LibrarySettingsTab>(() =>
    resolveLibrarySettingsTab(location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')),
  )

  useEffect(() => {
    const rawHash = location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')
    const hash = rawHash.replace(/^#/, '').toLowerCase()
    if (hash === 'organize' && navigate) {
      navigate({ to: '/settings/organize', replace: true })
      return
    }
    if (hash === 'paths' && navigate) {
      navigate({ to: '/settings/paths', replace: true })
      return
    }
    if (hash === 'downloads' && navigate) {
      navigate({ to: '/settings/nodes', replace: true })
      return
    }
    const next = resolveLibrarySettingsTab(rawHash)
    setActiveTab(next)
  }, [location?.hash, navigate])

  const handleTabChange = useCallback(
    (tab: LibrarySettingsTab) => {
      setActiveTab(tab)
      if (navigate) {
        navigate({ to: '/settings/library', hash: tab, replace: true })
      } else if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#${tab}`)
      }
    },
    [navigate],
  )
  // Load plugin API
  useEffect(() => {
    const pApi = getPluginAPI()
    setPluginApi(pApi)
    const t = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(t)
  }, [])

  // Disk scan (this app or synced installs) + Steam, Epic & GOG library (matched + unmatched).
  const fetchGames = useCallback(async () => {
    setGamesLoading(true)
    const [local, installed, steamMatched, steamUnmatched, epicMatched, epicUnmatched, gogMatched, gogUnmatched] = await Promise.all([
      api?.getLocalGames?.().then((data: any[]) => data || []).catch(() => []),
      fetchInstalledGames().catch(() => []),
      fetchAllLibraryPages('/library/steam').then((items) => items.map(mapSteamMatched)).catch(() => []),
      fetchAllLibraryPages('/library/steam/unmatched').then((items) => items.map(mapSteamUnmatched)).catch(() => []),
      fetchAllLibraryPages('/library/epic').then((items) => items.map(mapEpicMatched)).catch(() => []),
      fetchAllLibraryPages('/library/epic/unmatched').then((items) => items.map(mapEpicUnmatched)).catch(() => []),
      fetchAllLibraryPages('/library/gog').then((items) => items.map(mapGOGMatched)).catch(() => []),
      fetchAllLibraryPages('/library/gog/unmatched').then((items) => items.map(mapGOGUnmatched)).catch(() => []),
    ])
    setGames(deduplicateGames([...(local ?? []), ...installed, ...steamMatched, ...steamUnmatched, ...epicMatched, ...epicUnmatched, ...gogMatched, ...gogUnmatched]))
    setGamesLoading(false)
  }, [api])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  useEffect(() => {
    const handleUpdated = () => fetchGames()
    window.addEventListener('scanned-games-updated', handleUpdated)
    const unsub = api?.onGamesUpdated?.(() => fetchGames())
    return () => {
      window.removeEventListener('scanned-games-updated', handleUpdated)
      unsub?.()
    }
  }, [api, fetchGames])


  // Helper to determine game type slug
  const getGameType = (g: any): string => {
    if (g.gameType) return g.gameType
    if (g.contentType) return g.contentType
    if (g.isApp) return 'application'
    if (g.isDemo || (g.title && /\bdemo\b/i.test(g.title))) return 'demo'
    if (g.isDlc) return 'dlc_addon'
    if (g.isBeta) return 'beta'
    return 'main_game'
  }

  // Applications (non-game software) are detected and stored but hidden from the UI for now
  const isAppGame = (g: any): boolean =>
    g?.isApp === true || g?.gameType === 'application' || g?.contentType === 'application'

  // Stats calculation
  const stats = useMemo(() => {
    let dlcs = 0
    let demos = 0
    let betas = 0
    let expansions = 0
    let mods = 0
    let soundtracks = 0
    let baseGames = 0
    let matched = 0
    let candidates = 0
    let unmatched = 0
    let total = 0
    for (const g of games) {
      if (isAppGame(g)) continue // applications are stored but hidden
      total++
      const gt = getGameType(g)
      if (gt === 'dlc_addon' || g.isDlc) dlcs++
      else if (gt === 'expansion' || gt === 'standalone_expansion') expansions++
      else if (gt === 'demo' || g.isDemo) demos++
      else if (gt === 'beta' || g.isBeta) betas++
      else if (gt === 'mod') mods++
      else if (gt === 'soundtrack') soundtracks++
      else baseGames++

      if (g.otixMediaId) matched++
      else if (g.otixMatchSuggestion) candidates++
      else unmatched++
    }
    return { total, baseGames, dlcs, expansions, demos, betas, mods, soundtracks, matched, candidates, unmatched }
  }, [games])

  // Extract unique platforms
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>()
    for (const g of games) {
      if (isAppGame(g)) continue
      if (g.platform) set.add(g.platform)
      if (g.providerName) set.add(g.providerName)
    }
    return [...set].sort()
  }, [games])

  // Options for DkDropdown
  const categoryDropdownOptions = useMemo(() => [
    { value: 'all', label: `All Items (${stats.total})` },
    { value: 'games', label: `Base Games (${stats.baseGames})` },
    { value: 'dlcs', label: `DLCs (${stats.dlcs})` },
    { value: 'expansions', label: `Expansions (${stats.expansions})` },
    { value: 'demos', label: `Demos (${stats.demos})` },
    { value: 'betas', label: `Betas (${stats.betas})` },
    { value: 'mods', label: `Mods (${stats.mods})` },
    { value: 'soundtracks', label: `Soundtracks (${stats.soundtracks})` },
    { value: 'matched', label: `Matched (${stats.matched})` },
    { value: 'candidates', label: `Need Review (${stats.candidates})` },
    { value: 'unmatched', label: `Unmatched (${stats.unmatched})` },
  ], [stats])

  const platformDropdownOptions = useMemo(() => [
    { value: '', label: 'All Platforms' },
    ...availablePlatforms.map((p) => ({
      value: p,
      label: p.charAt(0).toUpperCase() + p.slice(1),
    })),
  ], [availablePlatforms])

  const sortDropdownOptions = useMemo(() => [
    { value: 'title', label: 'Title' },
    { value: 'recent', label: 'Last Played' },
    { value: 'playtime', label: 'Playtime' },
    { value: 'platform', label: 'Platform' },
    { value: 'status', label: 'Match Status' },
  ], [])

  // Filtered and sorted games list
  const filteredGames = useMemo(() => {
    let result = games.filter((g) => !isAppGame(g)) // applications are stored but hidden
    if (filterTab === 'games') result = result.filter((g) => {
      const gt = getGameType(g)
      return !g.isDlc && !g.isBeta && !g.isDemo && (gt === 'main_game' || gt === 'remake' || gt === 'remaster' || gt === 'port')
    })
    else if (filterTab === 'dlcs') result = result.filter((g) => g.isDlc || getGameType(g) === 'dlc_addon' || getGameType(g) === 'pack')
    else if (filterTab === 'expansions') result = result.filter((g) => getGameType(g) === 'expansion' || getGameType(g) === 'standalone_expansion')
    else if (filterTab === 'demos') result = result.filter((g) => g.isDemo || getGameType(g) === 'demo')
    else if (filterTab === 'betas') result = result.filter((g) => (g.isBeta || getGameType(g) === 'beta') && !g.isDemo && getGameType(g) !== 'demo')
    else if (filterTab === 'mods') result = result.filter((g) => getGameType(g) === 'mod')
    else if (filterTab === 'soundtracks') result = result.filter((g) => getGameType(g) === 'soundtrack')
    else if (filterTab === 'matched') result = result.filter((g) => !!g.otixMediaId)
    else if (filterTab === 'candidates') result = result.filter((g) => !g.otixMediaId && !!g.otixMatchSuggestion)
    else if (filterTab === 'unmatched') result = result.filter((g) => !g.otixMediaId && !g.otixMatchSuggestion)

    if (platformFilter) {
      const pf = platformFilter.toLowerCase()
      result = result.filter((g) =>
        (g.platform || '').toLowerCase() === pf ||
        (g.providerName || '').toLowerCase() === pf
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) =>
        (g.title || '').toLowerCase().includes(q) ||
        (g.platform || '').toLowerCase().includes(q) ||
        (g.developer || '').toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      let cmp = 0

      if (sortKey === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true })
      } else if (sortKey === 'recent') {
        const getTimestamp = (g: any) => {
          if (g.steamRtimeLastPlayed) {
            const val = Number(g.steamRtimeLastPlayed)
            return val > 1e11 ? val : val * 1000
          }
          if (g.lastPlayedAt) return new Date(g.lastPlayedAt).getTime()
          if (g.updatedAt) return new Date(g.updatedAt).getTime()
          return 0
        }
        cmp = getTimestamp(a) - getTimestamp(b)
      } else if (sortKey === 'playtime') {
        const getPlaytime = (g: any) => g.steamPlaytimeForever ?? g.playtimeMinutes ?? (g.playtimeHours ? g.playtimeHours * 60 : 0)
        cmp = getPlaytime(a) - getPlaytime(b)
      } else if (sortKey === 'platform') {
        const aPlat = (a.platform || a.providerName || '').toLowerCase()
        const bPlat = (b.platform || b.providerName || '').toLowerCase()
        cmp = aPlat.localeCompare(bPlat, undefined, { sensitivity: 'base', numeric: true })
      } else if (sortKey === 'status') {
        const getStatusRank = (g: any) => {
          if (g.otixMediaId) return 3
          if (g.otixMatchSuggestion) return 2
          return 1
        }
        cmp = getStatusRank(a) - getStatusRank(b)
      }

      if (cmp === 0) {
        cmp = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true })
      }

      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [games, filterTab, platformFilter, searchQuery, sortKey, sortDir])

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

  return (
    <div id="settings-library-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={HardDrive}
        title="Library"
        description={
          activeTab === 'proposals'
            ? 'Review and approve crowdsourced metadata match suggestions.'
            : 'Match titles to Otix metadata, review candidates, and manage providers.'
        }
      />
      <SettingsLibraryTabs
        value={activeTab}
        onValueChange={handleTabChange}
        panels={{
          catalog: (
            <div id="catalog" className="space-y-6 scroll-mt-28">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Loading library...</span>
                </div>
              ) : (
                <>
                  <SettingsCard className="space-y-4">
                    <SectionHeader
                      icon={Gamepad2}
                      title="Catalog"
                      description="Local, Steam, Epic, and GOG titles Otix has found — match them, review suggestions, or leave unmatched."
                      action={
                        <div className="flex items-center gap-2">
                          <Link
                            to="/settings/nodes"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] rounded-xl transition-colors"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/70" />
                            <span>Scan Folders</span>
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground/50" />
                          </Link>
                          <DkButton
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const close = openModal(
                                <DkDialog
                                  open
                                  onOpenChange={(next) => {
                                    if (!next) close()
                                  }}
                                  title="Library Providers"
                                  description="Configure scanner paths and platform integration providers."
                                  className="max-w-4xl"
                                >
                                  <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
                                    {pluginApi && <PluginSlot location="library:scan" pluginApi={pluginApi} />}
                                  </div>
                                </DkDialog>,
                              )
                            }}
                          >
                            Manage Providers
                          </DkButton>
                        </div>
                      }
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFilterTab('all')}
                        className={cn(
                          'rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer',
                          filterTab === 'all'
                            ? 'bg-primary/10'
                            : 'hover:bg-[var(--dk-surface-ghost)]',
                        )}
                        style={filterTab === 'all' ? undefined : { backgroundColor: 'var(--dk-surface-raised)' }}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                          <HardDrive className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">Total</span>
                        </div>
                        <p className="text-lg font-bold text-foreground tabular-nums leading-none">
                          {gamesLoading ? '…' : stats.total}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">All library items</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFilterTab('matched')}
                        className={cn(
                          'rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer',
                          filterTab === 'matched'
                            ? 'bg-emerald-500/10'
                            : 'hover:bg-emerald-500/5',
                        )}
                        style={filterTab === 'matched' ? undefined : { backgroundColor: 'var(--dk-surface-raised)' }}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">Matched</span>
                        </div>
                        <p className="text-lg font-bold text-emerald-500 tabular-nums leading-none">
                          {gamesLoading ? '…' : stats.matched}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">Linked to metadata</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFilterTab('candidates')}
                        className={cn(
                          'rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer',
                          filterTab === 'candidates'
                            ? 'bg-sky-500/10'
                            : 'hover:bg-sky-500/5',
                        )}
                        style={filterTab === 'candidates' ? undefined : { backgroundColor: 'var(--dk-surface-raised)' }}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                          <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">Review</span>
                        </div>
                        <p className="text-lg font-bold text-sky-500 tabular-nums leading-none">
                          {gamesLoading ? '…' : stats.candidates}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">Need a decision</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFilterTab('unmatched')}
                        className={cn(
                          'rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer',
                          filterTab === 'unmatched'
                            ? 'bg-primary/10'
                            : 'hover:bg-[var(--dk-surface-ghost)]',
                        )}
                        style={filterTab === 'unmatched' ? undefined : { backgroundColor: 'var(--dk-surface-raised)' }}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                          <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">Unmatched</span>
                        </div>
                        <p className="text-lg font-bold text-foreground tabular-nums leading-none">
                          {gamesLoading ? '…' : stats.unmatched}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">No Otix link yet</p>
                      </button>
                    </div>
                  </SettingsCard>

                  <SettingsCard>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search library titles, developers, platforms..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full h-9 pl-9 pr-8 rounded-xl bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <DkDropdown
                          options={categoryDropdownOptions}
                          value={filterTab}
                          onChange={(val) => setFilterTab(val as ItemFilter)}
                          variant="filter"
                          label="Type"
                        />

                        {availablePlatforms.length > 0 && (
                          <DkDropdown
                            options={platformDropdownOptions}
                            value={platformFilter}
                            onChange={setPlatformFilter}
                            variant="filter"
                            label="Platform"
                          />
                        )}

                        <DkDropdown
                          options={sortDropdownOptions}
                          value={sortKey}
                          onChange={(val) => {
                            const newKey = val as SortKey
                            setSortKey(newKey)
                            if (newKey === 'recent' || newKey === 'playtime') {
                              setSortDir('desc')
                            } else {
                              setSortDir('asc')
                            }
                          }}
                          variant="filter"
                          label="Sort"
                        />

                        <button
                          type="button"
                          onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                          className="flex items-center justify-center h-8 w-8 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground transition-all cursor-pointer select-none"
                          title={sortDir === 'asc' ? 'Ascending (Click for Descending)' : 'Descending (Click for Ascending)'}
                        >
                          <ArrowUpDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200',
                              sortDir === 'desc' && 'rotate-180 text-primary',
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {gamesLoading ? (
                      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Loading games...
                      </div>
                    ) : filteredGames.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <div className="h-10 w-10 rounded-2xl bg-[var(--dk-surface-ghost)] flex items-center justify-center mx-auto text-muted-foreground/40">
                          <Gamepad2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">No items found</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs mx-auto leading-relaxed">
                            {searchQuery ||
                            filterTab !== 'all' ||
                            platformFilter ||
                            sortKey !== 'title' ||
                            sortDir !== 'asc'
                              ? 'Try clearing active filters.'
                              : 'Add scan folders under Paths, or open Manage Providers.'}
                          </p>
                        </div>
                        {(searchQuery ||
                          filterTab !== 'all' ||
                          platformFilter ||
                          sortKey !== 'title' ||
                          sortDir !== 'asc') && (
                          <div className="pt-1">
                            <button
                              onClick={() => {
                                setSearchQuery('')
                                setFilterTab('all')
                                setPlatformFilter('')
                                setSortKey('title')
                                setSortDir('asc')
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--dk-surface-ghost)] text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer"
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
                          const gt = getGameType(game)

                          return (
                            <button
                              key={game.id || game.title}
                              onClick={() => handleGameClick(game)}
                              className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-left transition-all group cursor-pointer relative overflow-hidden"
                            >
                              <div className="h-12 w-12 rounded-xl bg-[var(--dk-surface-field)] shrink-0 overflow-hidden flex items-center justify-center relative">
                                {iconUrl ? (
                                  <img
                                    src={iconUrl}
                                    alt=""
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                ) : (
                                  <Gamepad2 className="h-5 w-5 text-muted-foreground/40" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-foreground truncate whitespace-nowrap group-hover:text-primary transition-colors">
                                  {game.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 min-w-0">
                                  <div
                                    title={game.platform || game.providerName || 'PC'}
                                    className="flex items-center justify-center p-1 rounded-md bg-[var(--dk-surface-field)] shrink-0"
                                  >
                                    <ProviderLogo
                                      platform={game.platform || game.providerName || 'pc'}
                                      className="h-3.5 w-3.5"
                                    />
                                  </div>
                                  {(gt === 'dlc_addon' || game.isDlc) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      DLC
                                    </span>
                                  )}
                                  {(gt === 'expansion' || gt === 'standalone_expansion') && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      Expansion
                                    </span>
                                  )}
                                  {(gt === 'demo' || game.isDemo) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-500 bg-teal-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      Demo
                                    </span>
                                  )}
                                  {(gt === 'beta' || game.isBeta) &&
                                    gt !== 'demo' &&
                                    !game.isDemo && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                        Beta
                                      </span>
                                    )}
                                  {gt === 'mod' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      Mod
                                    </span>
                                  )}
                                  {gt === 'soundtrack' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      OST
                                    </span>
                                  )}
                                  {isMatched ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      Matched
                                    </span>
                                  ) : isCandidate ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                      Review
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-[var(--dk-surface-field)] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
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
                </>
              )}
            </div>
          ),
          proposals: (
            <div id="proposals" className="space-y-6 scroll-mt-28">
              <ProposalsPage />
            </div>
          ),
        }}
      />
    </div>
  )
};
