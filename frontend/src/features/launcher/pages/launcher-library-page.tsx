import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Gamepad2, Play, Clock, ChevronRight, Settings } from 'lucide-react'
import { useLocalGames, localGameKeys } from '@/features/launcher/data/game-queries'
import { usePopularGames, gameDetailOptions } from '@/features/launcher/data/queries'
import { fetchGameById } from '@/features/launcher/data/storage'
import { hasDesktopAPI } from '@/lib/desktop/api'
import { toDisplayGame, heroImage } from '@/features/launcher/utils'
import { useInactiveSlideshow } from '@/features/launcher/hooks/use-inactive-slideshow'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import type { DisplayGame, LauncherPlatform } from '@/features/launcher/types'

type SortMode = 'recent' | 'title' | 'platform'

const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam', epic: 'Epic', gog: 'GOG', battlenet: 'Battle.net',
  ubisoft: 'Ubisoft', origin: 'Origin', ea: 'EA', riot: 'Riot',
  xbox: 'Xbox', itch: 'Itch', pc: 'PC', iso: 'ISO', unknown: 'Other',
}

export function LauncherLibraryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isDesktop = hasDesktopAPI()

  // ── Data ──
  const { data: localGames = [] } = useLocalGames(
    isDesktop ? { installed: true, sortBy: 'last_played_at', sortDir: 'desc' } : undefined,
  )
  const { data: popularGames = [] } = usePopularGames()

  const rawGames: DisplayGame[] = useMemo(() => {
    if (isDesktop) return localGames.map(toDisplayGame).filter((g) => g.isInstalled)
    return popularGames.map((g) => ({
      id: g.id, title: g.title,
      posterUrl: (g as any).textlessPosterUrl ?? g.posterUrl ?? null,
      iconUrl: g.posterUrl ?? g.iconUrl ?? undefined,
      backdropUrl: g.backdropUrl ?? undefined,
      logoUrl: g.logoUrl ?? undefined,
      playtime: '', achievements: '', isDefault: false,
      isInstalled: false, platform: 'unknown' as LauncherPlatform,
    }))
  }, [isDesktop, localGames, popularGames])

  // ── State ──
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortMode>('recent')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set())
  const { settings } = useLauncherSettings()

  const handlePrefetch = useCallback((game: DisplayGame) => {
    if (isDesktop) {
      queryClient.prefetchQuery({
        queryKey: localGameKeys.detail(game.id),
        queryFn: () => fetchGameById(game.id),
        staleTime: 30000,
      })
      const catalogId = game.otixMediaId || (game as any).rawGame?.otixMediaId || (game as any).rawGame?.data?.id
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

  // ── Featured hero with inactivity auto-slideshow ──
  const featuredGames = useMemo(() => filteredGames.slice(0, 5), [filteredGames])
  const {
    activeIndex: featuredIdx,
    setActiveIndex: setFeaturedIdx,
  } = useInactiveSlideshow({
    totalItems: featuredGames.length,
    slideInterval: 5000,
    enabled: settings.slideshowWhenInactive,
  })
  const featured = featuredGames[featuredIdx] ?? null

  useEffect(() => { setFeaturedIdx(0, true) }, [searchQuery, selectedPlatform, sortBy, setFeaturedIdx])

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
    <div className="w-full h-screen bg-neutral-950 bg-grid-pattern text-white select-none overflow-hidden relative">

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
                      <img
                        src={featured.logoUrl}
                        alt={featured.title}
                        className="h-24 max-w-[320px] object-contain object-left mb-4 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
                        onError={() => handleLogoError(featured.id)}
                      />
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
                      onClick={(e) => { e.stopPropagation(); setFeaturedIdx(i, true) }}
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={14} />
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] focus:bg-[var(--dk-surface-ghost-active)] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/25 outline-none transition-colors border-none"
              />
            </div>
            <div className="w-px self-stretch bg-[var(--dk-separator)]" />
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink min-w-0">
              {['all', ...platforms].map((plat) => (
                <button
                  key={plat}
                  onClick={() => setSelectedPlatform(plat)}
                  className={`glass-tab px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider cursor-pointer transition-all whitespace-nowrap ${
                    selectedPlatform === plat ? 'glass-tab-active text-black' : 'text-white/40 hover:text-white/70'
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
              className="appearance-none bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-[9px] text-white/50 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors font-semibold uppercase tracking-wider border-none shrink-0"
            >
              <option value="recent">Recent</option>
              <option value="title">A – Z</option>
              <option value="platform">Platform</option>
            </select>
            <span className="text-[9px] text-white/25 font-semibold tabular-nums shrink-0">
              {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
            </span>
            <div className="w-px self-stretch bg-[var(--dk-separator)]" />
            <button
              onClick={() => navigate({ to: '/settings/launcher' })}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all active:scale-95 cursor-pointer"
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>

          {/* ────────── Game Grid ────────── */}
          {gridGames.length > 0 ? (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
            >
              {gridGames.map((game) => {
                const hasLogo = !!game.logoUrl && !logoErrors.has(game.id)
                // Prefer textless poster so the logo hover pops cleanly
                const cardPoster = game.rawGame?.otixTextlessPosterUrl || game.rawGame?.textlessPosterUrl || game.rawGame?.data?.textlessPosterUrl || game.posterUrl

                return (
                  <motion.div
                    key={game.id}
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.97 },
                      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
                    }}
                    onMouseEnter={() => { setHoveredId(game.id); handlePrefetch(game) }}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openGame(game.id)}
                    className="group relative cursor-pointer rounded-2xl overflow-hidden aspect-[2/3] transition-all duration-300 hover:-translate-y-1.5"
                    style={{
                      boxShadow: hoveredId === game.id
                        ? 'inset 0 0 0 1px rgb(255 255 255 / 0.15), 0 16px 48px rgb(0 0 0 / 0.6)'
                        : 'inset 0 0 0 1px rgb(255 255 255 / 0.06), 0 4px 16px rgb(0 0 0 / 0.3)',
                      transition: 'box-shadow 0.3s, transform 0.3s cubic-bezier(0.16,1,0.3,1)',
                    }}
                  >
                    {/* Poster — prefer textless so logo hover doesn't double up */}
                    {cardPoster ? (
                      <img
                        src={cardPoster}
                        alt={game.title}
                        className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-700 ease-out"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full bg-[var(--dk-surface-ghost)] flex flex-col items-center justify-center gap-3 text-white/15">
                        <Gamepad2 size={36} />
                        <span className="text-[10px] text-center font-bold px-4 uppercase tracking-wider leading-tight line-clamp-2">
                          {game.title}
                        </span>
                      </div>
                    )}

                    {/* ── Hover overlay with logo ── */}
                    <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      {/* Dark vignette */}
                      <div className="absolute inset-0 bg-black/60" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30" />

                      {/* Center content: logo + play button */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
                        {/* Game logo — fades up on hover */}
                        {hasLogo && (
                          <img
                            src={game.logoUrl!}
                            alt={game.title}
                            className="max-h-[35%] max-w-[70%] object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] translate-y-3 group-hover:translate-y-0 transition-transform duration-500 ease-out"
                            style={{ transitionDelay: '50ms' }}
                            onError={() => handleLogoError(game.id)}
                          />
                        )}

                        {/* Play circle — scales up beneath the logo */}
                        <div
                          className="rounded-full flex items-center justify-center scale-50 group-hover:scale-100 transition-all duration-300"
                          style={{
                            width: 48, height: 48,
                            background: 'oklch(0.705 0.213 47.604)',
                            boxShadow: '0 0 32px oklch(0.705 0.213 47.604 / 0.5)',
                            transitionDelay: '80ms',
                          }}
                        >
                          <Play size={20} fill="white" color="white" className="ml-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* ── Bottom info bar ── */}
                    <div className="absolute inset-x-0 bottom-0 z-[15]">
                      <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-16 pb-3 px-4 transition-opacity duration-300 group-hover:opacity-0">
                        <h3 className="text-[13px] font-bold text-white truncate drop-shadow-md">
                          {game.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] uppercase tracking-wider font-semibold text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded-full border border-white/[0.04]">
                            {PLATFORM_LABELS[game.platform] ?? game.platform}
                          </span>
                          {game.playtime && game.playtime !== '—' && (
                            <span className="text-[8px] text-white/30 flex items-center gap-0.5">
                              <Clock size={7} />
                              {game.playtime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Gloss sweep */}
                    <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1.2s] ease-out" />

                    {/* Installed dot */}
                    {game.isInstalled && (
                      <div
                        className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full z-20"
                        style={{ background: 'var(--color-accent)', boxShadow: '0 0 8px var(--color-accent)' }}
                      />
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          ) : (
            <div className="glass-card flex flex-col items-center justify-center py-24 text-white/20 gap-4">
              <Gamepad2 size={44} className="animate-pulse" style={{ animationDuration: '3s' }} />
              <h3 className="text-xs font-bold uppercase tracking-wider">No Games Found</h3>
              <p className="text-[10px] text-white/35">
                {searchQuery ? 'Try a different search term.' : 'No games match the selected filters.'}
              </p>
            </div>
          )}

          <div className="h-12" />
        </div>
      </div>
    </div>
  )
}
