import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Gamepad2, Play, Clock, ChevronRight, Settings } from 'lucide-react'
import { useLauncherVisibleGames, useLauncherFoundGames, localGameKeys } from '@/features/launcher/data/game-queries'
import { usePopularGames, gameDetailOptions } from '@/features/launcher/data/queries'
import { fetchGameById } from '@/features/launcher/data/storage'
import { hasDesktopAPI } from '@/lib/desktop/api'
import { toDisplayGame, heroImage } from '@/features/launcher/utils'
import { useHydrateLocalGames } from '@/features/launcher/hooks/use-launcher-hydrate'
import { LauncherMediaCard } from '@/features/launcher/components/molecules/launcher-media-card'
import { LauncherFoundGames } from '@/features/launcher/components/organisms/launcher-found-games'
import { MediaGrid } from '@ui/molecules/media-grid'
import { useOffline } from '@/lib/offline'
import { OfflineNotice } from '@/lib/offline-notice'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { PLATFORM_LABELS } from '@/constants/games'
import { MediaLogo } from '@/lib/media/media-logo'
import type { DisplayGame, LauncherPlatform } from '@/features/launcher/types'

type SortMode = 'recent' | 'title' | 'platform'

export const LauncherLibraryPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isDesktop = hasDesktopAPI()
  useHydrateLocalGames()

  // ── Data ──
  const { data: visibleGames = [] } = useLauncherVisibleGames(
    isDesktop ? { sortBy: 'last_played_at', sortDir: 'desc' } : undefined,
  )
  const { data: foundGames = [] } = useLauncherFoundGames()
  const { data: popularGames = [] } = usePopularGames({ enabled: !isDesktop })

  const rawGames: DisplayGame[] = useMemo(() => {
    const listed = visibleGames.map(toDisplayGame)

    if (isDesktop) return listed

    const popular = popularGames.map((g) => ({
      id: g.id, title: g.title,
      posterUrl: (g as any).textlessPosterUrl ?? g.posterUrl ?? null,
      iconUrl: g.posterUrl ?? g.iconUrl ?? undefined,
      backdropUrl: g.backdropUrl ?? undefined,
      logoUrl: g.logoUrl ?? undefined,
      logoColorGuess: g.logoColorGuess ?? undefined,
      playtime: '', achievements: '', isDefault: false,
      isInstalled: false, platform: 'unknown' as LauncherPlatform,
    }))

    return [...listed, ...popular]
  }, [isDesktop, visibleGames, popularGames])

  // ── State ──
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortMode>('recent')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set())
  const offline = useOffline()
  const { settings } = useLauncherSettings()

  const handlePrefetch = useCallback((game: DisplayGame) => {
    if (isDesktop) {
      if (!game.id.startsWith('server-')) {
        queryClient.prefetchQuery({
          queryKey: localGameKeys.detail(game.id),
          queryFn: () => fetchGameById(game.id),
          staleTime: 30000,
        })
      }
      const catalogId = game.otixMediaId || (game as any).rawGame?.otixMediaId || (game as any).rawGame?.data?.id || (!game.id.startsWith('server-') ? game.id : undefined)
      if (catalogId) queryClient.prefetchQuery(gameDetailOptions(catalogId))
    } else {
      queryClient.prefetchQuery(gameDetailOptions(game.id))
    }
  }, [isDesktop, queryClient])

  const handleLogoError = useCallback((gameId: string) => {
    setLogoErrors((prev) => new Set(prev).add(gameId))
  }, [])

  // ── Derived data ──
  const platforms = useMemo(() => {
    const set = new Set<string>()
    rawGames.forEach((g) => { if (g.platform) set.add(g.platform) })
    return Array.from(set).sort()
  }, [rawGames])

  const filteredGames = useMemo(() => {
    let result = [...rawGames]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) => g.title.toLowerCase().includes(q))
    }
    if (selectedPlatform !== 'all') {
      result = result.filter((g) => g.platform === selectedPlatform)
    }
    result.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'platform') return (a.platform || '').localeCompare(b.platform || '') || a.title.localeCompare(b.title)
      const aT = a.rawGame?.lastPlayedAt ? new Date(a.rawGame.lastPlayedAt).getTime() : 0
      const bT = b.rawGame?.lastPlayedAt ? new Date(b.rawGame.lastPlayedAt).getTime() : 0
      return bT !== aT ? bT - aT : a.title.localeCompare(b.title)
    })
    return result
  }, [rawGames, searchQuery, selectedPlatform, sortBy])

  // ── Featured hero (static, first game) ──
  const featuredGames = useMemo(() => filteredGames.slice(0, 5), [filteredGames])
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const featured = featuredGames[featuredIdx] ?? null

  useEffect(() => { setFeaturedIdx(0) }, [searchQuery, selectedPlatform, sortBy])

  // Featured

  const featuredBackdrop = useMemo(() => {
    if (!settings.backgroundTransitions || !featured) return null
    const url = featured.backdropUrl || featured.posterUrl
    return url ? heroImage(url) : null
  }, [featured, settings.backgroundTransitions])

  // Hovered card backdrop
  const hoveredGame = useMemo(() => hoveredId ? rawGames.find(g => g.id === hoveredId) ?? null : null, [hoveredId, rawGames])
  const hoveredBackdrop = useMemo(() => {
    if (!settings.backgroundTransitions || !hoveredGame) return null
    const url = hoveredGame.backdropUrl || hoveredGame.posterUrl
    return url ? heroImage(url) : null
  }, [hoveredGame, settings.backgroundTransitions])

  const gridGames = filteredGames

  const openGame = useCallback((id: string) => {
    navigate({ to: '/launcher/$gameId', params: { gameId: id } })
  }, [navigate])

  return (
    <div className="w-full h-screen bg-background bg-grid-pattern text-foreground select-none overflow-hidden relative">

      {offline && (
        <div className="absolute top-14 right-6 z-40">
          <OfflineNotice />
        </div>
      )}

      {/* ═══════════ Ambient background ═══════════ */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.div
            key={hoveredBackdrop || featuredBackdrop || 'none'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            {(hoveredBackdrop || featuredBackdrop) && (
              <div
                className="absolute -inset-[20%] bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url(${hoveredBackdrop || featuredBackdrop})`,
                  filter: 'blur(80px) brightness(0.4) saturate(0.6)',
                  opacity: hoveredBackdrop ? 0.35 : 0.2,
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ═══════════ Scrollable content ═══════════ */}
      <div
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden"
        style={{ paddingLeft: 'calc(76px + 1.5rem)', paddingRight: '2rem' }}
      >
        <div className="flex flex-col gap-0 pt-20 pb-12 max-w-[1600px]">

          {/* ────────── Featured Hero ────────── */}
          {featured && featuredBackdrop && !searchQuery && (
            <section
              className="relative w-full h-[340px] rounded-3xl overflow-hidden mb-8 group/hero cursor-pointer"
              onClick={() => openGame(featured.id)}
              onMouseEnter={() => handlePrefetch(featured)}
              style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06), 0 12px 48px rgb(0 0 0 / 0.5)' }}
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={featuredBackdrop}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat group-hover/hero:scale-[1.03] transition-transform duration-[2s] ease-out"
                    style={{ backgroundImage: `url(${featuredBackdrop})` }}
                  />
                </motion.div>
              </AnimatePresence>

              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent z-[1]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 z-[1]" />

              <AnimatePresence mode="wait">
                <motion.div
                  key={featured.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0 z-10 flex items-end p-8"
                >
                  <div className="flex-1 min-w-0">
                    {/* Featured hero logo */}
                    {featured.logoUrl && !logoErrors.has(featured.id) ? (
                      <div className="relative inline-block mb-4 pointer-events-none">
                        <div
                          className="absolute -inset-6 pointer-events-none opacity-80"
                          style={{
                            background:
                              'radial-gradient(ellipse at left center, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 80%)',
                          }}
                        />
                        <MediaLogo
                          src={featured.logoUrl!}
                          alt={featured.title}
                          className="relative z-10 h-24 max-w-[320px] object-contain object-left"
                          colorGuess={featured.logoColorGuess ?? null}
                          background="dark"
                          shadow="drop-shadow(0 3px 6px rgba(0,0,0,0.95)) drop-shadow(0 8px 32px rgba(0,0,0,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))"
                          onError={() => handleLogoError(featured.id)}
                        />
                      </div>
                    ) : (
                      <h2 className="text-3xl font-black text-white tracking-tight mb-2 drop-shadow-lg line-clamp-1">
                        {featured.title}
                      </h2>
                    )}
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[9px] uppercase tracking-[0.25em] font-bold"
                        style={{ color: 'oklch(0.705 0.213 47.604)' }}
                      >
                        {PLATFORM_LABELS[featured.platform] ?? featured.platform}
                      </span>
                      {featured.rawGame?.lastPlayedAt && (
                        <span className="text-[10px] text-white/40 flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(featured.rawGame.lastPlayedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-6">
                    <button
                      className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider text-white cursor-pointer transition-all active:scale-95 hover:brightness-110"
                      style={{ background: 'oklch(0.705 0.213 47.604)', boxShadow: '0 0 24px oklch(0.705 0.213 47.604 / 0.35)' }}
                      onClick={(e) => { e.stopPropagation(); openGame(featured.id) }}
                    >
                      <Play size={14} fill="white" />
                      Launch
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-[11px] font-semibold text-white/70 cursor-pointer transition-all active:scale-95 bg-white/8 hover:bg-white/12 border border-white/10 backdrop-blur-md"
                      onClick={(e) => { e.stopPropagation(); openGame(featured.id) }}
                    >
                      Details
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              {featuredGames.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
                  {featuredGames.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setFeaturedIdx(i) }}
                      className="cursor-pointer transition-all"
                      style={{
                        width: i === featuredIdx ? 20 : 6, height: 6, borderRadius: 9999,
                        background: i === featuredIdx ? 'oklch(0.705 0.213 47.604)' : 'rgb(255 255 255 / 0.25)',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ────────── Toolbar ────────── */}
          <div className="glass-card flex items-center gap-3 px-4 py-2.5 mb-6">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] focus:bg-[var(--dk-surface-ghost-active)] rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors border-none"
              />
            </div>
            <div className="w-px self-stretch bg-[var(--dk-separator)]" />
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink min-w-0">
              {['all', ...platforms].map((plat) => (
                <button
                  key={plat}
                  onClick={() => setSelectedPlatform(plat)}
                  className={`glass-tab px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider cursor-pointer transition-all whitespace-nowrap ${
                    selectedPlatform === plat ? 'glass-tab-active bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {plat === 'all' ? 'All' : (PLATFORM_LABELS[plat] ?? plat)}
                </button>
              ))}
            </div>
            <div className="w-px self-stretch bg-[var(--dk-separator)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="appearance-none bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-[9px] text-muted-foreground rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors font-semibold uppercase tracking-wider border-none shrink-0"
            >
              <option value="recent">Recent</option>
              <option value="title">A – Z</option>
              <option value="platform">Platform</option>
            </select>
            <span className="text-[9px] text-muted-foreground font-semibold tabular-nums shrink-0">
              {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
            </span>
            <div className="w-px self-stretch bg-[var(--dk-separator)]" />
            <button
              onClick={() => navigate({ to: '/settings/launcher' })}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-field)] transition-all active:scale-95 cursor-pointer"
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>

          {/* ────────── Game Grid ────────── */}
          {gridGames.length > 0 ? (
            <MediaGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {gridGames.map((game) => (
                <LauncherMediaCard
                  key={game.id}
                  game={game}
                  onClick={() => {
                    handlePrefetch(game)
                    openGame(game.id)
                  }}
                  onMouseEnter={() => {
                    setHoveredId(game.id)
                    handlePrefetch(game)
                  }}
                  onMouseLeave={() => setHoveredId(null)}
                />
              ))}
            </MediaGrid>
          ) : foundGames.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
              <Gamepad2 size={44} className="animate-pulse" style={{ animationDuration: '3s' }} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {rawGames.length === 0 ? 'No Games Yet' : 'No Games Found'}
              </h3>
              <p className="text-[10px] text-muted-foreground max-w-sm text-center leading-relaxed">
                {rawGames.length === 0
                  ? isDesktop
                    ? 'Connect a platform like Epic or Steam in Integrations, or scan a game folder, and your library will appear here.'
                    : 'Connect a platform launcher to populate your library.'
                  : searchQuery
                    ? `No games match “${searchQuery}”. Try a different search.`
                    : 'No games match the selected platform. Try a different filter.'}
              </p>
              {rawGames.length === 0 ? (
                <button
                  onClick={() => navigate({ to: '/settings/connections' })}
                  className="flex items-center gap-2 mt-1 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-foreground cursor-pointer transition-all active:scale-95 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]"
                >
                  <Settings size={12} />
                  Open Connections
                </button>
              ) : (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedPlatform('all') }}
                  className="flex items-center gap-2 mt-1 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-foreground cursor-pointer transition-all active:scale-95 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)]"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : null}

          <LauncherFoundGames className="mt-8" />

          <div className="h-12" />
        </div>
      </div>
    </div>
  )
};
