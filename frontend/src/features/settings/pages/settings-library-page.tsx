import { useState, useEffect, useCallback, useMemo } from 'react'
import { Gamepad2, Loader2, Library, CheckCircle2, AlertCircle, Sparkles, FolderOpen, Search, X, Monitor, Filter, RefreshCw, Link2, ArrowUpDown } from 'lucide-react'
import { PluginSlot } from '@/features/plugins/components/organisms/plugin-slot'
import { getPluginAPI, type PluginAPI } from '@/features/plugins/api'
import { DkDropdown } from '@ui/atoms/dropdown'
import { ProviderLogo } from '../components/atoms/provider-logo'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { CandidateReviewModal } from '../components/organisms/settings-candidate-review-modal'
import { SettingsFreeGamesSection } from '../components/organisms/settings-free-games-section'
import { DkDialog } from '@ui/molecules/dialog'
import { useModal } from '@/lib/modals'
import { isDesktop } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type ItemFilter = 'all' | 'games' | 'dlcs' | 'expansions' | 'demos' | 'betas' | 'mods' | 'soundtracks' | 'matched' | 'candidates' | 'unmatched'
type SortKey = 'title' | 'recent' | 'playtime' | 'platform' | 'status'
type SortDir = 'asc' | 'desc'

// Fetch every page of a cursor-paginated library endpoint (matched + unmatched).
async function fetchAllLibraryPages(path: string): Promise<any[]> {
  const items: any[] = []
  let cursor: string | null = null
  for (let i = 0; i < 50; i++) {
    const params: Record<string, string> = { limit: '100' }
    if (cursor) params.cursor = cursor
    const { data } = await apiClient.get<any>(path, { params })
    items.push(...(data?.items ?? []))
    if (!data?.hasMore || !data?.nextCursor) break
    cursor = data.nextCursor
  }
  return items
}

// Map a matched Steam MediaItemSummary to the page's local-game shape.
function mapSteamMatched(item: any): any {
  return {
    id: `steam-${item.id}`,
    title: item.title,
    posterUrl: item.posterUrl || item.textlessPosterUrl || item.iconUrl || null,
    localIconUrl: item.iconUrl || null,
    iconUrl: item.iconUrl || null,
    otixMediaId: item.id,
    platform: 'steam',
    providerName: 'steam',
    gameType: 'main_game',
    mediaType: item.mediaType || 'game',
    developer: null,
    steamPlaytimeForever: item.steamPlaytimeForever,
    steamPlaytime2weeks: item.steamPlaytime2weeks,
    steamRtimeLastPlayed: item.steamRtimeLastPlayed,
    isSteam: true,
  }
}

// Map an unmatched SteamUnmatchedGameSummary to the page's local-game shape.
function mapSteamUnmatched(item: any): any {
  const iconUrl = item.steamImgIconUrl
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${item.steamAppId}/${item.steamImgIconUrl}.jpg`
    : null
  return {
    id: `steam-unmatched-${item.id}`,
    title: item.steamName,
    posterUrl: null,
    localIconUrl: iconUrl,
    iconUrl,
    otixMediaId: undefined,
    platform: 'steam',
    providerName: 'steam',
    gameType: 'main_game',
    mediaType: 'game',
    developer: null,
    steamAppId: item.steamAppId,
    steamPlaytimeForever: item.steamPlaytimeForever,
    steamPlaytime2weeks: item.steamPlaytime2weeks,
    steamRtimeLastPlayed: item.steamRtimeLastPlayed,
    isSteam: true,
  }
}

// Clean title for fuzzy deduplication across editions, regional titles, playtests, betas, and servers.
function cleanTitleForDeduplication(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/^(a\.v\.a\.?|ava)\s*/i, '')
    .replace(/\s*[\(\[\{-].*?[\)\]\}]/g, '')
    .replace(/[-:\s]+(playtest|test server|public test server|closed beta|open beta|beta|alpha|demo|global|server|pts|trial|client|sdk|edition|goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|vr|directors? cut)\b.*/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Deduplicate games from local disk scan and backend API endpoints.
function deduplicateGames(items: any[]): any[] {
  const merged: any[] = []
  const seenIds = new Set<string>()
  const seenMediaIds = new Set<string>()
  const seenSteamAppIds = new Set<string>()
  const titleMap = new Map<string, any>()

  for (const item of items) {
    if (!item) continue

    const mediaId = item.otixMediaId ? String(item.otixMediaId) : null
    const steamAppId = item.steamAppId
      ? String(item.steamAppId)
      : item.id?.startsWith?.('steam-')
      ? item.id.replace('steam-', '').replace('unmatched-', '')
      : null

    const normTitle = cleanTitleForDeduplication(item.title)
    const isSteam = item.isSteam || item.platform === 'steam' || item.providerName === 'steam'
    const platKey = isSteam ? 'steam' : (item.platform || item.providerName || 'pc').toLowerCase()
    // Group by normalized title across PC/Steam platforms to collapse regional, beta, playtest, and edition duplicates
    const titleKey = isSteam || platKey === 'pc' || platKey === 'win32' ? normTitle : `${normTitle}:${platKey}`

    let existing: any = null

    if (item.id && seenIds.has(item.id)) {
      existing = merged.find((m) => m.id === item.id)
    } else if (mediaId && seenMediaIds.has(mediaId)) {
      existing = merged.find((m) => String(m.otixMediaId) === mediaId)
    } else if (steamAppId && seenSteamAppIds.has(steamAppId)) {
      existing = merged.find((m) => {
        const mSteamAppId = m.steamAppId
          ? String(m.steamAppId)
          : m.id?.startsWith?.('steam-')
          ? m.id.replace('steam-', '').replace('unmatched-', '')
          : null
        return mSteamAppId === steamAppId
      })
    } else if (normTitle && titleMap.has(titleKey)) {
      existing = titleMap.get(titleKey)
    }

    if (existing) {
      if (!existing.otixMediaId && item.otixMediaId) {
        existing.otixMediaId = item.otixMediaId
      }
      if (!existing.posterUrl && item.posterUrl) {
        existing.posterUrl = item.posterUrl
      }
      if (!existing.localIconUrl && item.localIconUrl) {
        existing.localIconUrl = item.localIconUrl
      }
      if (!existing.iconUrl && item.iconUrl) {
        existing.iconUrl = item.iconUrl
      }
      if (!existing.exePath && item.exePath) {
        existing.exePath = item.exePath
      }
      if (!existing.steamAppId && item.steamAppId) {
        existing.steamAppId = item.steamAppId
      }
      if (item.steamPlaytimeForever && (!existing.steamPlaytimeForever || item.steamPlaytimeForever > existing.steamPlaytimeForever)) {
        existing.steamPlaytimeForever = item.steamPlaytimeForever
      }
      if (item.steamRtimeLastPlayed && (!existing.steamRtimeLastPlayed || item.steamRtimeLastPlayed > existing.steamRtimeLastPlayed)) {
        existing.steamRtimeLastPlayed = item.steamRtimeLastPlayed
      }
      if (!existing.otixMatchSuggestion && item.otixMatchSuggestion) {
        existing.otixMatchSuggestion = item.otixMatchSuggestion
      }
      if ((item.otixMediaId && !existing.otixMediaId) || (!existing.otixMediaId && item.title && item.title.length < existing.title.length)) {
        existing.title = item.title
      }
    } else {
      const newItem = { ...item }
      merged.push(newItem)
      if (newItem.id) seenIds.add(newItem.id)
      if (mediaId) seenMediaIds.add(mediaId)
      if (steamAppId) seenSteamAppIds.add(steamAppId)
      if (normTitle) titleMap.set(titleKey, newItem)
    }
  }

  return merged
}

export function SettingsLibraryPage() {
  const desktop = isDesktop()
  const [pluginApi, setPluginApi] = useState<PluginAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<any[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<ItemFilter>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
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

  // Fetch all games: local disk scan (desktop) + backend Steam library (matched + unmatched).
  const fetchGames = useCallback(async () => {
    setGamesLoading(true)
    const [local, steamMatched, steamUnmatched] = await Promise.all([
      api?.getLocalGames?.().then((data: any[]) => data || []).catch(() => []),
      fetchAllLibraryPages('/library/steam').then((items) => items.map(mapSteamMatched)).catch(() => []),
      fetchAllLibraryPages('/library/steam/unmatched').then((items) => items.map(mapSteamUnmatched)).catch(() => []),
    ])
    setGames(deduplicateGames([...(local ?? []), ...steamMatched, ...steamUnmatched]))
    setGamesLoading(false)
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
        const getPlaytime = (g: any) => g.steamPlaytimeForever ?? g.playtimeMinutes ?? (g.playtimeHours ? g.playtimeHours * 60 : 0) ?? 0
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/50 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading library...</span>
      </div>
    )
  }

  return (
    <div id="settings-library-section" className="space-y-6">
      {/* Header */}
      <SettingsCard>
        <SectionHeader
          title="Games & Local Media Library"
          description="Manage scanned game titles, DLCs, expansions, demos, betas, mods, soundtracks, and auto-matching."
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          {/* Stats Bar */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-white">
              <Gamepad2 className="h-4 w-4 text-primary" />
              <span className="font-bold">{stats.total}</span>
              <span className="text-white/40">Total Items</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-bold">{stats.matched}</span>
              <span className="text-white/40">Matched</span>
            </div>
            {stats.candidates > 0 && (
              <>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-1.5 text-sky-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-bold">{stats.candidates}</span>
                  <span className="text-white/40">Need Review</span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setProvidersModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Manage Providers
          </button>
        </div>
      </SettingsCard>

      {/* Pinned free games — always visible regardless of sort/filter */}
      <SettingsFreeGamesSection />

      {/* ===== PROVIDERS & SCANNERS MODAL ===== */}
      <DkDialog
        open={providersModalOpen}
        onOpenChange={setProvidersModalOpen}
        title="Library Providers"
        description="Configure scanner paths and platform integration providers."
        className="max-w-4xl"
      >
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
          {pluginApi && (
            <PluginSlot location="library:scan" pluginApi={pluginApi} />
          )}
        </div>
      </DkDialog>

      {/* Library Games List */}
      <SettingsCard>
        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-white/40" />
            <input
              type="text"
              placeholder="Search library titles, developers, platforms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-white/5 text-xs text-white placeholder:text-white/30 outline-none focus:bg-white/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-white/40 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Custom DkDropdown for Category / Filter */}
            <DkDropdown
              options={categoryDropdownOptions}
              value={filterTab}
              onChange={(val) => setFilterTab(val as ItemFilter)}
              variant="filter"
              label="Type"
            />

            {/* Custom DkDropdown for Platform */}
            {availablePlatforms.length > 0 && (
              <DkDropdown
                options={platformDropdownOptions}
                value={platformFilter}
                onChange={setPlatformFilter}
                variant="filter"
                label="Platform"
              />
            )}

            {/* Custom DkDropdown for Sort */}
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

            {/* Sort Direction Toggle Button */}
            <button
              type="button"
              onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-white/[0.05] hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer select-none"
              title={sortDir === 'asc' ? 'Ascending (Click for Descending)' : 'Descending (Click for Ascending)'}
            >
              <ArrowUpDown className={cn('h-3.5 w-3.5 transition-transform duration-200', sortDir === 'desc' && 'rotate-180 text-primary')} />
            </button>
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
              <p className="text-xs font-semibold text-white/80">No items found</p>
              <p className="text-[11px] text-white/40 mt-0.5 max-w-xs mx-auto leading-relaxed">
                {searchQuery || filterTab !== 'all' || platformFilter || sortKey !== 'title' || sortDir !== 'asc'
                  ? 'Try clearing active filters.'
                  : 'Click "Providers" above to add local game folders.'}
              </p>
            </div>
            {(searchQuery || filterTab !== 'all' || platformFilter || sortKey !== 'title' || sortDir !== 'asc') && (
              <div className="pt-1">
                <button
                  onClick={() => { setSearchQuery(''); setFilterTab('all'); setPlatformFilter(''); setSortKey('title'); setSortDir('asc') }}
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
              const gt = getGameType(game)

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
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 min-w-0">
                      <div title={game.platform || game.providerName || 'PC'} className="flex items-center justify-center p-1 rounded-md bg-white/5 border border-white/10 shrink-0">
                        <ProviderLogo platform={game.platform || game.providerName || 'pc'} className="h-3.5 w-3.5" />
                      </div>
                      {(gt === 'dlc_addon' || game.isDlc) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          DLC
                        </span>
                      )}
                      {(gt === 'expansion' || gt === 'standalone_expansion') && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          Expansion
                        </span>
                      )}
                      {(gt === 'demo' || game.isDemo) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          Demo
                        </span>
                      )}
                      {(gt === 'beta' || game.isBeta) && (gt !== 'demo' && !game.isDemo) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          Beta
                        </span>
                      )}
                      {gt === 'mod' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          Mod
                        </span>
                      )}
                      {gt === 'soundtrack' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          OST
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
    </div>
  )
}
